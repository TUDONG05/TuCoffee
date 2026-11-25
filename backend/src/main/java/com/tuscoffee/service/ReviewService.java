package com.tuscoffee.service;

import com.tuscoffee.dto.ReviewDtos.*;
import com.tuscoffee.entity.*;
import com.tuscoffee.exception.ApiException;
import com.tuscoffee.repository.*;
import java.math.BigDecimal;
import org.springframework.data.domain.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
@Service
@Transactional(readOnly = true)
public class ReviewService {
    private final ReviewRepository reviews;
    private final ReviewModerationEventRepository events;
    private final ProductRepository products;
    private final UserRepository users;
    public ReviewService(ReviewRepository reviews, ReviewModerationEventRepository events, ProductRepository products, UserRepository users) {
        this.reviews = reviews;
        this.events = events;
        this.products = products;
        this.users = users;
    }

    public ReviewPage publicPage(long productId, int page, int size) {
        publicProduct(productId);
        return page(productId, null, true, page, size);
    }

    public Mine mine(long productId, long userId) {
        publicProduct(productId);
        var ownReview = reviews.findByUserIdAndProductId(userId, productId)
                .map(this::response).orElse(null);
        return new Mine(reviews.purchased(userId, productId), ownReview);
    }

    @Transactional
    public ReviewResponse write(long productId, long userId, WriteReview input) {
        validateWrite(input);
        Product product = publicProduct(productId);
        if (!reviews.purchased(userId, productId)) throw new ApiException(403, "REVIEW_PURCHASE_REQUIRED", "Chỉ được đánh giá sản phẩm trong đơn đã hoàn tất.");
        // An existing parent row serializes first writes too; an absent review cannot be row-locked.
        User author = lockUser(userId);
        Review review = reviews.lockMine(userId, productId).orElse(null);
        if (review == null) {
            if (input.version() != null) throw stale();
            review = new Review(author, product, input.stars().intValueExact(), clean(input.comment()));
        }
        else {
            checkVersion(review, input.version());
            review.edit(input.stars().intValueExact(), clean(input.comment()));
        }
        return response(reviews.saveAndFlush(review));
    }

    public ReviewPage adminPage(Long productId, Integer stars, Boolean visible, int page, int size) {
        if (productId != null && productId<1 || stars != null && (stars<1 || stars>5)) throw invalid();
        return page(productId, stars, visible, page, size);
    }

    public Detail detail(long id) {
        Review review = reviews.findById(id).orElseThrow(this::notFound);
        var history = events.findByReviewIdOrderByCreatedAtDescIdDesc(id).stream()
                .map(e -> new EventResponse(e.getId(), e.getActor().getName(), e.isVisible(),
                        e.getReason(), e.getReviewVersion(), e.getCreatedAt()))
                .toList();
        return new Detail(response(review), history);
    }

    @Transactional
    public ReviewResponse moderate(long id, long actorId, ModerateReview input) {
        if (input == null || input.visible() == null || input.reason() == null || input.reason().isBlank() || input.reason().length()>500) throw invalid();
        long authorId = reviews.findAuthorId(id).orElseThrow(this::notFound);
        // All writers lock users before reviews. Audit inserts also reference the actor,
        // so acquire both parent rows in a stable order before touching the review.
        lockUser(Math.min(authorId, actorId));
        if (authorId != actorId) lockUser(Math.max(authorId, actorId));
        Review review = reviews.lockById(id).orElseThrow(this::notFound);
        checkVersion(review, input.version());
        // A visibility action always advances the version, including an explicit same-state action.
        review.moderate(input.visible());
        reviews.saveAndFlush(review);
        events.save(new ReviewModerationEvent(review, users.getReferenceById(actorId), input.reason().trim()));
        return response(review);
    }

    private ReviewPage page(Long productId, Integer stars, Boolean visible, int page, int size) {
        if (page<0 || size<1 || size>50) throw invalid();
        var pagination = PageRequest.of(page, size,
                Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("id")));
        var result = reviews.search(productId, stars, visible, pagination);
        var aggregate = reviews.summarize(productId, stars, visible);
        var summary = new Summary(aggregate.getCount(),
                aggregate.getAverage() == null ? 0 : aggregate.getAverage());
        return new ReviewPage(result.getContent().stream().map(this::response).toList(),
                page, size, result.getTotalElements(), result.getTotalPages(), summary);
    }

    private Product publicProduct(long id) {
        return products.findById(id)
                .filter(p -> p.isActive() && p.getCategory().isActive())
                .orElseThrow(() -> new ApiException(404, "PRODUCT_NOT_FOUND",
                        "Sản phẩm không tồn tại hoặc đã ngừng bán."));
    }

    private ReviewResponse response(Review r) {
        return new ReviewResponse(r.getId(), r.getProduct().getId(), r.getProduct().getName(),
                r.getUser().getName(), r.getStars(), r.getComment(), r.isVisible(),
                r.getVersion(), r.getCreatedAt(), r.getUpdatedAt());
    }

    private void checkVersion(Review review, Long version) {
        if (version == null || version != review.getVersion()) throw stale();
    }
    private User lockUser(long id) {
        return users.findByIdForUpdate(id).orElseThrow(() ->
                new ApiException(401, "UNAUTHORIZED", "Tài khoản không hợp lệ."));
    }
    static void validateWrite(WriteReview input) {
        if (input == null || input.stars() == null
                || input.stars().stripTrailingZeros().scale() > 0
                || input.stars().compareTo(BigDecimal.ONE) < 0
                || input.stars().compareTo(BigDecimal.valueOf(5)) > 0
                || input.comment() != null && input.comment().length() > 2000) {
            throw invalid();
        }
    }

    private static String clean(String value) {
        return value == null?null:value.trim();
    }

    private static ApiException invalid() {
        return new ApiException(400, "REVIEW_INVALID", "Kiểm tra số sao, nội dung, lý do hoặc phân trang.");
    }

    private static ApiException stale() {
        return new ApiException(409, "REVIEW_STALE", "Đánh giá đã thay đổi. Vui lòng tải lại trước khi lưu.");
    }

    private ApiException notFound() {
        return new ApiException(404, "REVIEW_NOT_FOUND", "Không tìm thấy đánh giá.");
    }
}
