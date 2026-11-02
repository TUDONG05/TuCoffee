package com.tuscoffee.security;

import com.tuscoffee.service.IdentityService;
import com.tuscoffee.exception.ApiException;
import com.tuscoffee.exception.ApiErrors;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.JwtValidationException;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.dao.DataAccessException;

public class IdentityAuthenticationFilter extends OncePerRequestFilter {
    private final TokenService tokens;
    private final IdentityService identity;
    private final ApiErrors errors;

    public IdentityAuthenticationFilter(
            TokenService tokens, IdentityService identity, ApiErrors errors) {
        this.tokens = tokens;
        this.identity = identity;
        this.errors = errors;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getServletPath();
        return !(path.startsWith("/api/v1/users/") || path.startsWith("/api/v1/admin/"));
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String authorization = request.getHeader("Authorization");
        if (authorization == null) {
            chain.doFilter(request, response);
            return;
        }
        if (!authorization.startsWith("Bearer ")) {
            invalid(request, response, "INVALID_TOKEN");
            return;
        }
        try {
            var jwt = tokens.decode(authorization.substring(7));
            long id = Long.parseLong(jwt.getSubject());
            var principal = identity.authenticate(id, jwt.getClaimAsString("sid"));
            var authentication =
                    UsernamePasswordAuthenticationToken.authenticated(
                            principal,
                            null,
                            List.of(new SimpleGrantedAuthority("ROLE_" + principal.user().role())));
            SecurityContextHolder.getContext().setAuthentication(authentication);
        } catch (ApiException error) {
            invalid(request, response, error.code());
            return;
        } catch (JwtValidationException error) {
            // Jwt timestamp validation identifies expiry only after a valid cryptographic
            // signature.
            boolean expired =
                    error.getErrors().stream()
                            .anyMatch(e -> e.getDescription().startsWith("Jwt expired at"));
            invalid(request, response, expired ? "ACCESS_TOKEN_EXPIRED" : "INVALID_TOKEN");
            return;
        } catch (JwtException | IllegalArgumentException error) {
            invalid(
                    request,
                    response,
                    error instanceof TokenService.ExpiredAccessTokenException
                            ? "ACCESS_TOKEN_EXPIRED"
                            : "INVALID_TOKEN");
            return;
        } catch (DataAccessException error) {
            errors.write(
                    request,
                    response,
                    503,
                    "SERVICE_UNAVAILABLE",
                    "Authentication service is temporarily unavailable.");
            return;
        }
        chain.doFilter(request, response);
    }

    private void invalid(HttpServletRequest request, HttpServletResponse response, String code)
            throws IOException {
        errors.write(request, response, 401, code, "Authentication is invalid or expired.");
    }
}
