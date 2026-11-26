package com.tuscoffee.controller;
import com.tuscoffee.exception.ApiErrors;
import jakarta.persistence.OptimisticLockException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.annotation.Order;
import org.springframework.http.*;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.web.bind.annotation.*;
@RestControllerAdvice @Order(-1)
public class CatalogExceptionAdvice {
 @ExceptionHandler({ObjectOptimisticLockingFailureException.class,OptimisticLockException.class})
 public ResponseEntity<ProblemDetail> stale(HttpServletRequest request){return ResponseEntity.status(409).body(ApiErrors.problem(409,"CATALOG_STALE","Dữ liệu đã thay đổi. Vui lòng tải lại.",request.getRequestURI()));}
}
