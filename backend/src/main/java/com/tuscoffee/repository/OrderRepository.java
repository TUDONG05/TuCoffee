package com.tuscoffee.repository;

import com.tuscoffee.entity.Order;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface OrderRepository extends JpaRepository<Order, Long> {
    Optional<Order> findByPublicCode(String publicCode);

    Page<Order> findByBuyerIdOrderByCreatedAtDesc(Long buyerId, Pageable pageable);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select o from Order o where o.id = :id")
    Optional<Order> findByIdForUpdate(@Param("id") Long id);

    @Query(
            """
            select o from Order o
            left join Payment p on p.order.id = o.id
            where (:status is null or o.status = :status)
              and (:source is null or o.source = :source)
              and (:paymentStatus is null or p.status = :paymentStatus)
              and (:pattern is null or lower(o.publicCode) like :pattern escape '!'
                   or lower(o.customerName) like :pattern escape '!'
                   or (o.customerPhone is not null and o.customerPhone like :pattern escape '!'))
            order by o.createdAt desc
            """)
    Page<Order> searchAdmin(
            @Param("status") String status,
            @Param("source") String source,
            @Param("paymentStatus") String paymentStatus,
            @Param("pattern") String pattern,
            Pageable pageable);
}
