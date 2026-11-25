package com.tuscoffee.repository;

import com.tuscoffee.entity.ReviewModerationEvent;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
public interface ReviewModerationEventRepository extends JpaRepository<ReviewModerationEvent, Long> {
    List<ReviewModerationEvent> findByReviewIdOrderByCreatedAtDescIdDesc(long reviewId);
}
