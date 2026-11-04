package com.tuscoffee.entity;
import jakarta.persistence.*;
import java.time.Instant;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
@Entity @Table(name="categories")
public class Category {
 @Id @GeneratedValue(strategy=GenerationType.IDENTITY) private Long id;
 @Column(nullable=false,length=100) private String name;
 @Column(nullable=false,length=120) private String slug;
 @Column(name="is_active",nullable=false) private boolean active=true;
 @Version private long version;
 @JdbcTypeCode(SqlTypes.TIMESTAMP) @Column(name="created_at",nullable=false,updatable=false,columnDefinition="timestamp(6)") private Instant createdAt;
 @JdbcTypeCode(SqlTypes.TIMESTAMP) @Column(name="updated_at",nullable=false,columnDefinition="timestamp(6)") private Instant updatedAt;
 protected Category() {}
 public Category(String name,String slug){this.name=name;this.slug=slug;}
 @PrePersist void create(){createdAt=Instant.now();updatedAt=createdAt;}
 @PreUpdate void updateTimestamp(){updatedAt=Instant.now();}
 public Long getId(){return id;} public String getName(){return name;} public String getSlug(){return slug;}
 public boolean isActive(){return active;} public long getVersion(){return version;}
 public void update(String name,String slug){this.name=name;this.slug=slug;updatedAt=Instant.now();}
 public void setActive(boolean active){this.active=active;updatedAt=Instant.now();}
}
