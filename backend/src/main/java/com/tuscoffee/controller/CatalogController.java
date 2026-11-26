package com.tuscoffee.controller;
import com.tuscoffee.dto.CatalogDtos.*;
import com.tuscoffee.service.*;
import java.util.List;
import org.springframework.core.io.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/api/v1")
public class CatalogController {
 private final CatalogService catalog;private final CatalogImageStorage images;
 public CatalogController(CatalogService catalog,CatalogImageStorage images){this.catalog=catalog;this.images=images;}
 @GetMapping("/categories") public List<CategoryResponse> categories(){return catalog.categories(false);}
 @GetMapping("/products") public ProductPage products(@RequestParam(defaultValue="")String q,@RequestParam(required=false)Long categoryId,@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="12")int size,@RequestParam(defaultValue="id")String sort){return catalog.products(false,q,categoryId,null,page,size,sort);}
 @GetMapping("/products/{id}") public ProductResponse product(@PathVariable long id){return catalog.product(id,false);}
 @GetMapping("/catalog/images/{filename}") public ResponseEntity<Resource> image(@PathVariable String filename){
  String type=filename.endsWith(".png")?"image/png":filename.endsWith(".webp")?"image/webp":"image/jpeg";
  return ResponseEntity.ok().contentType(MediaType.parseMediaType(type)).header("X-Content-Type-Options","nosniff").header("Content-Security-Policy","default-src 'none'; sandbox").body(new FileSystemResource(images.resolve(filename)));
 }
}
