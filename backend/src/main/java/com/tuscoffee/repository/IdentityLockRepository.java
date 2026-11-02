package com.tuscoffee.repository;

import com.tuscoffee.entity.IdentityLock;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

public interface IdentityLockRepository extends JpaRepository<IdentityLock, Integer> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select coordinator from IdentityLock coordinator where coordinator.id = 1")
    Optional<IdentityLock> acquire();
}
