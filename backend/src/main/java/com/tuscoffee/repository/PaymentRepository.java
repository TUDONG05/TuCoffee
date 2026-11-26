package com.tuscoffee.repository;

import com.tuscoffee.entity.Payment;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PaymentRepository extends JpaRepository<Payment, Long> {
    Optional<Payment> findByOrderId(Long orderId);

    List<Payment> findByOrderIdIn(Collection<Long> orderIds);

    Optional<Payment> findByConfirmationKey(String confirmationKey);
}
