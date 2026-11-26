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

    java.util.List<Order> findByCreatedAtGreaterThanEqualAndCreatedAtLessThanOrderByCreatedAtDescIdDesc(
            java.time.Instant start, java.time.Instant end, Pageable pageable);

    interface StatusCount {
        String getStatus();
        long getTotal();
    }

    interface RevenueTotal {
        long getRevenueVnd();
        long getCompletedPaidOrders();
    }

    interface CompletedOrderSummary {
        Long getId();
        long getTotalVnd();
        java.time.Instant getCompletedAt();
    }

    @Query("select o.id as id, o.totalVnd as totalVnd, o.completedAt as completedAt "
            + "from Order o join Payment p on p.order.id = o.id "
            + "where o.status = 'COMPLETED' and p.status = 'PAID' "
            + "and o.completedAt >= :start and o.completedAt < :end")
    java.util.List<CompletedOrderSummary> findCompletedOrders(
            @Param("start") java.time.Instant start, @Param("end") java.time.Instant end);

    @Query("select o.status as status, count(o) as total from Order o "
            + "where o.createdAt >= :start and o.createdAt < :end group by o.status")
    java.util.List<StatusCount> countStatuses(@Param("start") java.time.Instant start, @Param("end") java.time.Instant end);

    @Query("select coalesce(sum(o.totalVnd), 0) as revenueVnd, count(o) as completedPaidOrders "
            + "from Order o join Payment p on p.order.id = o.id "
            + "where o.status = 'COMPLETED' and p.status = 'PAID' "
            + "and o.completedAt >= :start and o.completedAt < :end")
    RevenueTotal completedRevenue(@Param("start") java.time.Instant start, @Param("end") java.time.Instant end);

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
