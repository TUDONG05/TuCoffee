package com.tuscoffee.identity;

import com.tuscoffee.identity.security.AuthSettings;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
    private final IdentityService identity;
    private final AuthSettings settings;
    private final CookieCsrfTokenRepository csrf;
    public AuthController(IdentityService identity, AuthSettings settings, CookieCsrfTokenRepository csrf) {
        this.identity = identity; this.settings = settings; this.csrf = csrf;
    }
    @GetMapping("/csrf")
    public Map<String, String> csrf(HttpServletRequest request, HttpServletResponse response) {
        CsrfToken token = csrf.loadToken(request);
        if (token == null) {
            token = csrf.generateToken(request);
            csrf.saveToken(token, request, response);
        }
        response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
        return Map.of("headerName", token.getHeaderName(), "token", token.getToken());
    }
    @PostMapping("/register")
    public ResponseEntity<User> register(@RequestBody IdentityRequests.Register input) {
        return ResponseEntity.status(201).header(HttpHeaders.CACHE_CONTROL, "no-store").body(identity.register(input));
    }
    @PostMapping("/login")
    public IdentityService.AuthResponse login(@RequestBody IdentityRequests.Login input,
                                              HttpServletRequest request, HttpServletResponse response) {
        var result = identity.login(input, request.getRemoteAddr());
        authenticatedCookies(result, request, response, true);
        return result.response();
    }
    @PostMapping("/refresh")
    public IdentityService.AuthResponse refresh(@CookieValue(name="tucoffee_refresh", required=false) String refresh,
                                                HttpServletRequest request, HttpServletResponse response) {
        var result = identity.refresh(refresh);
        authenticatedCookies(result, request, response, false);
        return result.response();
    }
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@CookieValue(name="tucoffee_refresh", required=false) String refresh,
                                       HttpServletRequest request, HttpServletResponse response) {
        identity.logout(refresh, request.getHeader(HttpHeaders.AUTHORIZATION));
        response.addHeader(HttpHeaders.SET_COOKIE, cookie("", Duration.ZERO).toString());
        csrf.saveToken(null, request, response);
        return ResponseEntity.noContent().header(HttpHeaders.CACHE_CONTROL, "no-store").build();
    }
    public void authenticatedCookies(IdentityService.AuthResult result, HttpServletRequest request,
                                     HttpServletResponse response, boolean rotateCsrf) {
        response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
        response.addHeader(HttpHeaders.SET_COOKIE, cookie(result.refreshToken(),
                Duration.between(Instant.now(), result.refreshExpiry())).toString());
        if (rotateCsrf) csrf.saveToken(null, request, response);
    }
    private ResponseCookie cookie(String value, Duration duration) {
        return ResponseCookie.from("tucoffee_refresh", value).httpOnly(true).secure(settings.cookieSecure())
                .sameSite("Strict").path("/api/v1/auth").maxAge(duration.isNegative() ? Duration.ZERO : duration).build();
    }
}
