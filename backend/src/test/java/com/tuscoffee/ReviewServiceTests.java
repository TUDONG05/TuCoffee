package com.tuscoffee;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.tuscoffee.dto.ReviewDtos.*;
import com.tuscoffee.entity.*;
import com.tuscoffee.exception.ApiException;
import com.tuscoffee.repository.*;
import com.tuscoffee.service.ReviewService;
import java.math.BigDecimal;
import java.util.Optional;
import org.junit.jupiter.api.Test;
class ReviewServiceTests {
    final ReviewRepository reviews = mock(ReviewRepository.class);
    final ReviewModerationEventRepository events = mock(ReviewModerationEventRepository.class);
    final ProductRepository products = mock(ProductRepository.class);
    final UserRepository users = mock(UserRepository.class);
    final ReviewService service = new ReviewService(reviews, events, products, users);
    @Test void rejectsFractionalOutOfRangeAndOversizedInputsBeforePurchaseLookup() {
        for (String stars:new String[] {
            "0", "6", "2.5"
        }
        ) assertEquals(400, assertThrows(ApiException.class, () -> service.write(1, 2, new WriteReview(new BigDecimal(stars), "x", null))).status());
        assertEquals(400, assertThrows(ApiException.class, () -> service.write(1, 2, new WriteReview(BigDecimal.ONE, "x".repeat(2001), null))).status());
        verifyNoInteractions(reviews, products);
    }

    @Test void cannotReviewWithoutCompletedPurchase() {
        when(products.findById(1L)).thenReturn(Optional.of(new Product(new Category("Coffee", "coffee"), "Latte", null, 50000)));
        assertEquals("REVIEW_PURCHASE_REQUIRED", assertThrows(ApiException.class, () -> service.write(1, 2, new WriteReview(BigDecimal.valueOf(5), "Nice", null))).code());
        verify(reviews, never()).lockMine(anyLong(), anyLong());
    }

    @Test void moderationRequiresReasonAndCurrentVersion() {
        assertEquals(400, assertThrows(ApiException.class, () -> service.moderate(1, 2, new ModerateReview(false, "  ", 0L))).status());
        var review = new Review(new User("Buyer", "b@example.com", "hash", "USER"), new Product(new Category("Coffee", "coffee"), "Latte", null, 1), 5, "Original");
        when(reviews.findAuthorId(1L)).thenReturn(Optional.of(3L));
        when(users.findByIdForUpdate(anyLong())).thenReturn(Optional.of(mock(User.class)));
        when(reviews.lockById(1L)).thenReturn(Optional.of(review));
        assertEquals(409, assertThrows(ApiException.class, () -> service.moderate(1, 2, new ModerateReview(false, "Spam", 9L))).status());
        assertTrue(review.isVisible());
        assertEquals("Original", review.getComment());
        verifyNoInteractions(events);
        var locks = inOrder(users, reviews);
        locks.verify(users).findByIdForUpdate(2L);
        locks.verify(users).findByIdForUpdate(3L);
        locks.verify(reviews).lockById(1L);
    }

    @Test void firstReviewLocksExistingAuthorBeforeCheckingMissingReview() {
        var product = new Product(new Category("Coffee", "coffee"), "Latte", null, 50000);
        when(products.findById(1L)).thenReturn(Optional.of(product));
        when(reviews.purchased(2L, 1L)).thenReturn(true);
        when(users.findByIdForUpdate(2L)).thenReturn(Optional.of(mock(User.class)));
        when(reviews.lockMine(2L, 1L)).thenReturn(Optional.empty());
        assertEquals(409, assertThrows(ApiException.class,
                () -> service.write(1, 2, new WriteReview(BigDecimal.ONE, "First", 1L))).status());
        var locks = inOrder(users, reviews);
        locks.verify(users).findByIdForUpdate(2L);
        locks.verify(reviews).lockMine(2L, 1L);
        verify(reviews, never()).saveAndFlush(any());
    }

    @Test void entityEditCannotRestoreHiddenReview() {
        var review = new Review(null, null, 5, "Old");
        review.moderate(false);
        review.edit(3, "<script>alert(1)</script>");
        assertFalse(review.isVisible());
        assertEquals(3, review.getStars());
        assertEquals("<script>alert(1)</script>", review.getComment());
    }
}
