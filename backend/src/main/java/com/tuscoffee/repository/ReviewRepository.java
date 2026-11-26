package com.tuscoffee.repository;

import com.tuscoffee.entity.Review;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
public interface ReviewRepository extends JpaRepository<Review, Long> {
    @Query("select r.user.id from Review r where r.id=:id")
    Optional<Long> findAuthorId(@Param("id") long id);
    Optional<Review> findByUserIdAndProductId(long userId, long productId);
    @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select r from Review r where r.user.id=:userId and r.product.id=:productId")
    Optional<Review> lockMine(@Param("userId") long userId, @Param("productId") long productId);
    @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select r from Review r where r.id=:id")
    Optional<Review> lockById(@Param("id") long id);
    @Query("select (count(i)>0) from OrderItem i where i.order.buyer.id=:userId and i.product.id=:productId and i.order.status='COMPLETED'")
    boolean purchased(@Param("userId") long userId, @Param("productId") long productId);
    @EntityGraph(attributePaths = {"user", "product"})
    @Query("select r from Review r where (:productId is null or r.product.id=:productId) and (:stars is null or r.stars=:stars) and (:visible is null or r.visible=:visible)")
    Page<Review> search(@Param("productId") Long productId, @Param("stars") Integer stars, @Param("visible") Boolean visible, Pageable page);
    interface Aggregate {
        long getCount();
        Double getAverage();
    }

    @Query("select count(r) as count, avg(r.stars) as average from Review r where (:productId is null or r.product.id=:productId) and (:stars is null or r.stars=:stars) and (:visible is null or r.visible=:visible)")
    Aggregate summarize(@Param("productId") Long productId, @Param("stars") Integer stars, @Param("visible") Boolean visible);
}
