package com.tuscoffee.dto;
import java.math.BigDecimal;
import java.util.List;
public final class CatalogDtos {
 private CatalogDtos(){}
 public record CategoryResponse(long id,String name,String slug,boolean active,long version){}
 public record ProductResponse(long id,String name,String description,long priceVnd,String imageUrl,boolean active,long version,CategoryResponse category){}
 public record ProductPage(List<ProductResponse> items,int page,int size,long totalItems,int totalPages){}
 public record CreateCategory(String name,String slug){}
 public record UpdateCategory(String name,String slug,Long version){}
 public record CreateProduct(Long categoryId,String name,String description,BigDecimal priceVnd){}
 public record UpdateProduct(Long categoryId,String name,String description,BigDecimal priceVnd,Long version){}
 public record ActiveRequest(Boolean active,Long version){}
}
