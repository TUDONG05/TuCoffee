package com.tuscoffee.entity;
import jakarta.persistence.*;
import java.time.Instant;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
@Entity @Table(name="products")
public class Product {
 @Id @GeneratedValue(strategy=GenerationType.IDENTITY) private Long id;
 @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="category_id",nullable=false) private Category category;
 @Column(nullable=false,length=200) private String name;
 @Column(columnDefinition="text") private String description;
 @Column(name="price_vnd",nullable=false) private long priceVnd;
 @Column(name="image_path",length=1024) private String imagePath;
 @Column(name="is_active",nullable=false) private boolean active=true;
 @Version private long version;
 @Column(name="source_system",length=100) private String sourceSystem;
 @Column(name="source_id",length=100) private String sourceId;
 @JdbcTypeCode(SqlTypes.TIMESTAMP) @Column(name="created_at",nullable=false,updatable=false,columnDefinition="timestamp(6)") private Instant createdAt;
 @JdbcTypeCode(SqlTypes.TIMESTAMP) @Column(name="updated_at",nullable=false,columnDefinition="timestamp(6)") private Instant updatedAt;
 protected Product(){}
 public Product(Category category,String name,String description,long priceVnd){update(category,name,description,priceVnd);}
 @PrePersist void create(){createdAt=Instant.now();updatedAt=createdAt;}
 @PreUpdate void updateTimestamp(){updatedAt=Instant.now();}
 public void update(Category category,String name,String description,long priceVnd){this.category=category;this.name=name;this.description=description;this.priceVnd=priceVnd;updatedAt=Instant.now();}
 public void setActive(boolean active){this.active=active;updatedAt=Instant.now();}
 public void setImagePath(String path){imagePath=path;updatedAt=Instant.now();}
 public Long getId(){return id;} public Category getCategory(){return category;} public String getName(){return name;}
 public String getDescription(){return description;} public long getPriceVnd(){return priceVnd;} public String getImagePath(){return imagePath;}
 public boolean isActive(){return active;} public long getVersion(){return version;}
}
