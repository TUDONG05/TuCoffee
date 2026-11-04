package com.tuscoffee.exception;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;
import org.springframework.dao.DataIntegrityViolationException;

@RestControllerAdvice
public class ApiExceptionHandler extends ResponseEntityExceptionHandler {
    @ExceptionHandler(ApiException.class)
    ResponseEntity<ProblemDetail> domain(ApiException error, HttpServletRequest request) {
        return ResponseEntity.status(error.status())
                .body(
                        ApiErrors.problem(
                                error.status(),
                                error.code(),
                                error.getMessage(),
                                request.getRequestURI()));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<ProblemDetail> conflict(HttpServletRequest request) {
        return ResponseEntity.status(409)
                .body(
                        ApiErrors.problem(
                                409,
                                "DATA_CONFLICT",
                                "Dữ liệu đã tồn tại hoặc xung đột.",
                                request.getRequestURI()));
    }

    @Override
    protected ResponseEntity<Object> handleMaxUploadSizeExceededException(
            org.springframework.web.multipart.MaxUploadSizeExceededException error,
            org.springframework.http.HttpHeaders headers,
            org.springframework.http.HttpStatusCode status,
            org.springframework.web.context.request.WebRequest request) {
        String path = request instanceof org.springframework.web.context.request.ServletWebRequest servlet
                ? servlet.getRequest().getRequestURI() : "/api/v1";
        return ResponseEntity.status(413).body(ApiErrors.problem(413,"IMAGE_TOO_LARGE","Ảnh không được vượt quá 5 MB.",path));
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ProblemDetail> unexpected(Exception error, HttpServletRequest request) {
        // Do not include exception messages: JDBC/JSON failures can contain external input.
        logger.error("Unhandled API failure: " + error.getClass().getName());
        return ResponseEntity.status(500)
                .body(
                        ApiErrors.problem(
                                500,
                                "INTERNAL_ERROR",
                                "Không thể xử lý yêu cầu. Vui lòng thử lại sau.",
                                request.getRequestURI()));
    }
}
