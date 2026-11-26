package com.tuscoffee.controller;
import com.tuscoffee.dto.CatalogDtos.*;
import com.tuscoffee.service.CatalogService;
import java.util.List;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
@RestController @RequestMapping("/api/v1/admin")
public class CatalogAdminController {
 private final CatalogService catalog;
 public CatalogAdminController(CatalogService catalog){this.catalog=catalog;}
 @GetMapping("/categories") public List<CategoryResponse> categories(){return catalog.categories(true);}
 @PostMapping("/categories") public ResponseEntity<CategoryResponse> createCategory(@RequestBody CreateCategory input){return ResponseEntity.status(201).body(catalog.createCategory(input));}
 @PutMapping("/categories/{id}") public CategoryResponse category(@PathVariable long id,@RequestBody UpdateCategory input){return catalog.updateCategory(id,input);}
 @PatchMapping("/categories/{id}/active") public CategoryResponse activeCategory(@PathVariable long id,@RequestBody ActiveRequest input){return catalog.activeCategory(id,input);}
 @GetMapping("/products") public ProductPage products(@RequestParam(defaultValue="")String q,@RequestParam(required=false)Long categoryId,@RequestParam(required=false)Boolean active,@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="12")int size,@RequestParam(defaultValue="id")String sort){return catalog.products(true,q,categoryId,active,page,size,sort);}
 @PostMapping("/products") public ResponseEntity<ProductResponse> createProduct(@RequestBody CreateProduct input){return ResponseEntity.status(201).body(catalog.createProduct(input));}
 @PutMapping("/products/{id}") public ProductResponse product(@PathVariable long id,@RequestBody UpdateProduct input){return catalog.updateProduct(id,input);}
 @PatchMapping("/products/{id}/active") public ProductResponse activeProduct(@PathVariable long id,@RequestBody ActiveRequest input){return catalog.activeProduct(id,input);}
 @PostMapping(value="/products/{id}/image",consumes=MediaType.MULTIPART_FORM_DATA_VALUE) public ProductResponse image(@PathVariable long id,@RequestParam Long version,@RequestParam MultipartFile file){return catalog.image(id,version,file);}
}
