package com.tuscoffee.repository;

import com.tuscoffee.entity.AuthTokenHistory;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AuthTokenHistoryRepository extends JpaRepository<AuthTokenHistory, String> {}
