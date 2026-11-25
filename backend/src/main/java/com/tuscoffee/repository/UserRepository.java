package com.tuscoffee.repository;

import com.tuscoffee.entity.User;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserRepository extends JpaRepository<User, Long> {
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from User u where u.id = :id")
    Optional<User> findByIdForUpdate(@Param("id") Long id);

    Optional<User> findByEmail(String email);

    Optional<User> findByGoogleSubject(String googleSubject);

    long countByRoleAndActiveTrue(String role);

    @Query(
            """
            select u from User u
            where (:active is null or u.active = :active)
              and (lower(u.name) like :pattern escape '!' or u.email like :pattern escape '!')
            """)
    Page<User> search(
            @Param("pattern") String pattern, @Param("active") Boolean active, Pageable pageable);
}
