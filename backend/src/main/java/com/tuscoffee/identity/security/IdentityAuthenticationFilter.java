package com.tuscoffee.identity.security;

import com.tuscoffee.identity.IdentityStore;
import com.tuscoffee.shared.error.ApiErrors;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Instant;
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
    private final IdentityStore store;
    private final ApiErrors errors;
    public IdentityAuthenticationFilter(TokenService tokens, IdentityStore store, ApiErrors errors) {
        this.tokens = tokens; this.store = store; this.errors = errors;
    }
    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getServletPath();
        return !(path.startsWith("/api/v1/users/") || path.startsWith("/api/v1/admin/"));
    }
    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String authorization = request.getHeader("Authorization");
        if (authorization == null) { chain.doFilter(request, response); return; }
        if (!authorization.startsWith("Bearer ")) { invalid(request, response, "INVALID_TOKEN"); return; }
        try {
            var jwt = tokens.decode(authorization.substring(7));
            long id = Long.parseLong(jwt.getSubject());
            var session = store.session(jwt.getClaimAsString("sid"));
            if (session.isEmpty() || session.get().userId() != id || session.get().revokedAt() != null) {
                invalid(request, response, "SESSION_REVOKED"); return;
            }
            if (!session.get().expiresAt().isAfter(Instant.now())) {
                invalid(request, response, "SESSION_EXPIRED"); return;
            }
            var account = store.byId(id);
            if (account.isEmpty() || !account.get().user().active()) {
                invalid(request, response, "ACCOUNT_DISABLED"); return;
            }
            var user = account.get().user();
            var principal = new IdentityPrincipal(user, session.get().id());
            var authentication = UsernamePasswordAuthenticationToken.authenticated(principal, null,
                    List.of(new SimpleGrantedAuthority("ROLE_" + user.role())));
            SecurityContextHolder.getContext().setAuthentication(authentication);
        } catch (JwtValidationException error) {
            // Jwt timestamp validation identifies expiry only after a valid cryptographic signature.
            boolean expired = error.getErrors().stream().anyMatch(e -> e.getDescription().startsWith("Jwt expired at"));
            invalid(request, response, expired ? "ACCESS_TOKEN_EXPIRED" : "INVALID_TOKEN"); return;
        } catch (JwtException | IllegalArgumentException error) {
            invalid(request, response, error instanceof TokenService.ExpiredAccessTokenException ? "ACCESS_TOKEN_EXPIRED" : "INVALID_TOKEN"); return;
        } catch (DataAccessException error) {
            errors.write(request, response, 503, "SERVICE_UNAVAILABLE", "Authentication service is temporarily unavailable."); return;
        }
        chain.doFilter(request, response);
    }
    private void invalid(HttpServletRequest request, HttpServletResponse response, String code) throws IOException {
        errors.write(request, response, 401, code, "Authentication is invalid or expired.");
    }
}
