package com.tuscoffee.repository;

import com.tuscoffee.entity.AuthSession;
import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AuthSessionRepository extends JpaRepository<AuthSession, String> {
    Optional<AuthSession> findByRefreshHash(String refreshHash);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(
            "update AuthSession s set s.revokedAt = :now where s.user.id = :userId and s.revokedAt is null")
    int revokeAllForUser(@Param("userId") long userId, @Param("now") Instant now);
}
