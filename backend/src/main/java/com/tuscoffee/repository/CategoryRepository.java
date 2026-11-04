package com.tuscoffee.repository;
import com.tuscoffee.entity.Category;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
public interface CategoryRepository extends JpaRepository<Category,Long> {
 List<Category> findByActiveTrueOrderByIdAsc();
 List<Category> findAllByOrderByIdAsc();
}
