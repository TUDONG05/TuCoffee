package com.tuscoffee.service;
import com.tuscoffee.exception.ApiException;
import java.awt.image.BufferedImage;
import java.io.*;
import java.nio.file.*;
import java.util.*;
import javax.imageio.ImageIO;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
@Service
public class CatalogImageStorage {
 public static final long MAX_BYTES=5*1024*1024;
 private final Path root;
 public CatalogImageStorage(@Value("${catalog.upload-dir:uploads/catalog}") String directory){root=Path.of(directory).toAbsolutePath().normalize();}
 public String save(MultipartFile file){
  if(file==null || file.isEmpty())throw new ApiException(400,"IMAGE_REQUIRED","Vui lòng chọn ảnh.");
  if(file.getSize()>MAX_BYTES)throw new ApiException(413,"IMAGE_TOO_LARGE","Ảnh tối đa 5 MB.");
  Path temporary=null;
  try {
   byte[] bytes=file.getBytes();
   try(var input=ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))){
    var readers=ImageIO.getImageReaders(input);
    if(!readers.hasNext())throw unsupported();
    var reader=readers.next();
    try {
     String format=reader.getFormatName().toLowerCase(Locale.ROOT);
     if(!Set.of("jpeg","jpg","png","webp").contains(format))throw unsupported();
     reader.setInput(input,true,true);
     int width=reader.getWidth(0),height=reader.getHeight(0);
     if(width<=0 || height<=0 || (long)width*height>20000000)throw new ApiException(400,"IMAGE_DIMENSIONS","Ảnh không được vượt quá 20 triệu điểm ảnh.");
     BufferedImage image=reader.read(0);if(image==null)throw unsupported();
     Files.createDirectories(root);
     temporary=Files.createTempFile(root,"image-",".part");
     if(!ImageIO.write(image,"png",temporary.toFile()))throw unsupported();
     if(Files.size(temporary)>MAX_BYTES)throw new ApiException(413,"IMAGE_TOO_LARGE","Ảnh sau chuẩn hóa vượt quá 5 MB.");
     String name=UUID.randomUUID()+".png";Files.move(temporary,root.resolve(name));temporary=null;return name;
    }finally{reader.dispose();}
   }
  } catch(ApiException error){throw error;}
  catch(javax.imageio.IIOException error){throw unsupported();}
  catch(IOException error){throw new ApiException(503,"IMAGE_STORAGE_UNAVAILABLE","Không thể lưu ảnh. Vui lòng thử lại.");}
  finally{if(temporary!=null)try{Files.deleteIfExists(temporary);}catch(IOException ignored){}}
 }
 public Path resolve(String name){
  if(name==null || !name.matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](png|jpg|jpeg|webp)"))throw notFound();
  Path file=root.resolve(name).normalize();if(!file.startsWith(root) || !Files.isRegularFile(file,LinkOption.NOFOLLOW_LINKS))throw notFound();return file;
 }
 public void delete(String name){try{Files.deleteIfExists(resolve(name));}catch(ApiException|IOException ignored){/* Missing orphan is already cleaned. */}}
 private ApiException unsupported(){return new ApiException(415,"IMAGE_TYPE_INVALID","Chỉ nhận ảnh JPEG, PNG hoặc WebP hợp lệ.");}
 private ApiException notFound(){return new ApiException(404,"IMAGE_NOT_FOUND","Không tìm thấy ảnh.");}
}
