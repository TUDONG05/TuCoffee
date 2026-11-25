package com.tuscoffee;

import static org.junit.jupiter.api.Assertions.*;
import com.tuscoffee.dto.ReviewDtos.*;
import com.tuscoffee.entity.*;
import com.tuscoffee.exception.ApiException;
import com.tuscoffee.repository.*;
import com.tuscoffee.service.ReviewService;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.annotation.Transactional;
@SpringBootTest(properties = {
    "spring.config.import=", "catalog.seed.enabled=false"
}
) @Transactional class ReviewIntegrationTests extends MySqlIntegrationSupport {
    @Autowired ReviewService service;
    @Autowired ReviewRepository reviews;
    @Autowired UserRepository users;
    @Autowired ProductRepository products;
    @Autowired CategoryRepository categories;
    @Autowired OrderRepository orders;
    @Autowired OrderItemRepository items;
    @Autowired EntityManager entityManager;
    @Autowired org.springframework.transaction.PlatformTransactionManager transactionManager;
    private User user(String role) {
        String key = UUID.randomUUID().toString();
        return users.saveAndFlush(new User(role, key+"@example.com", "hash", role));
    }

    private Product product() {
        var category = categories.saveAndFlush(new Category("Coffee", "c-"+UUID.randomUUID()));
        return products.saveAndFlush(new Product(category, "Latte", null, 50000));
    }

    private Order purchase(User buyer, Product product, boolean completed) {
        var order = new Order("R-"+UUID.randomUUID(), buyer, null, buyer, "ONLINE", 50000, buyer.getName(), null, null, null);
        if (completed) order.markCompleted();
        orders.saveAndFlush(order);
        items.saveAndFlush(new OrderItem(order, product, product.getName(), 50000, 1));
        return order;
    }

    @Test void completedBuyerCanEditButModerationRemainsHiddenAndSummaryTracksVisibility() {
        var buyer = user("USER");
        var outsider = user("USER");
        var admin = user("ADMIN");
        var product = product();
        purchase(buyer, product, false);
        assertFalse(service.mine(product.getId(), buyer.getId()).eligible());
        assertEquals(403, assertThrows(ApiException.class, () -> service.write(product.getId(), buyer.getId(), new WriteReview(BigDecimal.valueOf(5), "Nice", null))).status());
        purchase(buyer, product, true);
        var created = service.write(product.getId(), buyer.getId(), new WriteReview(BigDecimal.valueOf(5), "<b>Nice</b>", null));
        assertEquals(1, service.publicPage(product.getId(), 0, 10).summary().count());
        assertEquals(5, service.publicPage(product.getId(), 0, 10).summary().average());
        assertEquals(403, assertThrows(ApiException.class, () -> service.write(product.getId(), outsider.getId(), new WriteReview(BigDecimal.ONE, "Other", created.version()))).status());
        var hidden = service.moderate(created.id(), admin.getId(), new ModerateReview(false, "Policy", created.version()));
        assertTrue(hidden.version()>created.version());
        var edited = service.write(product.getId(), buyer.getId(), new WriteReview(BigDecimal.valueOf(2), "Edited", hidden.version()));
        assertFalse(edited.visible());
        assertEquals(created.id(), edited.id());
        var publicPage = service.publicPage(product.getId(), 0, 10);
        assertEquals(0, publicPage.totalItems());
        assertEquals(0, publicPage.summary().count());
        assertEquals(0, publicPage.summary().average());
        assertEquals(409, assertThrows(ApiException.class, () -> service.moderate(created.id(), admin.getId(), new ModerateReview(true, "Restore", hidden.version()))).status());
        var restored = service.moderate(created.id(), admin.getId(), new ModerateReview(true, "Restore", edited.version()));
        assertEquals(2, service.publicPage(product.getId(), 0, 10).summary().average());
        var detail = service.detail(restored.id());
        assertEquals(2, detail.events().size());
        assertEquals(restored.version(), detail.events().getFirst().reviewVersion());
        assertEquals("Edited", restored.comment());
        assertEquals(1, service.adminPage(product.getId(), 2, true, 0, 20).totalItems());
        assertEquals(0, service.adminPage(product.getId(), 5, null, 0, 20).totalItems());
    }

    @Test void databaseUniqueConstraintPreventsDuplicateBuyerProductReview() {
        var buyer = user("USER");
        var product = product();
        purchase(buyer, product, true);
        service.write(product.getId(), buyer.getId(), new WriteReview(BigDecimal.ONE, "First", null));
        assertThrows(DataIntegrityViolationException.class, () -> reviews.saveAndFlush(new Review(buyer, product, 5, "Duplicate")));
    }

    @Test
    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.NOT_SUPPORTED)
    void concurrentFirstReviewsCreateOneRecordAndRejectStaleWriter() throws Exception {
        var transaction = new org.springframework.transaction.support.TransactionTemplate(transactionManager);
        long[] ids = transaction.execute(status -> {
            var buyer = user("USER");
            var product = product();
            purchase(buyer, product, true);
            return new long[]{buyer.getId(), product.getId()};
        });
        var ready = new java.util.concurrent.CountDownLatch(2);
        var go = new java.util.concurrent.CountDownLatch(1);
        try (var pool = java.util.concurrent.Executors.newFixedThreadPool(2)) {
            java.util.concurrent.Callable<Integer> write = () -> {
                ready.countDown();
                assertTrue(go.await(5, java.util.concurrent.TimeUnit.SECONDS));
                try {
                    service.write(ids[1], ids[0], new WriteReview(BigDecimal.valueOf(5), "Concurrent", null));
                    return 200;
                } catch (ApiException conflict) {
                    return conflict.status();
                }
            };
            var first = pool.submit(write);
            var second = pool.submit(write);
            assertTrue(ready.await(5, java.util.concurrent.TimeUnit.SECONDS));
            go.countDown();
            var statuses = java.util.List.of(first.get(10, java.util.concurrent.TimeUnit.SECONDS),
                    second.get(10, java.util.concurrent.TimeUnit.SECONDS));
            assertEquals(1, statuses.stream().filter(s -> s == 200).count());
            assertEquals(1, statuses.stream().filter(s -> s == 409).count());
            assertEquals(1, service.publicPage(ids[1], 0, 10).totalItems());
        }
    }
}
