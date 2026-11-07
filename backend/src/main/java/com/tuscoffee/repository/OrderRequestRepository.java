package com.tuscoffee.repository;

import com.tuscoffee.entity.OrderRequest;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OrderRequestRepository extends JpaRepository<OrderRequest, Long> {
    Optional<OrderRequest> findByCreatorIdAndIdempotencyKey(Long creatorId, String idempotencyKey);
}
