package com.tuscoffee.dto;

import java.time.Instant;
import java.math.BigDecimal;
import java.util.List;
public final class ReviewDtos {
    private ReviewDtos() {
    }

    public record WriteReview(BigDecimal stars, String comment, Long version) {
    }

    public record ModerateReview(Boolean visible, String reason, Long version) {
    }

    public record ReviewResponse(long id, long productId, String productName, String authorName, int stars, String comment, boolean visible, long version, Instant createdAt, Instant updatedAt) {
    }

    public record Summary(long count, double average) {
    }

    public record ReviewPage(List<ReviewResponse> items, int page, int size, long totalItems, int totalPages, Summary summary) {
    }

    public record Mine(boolean eligible, ReviewResponse review) {
    }

    public record EventResponse(long id, String actorName, boolean visible, String reason, long reviewVersion, Instant createdAt) {
    }

    public record Detail(ReviewResponse review, List<EventResponse> events) {
    }
}
