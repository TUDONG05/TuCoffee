package com.tuscoffee;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import com.tuscoffee.dto.CatalogDtos.*;
import com.tuscoffee.exception.ApiException;
import com.tuscoffee.service.CatalogService;
import java.math.BigDecimal;
import java.nio.file.*;
import java.io.ByteArrayOutputStream;
import java.awt.image.BufferedImage;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.*;
import org.springframework.test.context.transaction.TestTransaction;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.mock.web.MockMultipartFile;
@SpringBootTest(properties={"spring.config.import=","catalog.seed.enabled=false"})
@Transactional
class CatalogServiceIntegrationTests extends MySqlIntegrationSupport {
 @TempDir static Path directory;
 @DynamicPropertySource static void storage(DynamicPropertyRegistry registry){registry.add("catalog.upload-dir",()->directory.toString());}
 @Autowired CatalogService catalog;
 @Autowired WebApplicationContext context;
 private CategoryResponse category(){return catalog.createCategory(new CreateCategory("Cà phê","coffee-"+java.util.UUID.randomUUID()));}
 private ProductResponse product(long category,String name){return catalog.createProduct(new CreateProduct(category,name,"Mô tả",new BigDecimal("50000")));}
 @Test void visibilityLiteralSearchAndVersionedUpdatesWorkTogether(){
  var c=category();var p=product(c.id(),"Cà phê 100%_!");product(c.id(),"Coffee other");
  assertEquals(1,catalog.products(false,"%_!",c.id(),null,0,12,"id").totalItems());
  assertEquals(2,catalog.products(false,"",c.id(),null,0,12,"priceAsc").totalItems());
  assertEquals(0,catalog.products(false,"",c.id(),null,999,12,"id").items().size());
  var updated=catalog.updateProduct(p.id(),new UpdateProduct(c.id(),"Tên mới",null,new BigDecimal("60000"),p.version()));
  assertTrue(updated.version()>p.version());
  assertEquals(409,assertThrows(ApiException.class,()->catalog.updateProduct(p.id(),new UpdateProduct(c.id(),"Stale",null,BigDecimal.ONE,p.version()))).status());
  catalog.activeCategory(c.id(),new ActiveRequest(false,c.version()));
  assertEquals(0,catalog.products(false,"",c.id(),null,0,12,"id").totalItems());
  assertEquals(404,assertThrows(ApiException.class,()->catalog.product(p.id(),false)).status());
  assertEquals(updated.id(),catalog.product(p.id(),true).id());
 }
 @Test void rejectsBadInputAndDuplicateSlug(){
  var c=category();
  assertEquals(400,assertThrows(ApiException.class,()->catalog.createProduct(new CreateProduct(c.id(),"Coffee",null,new BigDecimal("1.5")))).status());
  assertEquals(400,assertThrows(ApiException.class,()->catalog.createProduct(new CreateProduct(c.id(),"Coffee",null,new BigDecimal("-1")))).status());
  assertEquals(400,assertThrows(ApiException.class,()->catalog.products(false,"",null,null,0,101,"id")).status());
  assertEquals(400,assertThrows(ApiException.class,()->catalog.products(false,"x".repeat(101),null,null,0,12,"id")).status());
  assertEquals(400,assertThrows(ApiException.class,()->catalog.products(false,"",null,null,0,12,"unsafe")).status());
  assertEquals(400,assertThrows(ApiException.class,()->catalog.activeCategory(c.id(),new ActiveRequest(true,null))).status());
 }
 @Test void uploadRollbackCleansNewFileAndNeverAcceptsStaleVersion() throws Exception {
  var c=category();var p=product(c.id(),"Coffee");
  var bytes=new ByteArrayOutputStream();ImageIO.write(new BufferedImage(2,2,BufferedImage.TYPE_INT_RGB),"png",bytes);
  var file=new MockMultipartFile("file","../../image.png","text/plain",bytes.toByteArray());
  assertEquals(409,assertThrows(ApiException.class,()->catalog.image(p.id(),p.version()+1,file)).status());
  var uploaded=catalog.image(p.id(),p.version(),file);assertTrue(uploaded.imageUrl().startsWith("/api/v1/catalog/images/"));
  try(var files=Files.list(directory)){assertEquals(1,files.count());}
  TestTransaction.flagForRollback();TestTransaction.end();
  try(var files=Files.list(directory)){assertEquals(0,files.count());}
 }
 @Test void actualHttpFiltersEnforceAdminCsrfAndInputValidation() throws Exception {
  var mvc=MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
  mvc.perform(get("/api/v1/products")).andExpect(status().isOk());
  mvc.perform(post("/api/v1/admin/categories").with(csrf()).contentType("application/json").content("{\"name\":\"Coffee\",\"slug\":\"permission-test\"}"))
   .andExpect(status().isUnauthorized());
  mvc.perform(post("/api/v1/admin/categories").with(user("buyer").roles("USER")).with(csrf()).contentType("application/json").content("{\"name\":\"Coffee\",\"slug\":\"permission-test\"}"))
   .andExpect(status().isForbidden());
  mvc.perform(post("/api/v1/admin/categories").with(user("admin").roles("ADMIN")).contentType("application/json").content("{\"name\":\"Coffee\",\"slug\":\"permission-test\"}"))
   .andExpect(status().isForbidden());
  mvc.perform(post("/api/v1/admin/categories").with(user("admin").roles("ADMIN")).with(csrf()).contentType("application/json").content("{\"name\":\"Coffee\",\"slug\":\"permission-test\"}"))
   .andExpect(status().isCreated()).andExpect(jsonPath("$.slug").value("permission-test"));
  var c=category();var p=product(c.id(),"Coffee");
  mvc.perform(post("/api/v1/admin/products").with(user("admin").roles("ADMIN")).with(csrf()).contentType("application/json").content("{\"name\":\"Coffee\",\"categoryId\":"+c.id()+",\"priceVnd\":1.5}"))
   .andExpect(status().isBadRequest());
  mvc.perform(post("/api/v1/admin/products").with(user("admin").roles("ADMIN")).with(csrf()).contentType("application/json").content("{\"name\":\"Coffee\",\"categoryId\":"+c.id()+",\"priceVnd\":1,\"imagePath\":\"secret\"}"))
   .andExpect(status().isBadRequest());
  mvc.perform(multipart("/api/v1/admin/products/"+p.id()+"/image").file(new MockMultipartFile("file","fake.png","image/png","<svg/>".getBytes())).param("version",Long.toString(p.version())).with(user("admin").roles("ADMIN")).with(csrf()))
   .andExpect(status().isUnsupportedMediaType());
 }

}
