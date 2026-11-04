package com.tuscoffee.service;
import com.tuscoffee.dto.CatalogDtos.*;
import com.tuscoffee.entity.*;
import com.tuscoffee.repository.*;
import com.tuscoffee.exception.ApiException;
import java.math.BigDecimal;
import java.util.*;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.*;
import org.springframework.web.multipart.MultipartFile;
@Service
@Transactional(readOnly=true)
public class CatalogService {
 private final CategoryRepository categories;private final ProductRepository products;private final CatalogImageStorage images;
 public CatalogService(CategoryRepository categories,ProductRepository products,CatalogImageStorage images){this.categories=categories;this.products=products;this.images=images;}
 public List<CategoryResponse> categories(boolean admin){return (admin?categories.findAllByOrderByIdAsc():categories.findByActiveTrueOrderByIdAsc()).stream().map(this::categoryDto).toList();}
 public ProductPage products(boolean admin,String q,Long categoryId,Boolean active,int page,int size,String sort){
  if(page<0||page>1000000||size<1||size>100)throw bad("Phân trang không hợp lệ.");
  q=q==null?"":q.trim();if(q.length()>100)throw bad("Từ khóa tối đa 100 ký tự.");
  if(categoryId!=null && categoryId<=0)throw bad("Danh mục không hợp lệ.");
  Sort order=switch(sort==null?"id":sort){case "id"->Sort.by("id");case "name"->Sort.by("name").and(Sort.by("id"));case "priceAsc"->Sort.by("priceVnd").and(Sort.by("id"));case "priceDesc"->Sort.by(Sort.Direction.DESC,"priceVnd").and(Sort.by("id"));default->throw bad("Thứ tự sắp xếp không hợp lệ.");};
  final String pattern="%"+q.replace("!","!!").replace("%","!%").replace("_","!_").toLowerCase(Locale.ROOT)+"%";
  Specification<Product> spec=(root,query,cb)->{
   var predicates=new ArrayList<jakarta.persistence.criteria.Predicate>();
   if(!admin){predicates.add(cb.isTrue(root.get("active")));predicates.add(cb.isTrue(root.get("category").get("active")));}
   else if(active!=null)predicates.add(cb.equal(root.get("active"),active));
   if(categoryId!=null)predicates.add(cb.equal(root.get("category").get("id"),categoryId));
   predicates.add(cb.or(cb.like(cb.lower(root.get("name")),pattern,'!'),cb.like(cb.lower(root.get("description")),pattern,'!')));
   return cb.and(predicates.toArray(jakarta.persistence.criteria.Predicate[]::new));
  };
  var result=products.findAll(spec,PageRequest.of(page,size,order));
  return new ProductPage(result.getContent().stream().map(this::productDto).toList(),page,size,result.getTotalElements(),result.getTotalPages());
 }
 public ProductResponse product(long id,boolean admin){var product=productEntity(id);if(!admin && (!product.isActive()||!product.getCategory().isActive()))throw missing();return productDto(product);}
 @Transactional public CategoryResponse createCategory(CreateCategory input){if(input==null)throw bad("Thiếu dữ liệu.");return categoryDto(categories.saveAndFlush(new Category(name(input.name(),100),slug(input.slug()))));}
 @Transactional public CategoryResponse updateCategory(long id,UpdateCategory input){if(input==null)throw bad("Thiếu dữ liệu.");var category=categoryEntity(id);version(input.version(),category.getVersion());category.update(name(input.name(),100),slug(input.slug()));return categoryDto(categories.saveAndFlush(category));}
 @Transactional public CategoryResponse activeCategory(long id,ActiveRequest input){var category=categoryEntity(id);activeInput(input,category.getVersion());category.setActive(input.active());return categoryDto(categories.saveAndFlush(category));}
 @Transactional public ProductResponse createProduct(CreateProduct input){if(input==null)throw bad("Thiếu dữ liệu.");var product=new Product(categoryEntity(validId(input.categoryId())),name(input.name(),200),description(input.description()),price(input.priceVnd()));return productDto(products.saveAndFlush(product));}
 @Transactional public ProductResponse updateProduct(long id,UpdateProduct input){if(input==null)throw bad("Thiếu dữ liệu.");var product=productEntity(id);version(input.version(),product.getVersion());product.update(categoryEntity(validId(input.categoryId())),name(input.name(),200),description(input.description()),price(input.priceVnd()));return productDto(products.saveAndFlush(product));}
 @Transactional public ProductResponse activeProduct(long id,ActiveRequest input){var product=productEntity(id);activeInput(input,product.getVersion());product.setActive(input.active());return productDto(products.saveAndFlush(product));}
 @Transactional public ProductResponse image(long id,Long expectedVersion,MultipartFile file){
  var product=productEntity(id);version(expectedVersion,product.getVersion());
  String name=images.save(file);
  TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization(){@Override public void afterCompletion(int status){if(status!=STATUS_COMMITTED)images.delete(name);}});
  // Keep the previous file: deleting it before commit would break rollback/readers.
  product.setImagePath(name);return productDto(products.saveAndFlush(product));
 }
 private void activeInput(ActiveRequest input,long current){if(input==null||input.active()==null)throw bad("Trạng thái là bắt buộc.");version(input.version(),current);}
 private void version(Long expected,long current){if(expected==null||expected<0)throw bad("Phiên bản là bắt buộc.");if(expected!=current)throw new ApiException(409,"CATALOG_STALE","Dữ liệu đã thay đổi. Vui lòng tải lại.");}
 private long validId(Long value){if(value==null||value<=0)throw bad("Danh mục là bắt buộc.");return value;}
 private Category categoryEntity(long id){return categories.findById(id).orElseThrow(this::missing);}
 private Product productEntity(long id){return products.findById(id).orElseThrow(this::missing);}
 private String name(String value,int max){if(value==null||value.trim().isEmpty()||value.trim().length()>max)throw bad("Tên không hợp lệ.");return value.trim();}
 private String slug(String value){if(value==null||value.length()>120||!value.matches("[a-z0-9]+(?:-[a-z0-9]+)*"))throw bad("Slug chỉ gồm chữ thường, số và dấu gạch nối.");return value;}
 private String description(String value){if(value==null||value.isBlank())return null;if(value.length()>10000)throw bad("Mô tả tối đa 10000 ký tự.");return value.trim();}
 private long price(BigDecimal value){if(value==null)throw bad("Giá là bắt buộc.");try{long amount=value.longValueExact();if(amount<0||amount>100000000)throw bad("Giá nằm ngoài giới hạn.");return amount;}catch(ArithmeticException error){throw bad("Giá phải là số nguyên VND.");}}
 private ApiException bad(String message){return new ApiException(400,"CATALOG_INPUT_INVALID",message);}
 private ApiException missing(){return new ApiException(404,"CATALOG_NOT_FOUND","Không tìm thấy danh mục hoặc sản phẩm.");}
 private CategoryResponse categoryDto(Category category){return new CategoryResponse(category.getId(),category.getName(),category.getSlug(),category.isActive(),category.getVersion());}
 private ProductResponse productDto(Product product){return new ProductResponse(product.getId(),product.getName(),product.getDescription(),product.getPriceVnd(),product.getImagePath()==null?null:"/api/v1/catalog/images/"+product.getImagePath(),product.isActive(),product.getVersion(),categoryDto(product.getCategory()));}
}
