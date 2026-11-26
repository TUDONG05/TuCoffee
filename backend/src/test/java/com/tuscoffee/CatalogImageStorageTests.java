package com.tuscoffee;
import static org.junit.jupiter.api.Assertions.*;
import com.tuscoffee.service.CatalogImageStorage;
import com.tuscoffee.exception.ApiException;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.file.*;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;
class CatalogImageStorageTests {
 @TempDir Path dir;
 private byte[] png() throws Exception {var out=new ByteArrayOutputStream();ImageIO.write(new BufferedImage(2,2,BufferedImage.TYPE_INT_RGB),"png",out);return out.toByteArray();}
 @Test void validImageGetsServerNameAndSafePathDespiteClientMetadata() throws Exception {
  var storage=new CatalogImageStorage(dir.toString());
  String name=storage.save(new MockMultipartFile("file","../../unsafe.svg","application/octet-stream",png()));
  assertTrue(name.endsWith(".png"));assertTrue(Files.exists(dir.resolve(name)));
  assertNotNull(ImageIO.read(storage.resolve(name).toFile()));storage.delete(name);assertFalse(Files.exists(dir.resolve(name)));
 }
 @Test void rejectsUnsupportedCorruptOversizedAndTraversal() throws Exception {
  var storage=new CatalogImageStorage(dir.toString());
  assertEquals(415,assertThrows(ApiException.class,()->storage.save(new MockMultipartFile("file","ok.png","image/png","<svg/>".getBytes()))).status());
  assertEquals(413,assertThrows(ApiException.class,()->storage.save(new MockMultipartFile("file",new byte[5*1024*1024+1]))).status());
  assertEquals(404,assertThrows(ApiException.class,()->storage.resolve("../secret.png")).status());
 }
}
