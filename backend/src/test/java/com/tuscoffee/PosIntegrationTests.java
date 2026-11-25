package com.tuscoffee;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;

import com.tuscoffee.dto.OrderDtos.*;
import com.tuscoffee.entity.*;
import com.tuscoffee.repository.*;
import com.tuscoffee.service.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

@SpringBootTest(properties={"spring.config.import=", "catalog.seed.enabled=false"})
class PosIntegrationTests extends MySqlIntegrationSupport {
    @Autowired OrderService orders;
    @Autowired OrderRepository orderRepo;
    @Autowired UserRepository users;
    @Autowired CategoryRepository categories;
    @Autowired ProductRepository products;
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager manager;
    @Autowired WebApplicationContext context;

    record Fixture(long admin, long product, CreateOrderRequest request) {}
    Fixture fixture() {
        return new TransactionTemplate(manager).execute(tx -> {
            var admin = users.save(new User("POS", UUID.randomUUID()+"@example.com", "hash", "ADMIN"));
            var category = categories.save(new Category("POS", "pos-"+UUID.randomUUID()));
            var product = products.save(new Product(category, "Original coffee", null, 35000));
            var other = products.save(new Product(category, "Second coffee", null, 35000));
            return new Fixture(admin.getId(), product.getId(), new CreateOrderRequest(
                    List.of(new CreateOrderItemRequest(product.getId(), 1, 35000L), new CreateOrderItemRequest(other.getId(), 1, 35000L)), "Guest", null, null, null, "CASH"));
        });
    }

    @Test void simultaneousIdempotentPosCreatesOneOrderAndReceiptKeepsSnapshots() throws Exception {
        var f = fixture();
        var pool = Executors.newFixedThreadPool(2);
        var ready = new CountDownLatch(2);
        var go = new CountDownLatch(1);
        Callable<OrderResponse> task = () -> {
            ready.countDown();
            assertTrue(go.await(5, TimeUnit.SECONDS));
            return orders.createPosOrder(f.admin(), "same-key", f.request());
        };
        try {
            var first = pool.submit(task);
            var second = pool.submit(task);
            assertTrue(ready.await(5, TimeUnit.SECONDS));
            go.countDown();
            var response = first.get(15, TimeUnit.SECONDS);
            assertEquals(response.id(), second.get(15, TimeUnit.SECONDS).id());
            assertEquals(1, jdbc.queryForObject("select count(*) from orders where created_by = ?", Integer.class, f.admin()));
            assertEquals(1, jdbc.queryForObject("select count(*) from order_requests where creator_id = ?", Integer.class, f.admin()));
            new TransactionTemplate(manager).executeWithoutResult(tx -> {
                var order = orderRepo.findById(response.id()).orElseThrow();
                assertNull(order.getBuyer());
                assertEquals(f.admin(), order.getOperator().getId());
                var product = products.findById(f.product()).orElseThrow();
                product.update(product.getCategory(), "Changed coffee", null, 99000);
                product.setActive(false);
            });
            var receipt = orders.getPosReceipt(response.id());
            assertEquals(70000, receipt.totalVnd());
            assertEquals("Original coffee", receipt.items().get(0).productName());
            assertEquals(35000, receipt.items().get(0).unitPriceVnd());
        } finally { pool.shutdownNow(); }
    }

    @Test void posLifecycleRequiresPaymentAndUsesExistingConfirmationStateMachine() {
        var f = fixture();
        var request = f.request();
        var qr = new CreateOrderRequest(request.items(), request.customerName(), null, null, null, "QR_TRANSFER");
        var created = orders.createPosOrder(f.admin(), "qr-lifecycle", qr);
        var confirmed = orders.adminUpdateStatus(created.id(), f.admin(),
                new AdminUpdateOrderStatusRequest("CONFIRMED", created.version(), null));
        assertEquals(409, assertThrows(com.tuscoffee.exception.ApiException.class,
                () -> orders.adminUpdateStatus(confirmed.id(), f.admin(),
                        new AdminUpdateOrderStatusRequest("COMPLETED", confirmed.version(), null))).status());
        var paid = orders.adminConfirmPayment(confirmed.id(), f.admin(),
                new AdminConfirmPaymentRequest(70000L, "BANK-"+UUID.randomUUID(), confirmed.version(), "confirm-"+UUID.randomUUID()));
        var completed = orders.adminUpdateStatus(paid.id(), f.admin(),
                new AdminUpdateOrderStatusRequest("COMPLETED", paid.version(), null));
        assertEquals("PAID", completed.payment().status());
        assertEquals("COMPLETED", completed.status());
        assertNotNull(completed.completedAt());
        var receipt = orders.getPosReceipt(completed.id());
        assertEquals(completed.id(), receipt.id());
        assertEquals(completed.status(), receipt.status());
        assertEquals(completed.totalVnd(), receipt.totalVnd());
        assertEquals(completed.payment().id(), receipt.payment().id());
        assertEquals(completed.payment().status(), receipt.payment().status());
    }

    @Test void posRoutesRejectAnonymousAndRegularUsersAndRequireCsrf() throws Exception {
        var mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
        mvc.perform(get("/api/v1/admin/pos/orders/1/receipt")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/admin/pos/orders/1/receipt").with(user("buyer").roles("USER"))).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/admin/pos/orders").with(user("admin").roles("ADMIN"))
                .contentType("application/json").content("{}")).andExpect(status().isForbidden());
    }
}
