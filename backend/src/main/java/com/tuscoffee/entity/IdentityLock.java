package com.tuscoffee.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Flyway creates row 1; locking it coordinates identity mutations across instances. */
@Entity
@Table(name = "identity_lock")
public class IdentityLock {
    @Id private Integer id;

    protected IdentityLock() {}

    public Integer getId() {
        return id;
    }
}
