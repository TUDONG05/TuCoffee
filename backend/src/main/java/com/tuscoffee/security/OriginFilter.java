package com.tuscoffee.security;

import com.tuscoffee.exception.ApiErrors;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.web.filter.OncePerRequestFilter;

public class OriginFilter extends OncePerRequestFilter {
    private final AuthSettings settings;
    private final ApiErrors errors;

    public OriginFilter(AuthSettings settings, ApiErrors errors) {
        this.settings = settings;
        this.errors = errors;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String origin = request.getHeader("Origin");
        if (origin != null && !settings.allowedOrigins().contains(origin)) {
            errors.write(request, response, 403, "ORIGIN_FORBIDDEN", "Origin is not permitted.");
            return;
        }
        chain.doFilter(request, response);
    }
}
