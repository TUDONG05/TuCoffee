package com.tuscoffee.repository;

import com.tuscoffee.entity.AuthRateLimit;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AuthRateLimitRepository extends JpaRepository<AuthRateLimit, String> {}
