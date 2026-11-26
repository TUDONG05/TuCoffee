package com.tuscoffee;

import static org.junit.jupiter.api.Assertions.*;

import com.tuscoffee.dto.OrderDtos.CancelOrderRequest;
import com.tuscoffee.dto.OrderDtos.CreateOrderItemRequest;
import com.tuscoffee.dto.OrderDtos.CreateOrderRequest;
import com.tuscoffee.dto.OrderDtos.OrderResponse;
import com.tuscoffee.entity.Category;
import com.tuscoffee.entity.Product;
import com.tuscoffee.entity.User;
import com.tuscoffee.exception.ApiException;
import com.tuscoffee.repository.CategoryRepository;
import com.tuscoffee.repository.ProductRepository;
import com.tuscoffee.repository.UserRepository;
import com.tuscoffee.service.OrderService;
import com.tuscoffee.service.VoucherService;
import com.tuscoffee.service.VoucherService.GrantInput;
import com.tuscoffee.service.VoucherService.GroupInput;
import com.tuscoffee.service.VoucherService.QuoteInput;
import com.tuscoffee.service.VoucherService.VoucherInput;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(properties = {"spring.config.import=", "catalog.seed.enabled=false"})
class VoucherCheckoutIntegrationTests extends MySqlIntegrationSupport {
    @Autowired VoucherService vouchers;
    @Autowired OrderService orders;
    @Autowired UserRepository users;
    @Autowired CategoryRepository categories;
    @Autowired ProductRepository products;

    @Test
    void groupGrantProtectsLastUseAndCancellationReleasesIt() throws Exception {
        long admin = user("ADMIN");
        long first = user("USER");
        long second = user("USER");
        long excluded = user("USER");
        var category = categories.save(new Category("Voucher test", UUID.randomUUID().toString()));
        var product = products.save(new Product(category, "Voucher coffee", null, 35_000));
        var lines = List.of(new CreateOrderItemRequest(product.getId(), 2, 35_000L));
        String groupName = UUID.randomUUID().toString();
        vouchers.saveGroup(null, new GroupInput(groupName, List.of(first, second)));
        long group = vouchers.groups().stream().filter(g -> g.name().equals(groupName)).findFirst().orElseThrow().id();
        String code = "V" + UUID.randomUUID().toString().replace("-", "").toUpperCase(java.util.Locale.ROOT);
        var now = Instant.now();
        vouchers.save(null, new VoucherInput(code, "Voucher test", "", "FIXED", 10_000, 0, null,
                now.minusSeconds(60), now.plusSeconds(3600), 1, 1, true, true, false, 0));
        long id = vouchers.vouchers().stream().filter(v -> v.code().equals(code)).findFirst().orElseThrow().id();
        assertEquals(2, vouchers.grant(id, admin, new GrantInput("GROUP", group)));
        assertEquals(0, vouchers.grant(id, admin, new GrantInput("GROUP", group)));
        assertTrue(vouchers.promotions(first).stream().anyMatch(v -> v.id() == id));
        assertFalse(vouchers.promotions(excluded).stream().anyMatch(v -> v.id() == id));
        assertFalse(vouchers.promotions().stream().anyMatch(v -> v.id() == id));
        var denied = assertThrows(ApiException.class, () -> vouchers.quote(excluded, new QuoteInput(id, lines)));
        assertEquals(403, denied.status());
        assertEquals("VOUCHER_NOT_ASSIGNED", denied.code());
        assertEquals(60_000, vouchers.quote(first, new QuoteInput(id, lines)).totalVnd());

        var start = new CountDownLatch(1);
        var request = new CreateOrderRequest(lines, "Buyer", "0901234567", "Address", null, "CASH", id, 60_000L);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var a = pool.submit(() -> attempt(first, request, start));
            var b = pool.submit(() -> attempt(second, request, start));
            start.countDown();
            var left = a.get(10, TimeUnit.SECONDS);
            var right = b.get(10, TimeUnit.SECONDS);
            assertNotEquals(left == null, right == null);
            var accepted = left == null ? right : left;
            long buyer = left == null ? second : first;
            assertNotNull(accepted);
            assertEquals(60_000, accepted.payment().amountVnd());
            assertFalse(vouchers.promotions(buyer).stream().anyMatch(v -> v.id() == id));
            orders.cancelMyOrder(accepted.id(), buyer, new CancelOrderRequest(accepted.version(), "Test"));
            var next = orders.createOnlineOrder(left == null ? first : second, UUID.randomUUID().toString(), request, null);
            assertEquals(60_000, next.totalVnd());
        }
    }

    private long user(String role) {
        return users.save(new User("Voucher test", UUID.randomUUID() + "@example.test", "hash", role)).getId();
    }

    private OrderResponse attempt(long user, CreateOrderRequest request, CountDownLatch start) throws InterruptedException {
        assertTrue(start.await(5, TimeUnit.SECONDS));
        try {
            return orders.createOnlineOrder(user, UUID.randomUUID().toString(), request, null);
        } catch (ApiException ex) {
            assertEquals("VOUCHER_LIMIT_REACHED", ex.code());
            return null;
        }
    }
}
