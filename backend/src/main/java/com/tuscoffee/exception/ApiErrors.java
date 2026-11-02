package com.tuscoffee.exception;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;
import java.util.Map;

@Component
public class ApiErrors {
    private final ObjectMapper mapper;

    public ApiErrors(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    public static ProblemDetail problem(int status, String code, String detail, String path) {
        var problem = ProblemDetail.forStatusAndDetail(HttpStatus.valueOf(status), detail);
        problem.setType(URI.create("about:blank"));
        problem.setInstance(URI.create(path));
        problem.setProperty("code", code);
        return problem;
    }

    // Constant filter messages avoid serializing exception details or credentials.
    public void write(
            HttpServletRequest request,
            HttpServletResponse response,
            int status,
            String code,
            String detail)
            throws IOException {
        response.setStatus(status);
        response.setContentType("application/problem+json");
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        mapper.writeValue(
                response.getWriter(),
                Map.of(
                        "type",
                        "about:blank",
                        "title",
                        HttpStatus.valueOf(status).getReasonPhrase(),
                        "status",
                        status,
                        "detail",
                        detail,
                        "instance",
                        request.getRequestURI(),
                        "code",
                        code));
    }
}
