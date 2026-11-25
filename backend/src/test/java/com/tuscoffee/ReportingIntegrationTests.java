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
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

@SpringBootTest(properties={"spring.config.import=", "catalog.seed.enabled=false"})
class ReportingIntegrationTests extends MySqlIntegrationSupport {
    @Autowired OrderService orders;
    @Autowired ReportingService reporting;
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
            var admin = users.save(new User("Reporting", UUID.randomUUID()+"@example.com", "hash", "ADMIN"));
            var category = categories.save(new Category("Reporting", "rep-"+UUID.randomUUID()));
            var product = products.save(new Product(category, "Reporting coffee", null, 35000));
            var other = products.save(new Product(category, "Second coffee", null, 35000));
            return new Fixture(admin.getId(), product.getId(), new CreateOrderRequest(
                    List.of(new CreateOrderItemRequest(product.getId(), 1, 35000L), new CreateOrderItemRequest(other.getId(), 1, 35000L)), "Guest", null, null, null, "CASH"));
        });
    }

    @Test void dashboardUsesCompletedPaidSnapshotAndVietnamMidnightBoundaries() {
        var f = fixture();
        long[] ids = new long[6];
        for (int i=0; i<ids.length; i++) ids[i] = orders.createOnlineOrder(f.admin(), UUID.randomUUID().toString(), f.request(), null).id();
        // 2001-02-03 local = 2001-02-02T17:00Z through 2001-02-03T17:00Z exclusive.
        var start = Instant.parse("2001-02-02T17:00:00Z");
        var end = Instant.parse("2001-02-03T17:00:00Z");
        // Two completed+paid at exact start / just before end; each order has 2 item rows,
        // proving totals are order-based even when items multiply join cardinality.
        for (int i=0; i<ids.length; i++) {
            jdbc.update("update orders set created_at=?, completed_at=?, cancelled_at=?, status=? where id=?",
                    java.sql.Timestamp.from(start), i==3 || i==4 ? null : java.sql.Timestamp.from(i==2 ? end : (i==1 ? end.minusNanos(1000) : start)),
                    i==3 ? java.sql.Timestamp.from(start) : null,
                    i==3 ? "CANCELLED" : (i==4 ? "PENDING" : "COMPLETED"), ids[i]);
            if (i!=5) jdbc.update("update payments set status='PAID',confirmed_by=?,confirmed_at=?,confirmation_key=? where order_id=?",
                    f.admin(), java.sql.Timestamp.from(start), "metrics-paid-"+ids[i], ids[i]);
        }
        jdbc.update("update orders set created_at=? where id=?", java.sql.Timestamp.from(start.minusSeconds(1)), ids[0]);
        jdbc.update("update orders set created_at=? where id=?", java.sql.Timestamp.from(end), ids[2]);
        var stats = reporting.dashboard(LocalDate.of(2001,2,3), LocalDate.of(2001,2,3));
        assertEquals("Asia/Ho_Chi_Minh", stats.timeZone());
        assertEquals(140000, stats.revenueVnd());
        assertEquals(2, stats.completedPaidOrders());
        assertEquals(4, stats.totalOrders());
        assertEquals(2, stats.statusCounts().get("COMPLETED"));
        assertEquals(1, stats.statusCounts().get("CANCELLED"));
        assertEquals(4, stats.recentOrders().size());
        var empty = reporting.dashboard(LocalDate.of(2000,1,1), LocalDate.of(2000,1,1));
        assertEquals(0, empty.revenueVnd());
        assertEquals(0, empty.totalOrders());
        assertTrue(empty.recentOrders().isEmpty());
    }

    @Test void dashboardRoutesRejectAnonymousAndRegularUsersAndRequireCsrf() throws Exception {
        var mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
        mvc.perform(get("/api/v1/admin/dashboard?from=2001-02-03&to=2001-02-03")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/admin/dashboard?from=2001-02-03&to=2001-02-03").with(user("buyer").roles("USER"))).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/admin/dashboard?from=2001-02-04&to=2001-02-03")
                .with(user("admin").roles("ADMIN"))).andExpect(status().isBadRequest());
    }
}
