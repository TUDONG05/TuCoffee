package com.tuscoffee.repository;
import com.tuscoffee.entity.Product;
import org.springframework.data.jpa.repository.*;
public interface ProductRepository extends JpaRepository<Product,Long>, JpaSpecificationExecutor<Product> {}
