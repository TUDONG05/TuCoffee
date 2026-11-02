package com.tuscoffee.controller;

import com.tuscoffee.dto.AuthResponse;
import com.tuscoffee.dto.AuthResult;
import com.tuscoffee.dto.LoginRequest;
import com.tuscoffee.dto.RegisterRequest;
import com.tuscoffee.dto.UserResponse;
import com.tuscoffee.service.IdentityService;
import com.tuscoffee.security.AuthSettings;
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
    private final com.tuscoffee.service.TurnstileService turnstile;
    private final IdentityService identity;
    private final AuthSettings settings;
    private final CookieCsrfTokenRepository csrf;

    public AuthController(
            IdentityService identity, AuthSettings settings, CookieCsrfTokenRepository csrf,
            com.tuscoffee.service.TurnstileService turnstile) {
        this.turnstile = turnstile;
        this.identity = identity;
        this.settings = settings;
        this.csrf = csrf;
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

    @GetMapping("/turnstile/config")
    public ResponseEntity<com.tuscoffee.service.TurnstileService.Config> turnstileConfig() {
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL,"no-store").body(turnstile.config());
    }

    @PostMapping("/register")
    public ResponseEntity<UserResponse> register(@RequestBody RegisterRequest input,
            @RequestHeader(name="X-Turnstile-Token",required=false) String token) {
        turnstile.verify(token,"register");
        return ResponseEntity.status(201)
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(identity.register(input));
    }

    @PostMapping("/login")
    public AuthResponse login(
            @RequestBody LoginRequest input,
            @RequestHeader(name="X-Turnstile-Token",required=false) String token,
            HttpServletRequest request,
            HttpServletResponse response) {
        turnstile.verify(token,"login");
        var result = identity.login(input, request.getRemoteAddr());
        authenticatedCookies(result, request, response, true);
        return result.response();
    }

    @PostMapping("/refresh")
    public AuthResponse refresh(
            @CookieValue(name = "tucoffee_refresh", required = false) String refresh,
            HttpServletRequest request,
            HttpServletResponse response) {
        var result = identity.refresh(refresh);
        authenticatedCookies(result, request, response, false);
        return result.response();
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(
            @CookieValue(name = "tucoffee_refresh", required = false) String refresh,
            HttpServletRequest request,
            HttpServletResponse response) {
        identity.logout(refresh, request.getHeader(HttpHeaders.AUTHORIZATION));
        response.addHeader(HttpHeaders.SET_COOKIE, cookie("", Duration.ZERO).toString());
        csrf.saveToken(null, request, response);
        return ResponseEntity.noContent().header(HttpHeaders.CACHE_CONTROL, "no-store").build();
    }

    public void authenticatedCookies(
            AuthResult result,
            HttpServletRequest request,
            HttpServletResponse response,
            boolean rotateCsrf) {
        response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
        response.addHeader(
                HttpHeaders.SET_COOKIE,
                cookie(
                                result.refreshToken(),
                                Duration.between(Instant.now(), result.refreshExpiry()))
                        .toString());
        if (rotateCsrf) csrf.saveToken(null, request, response);
    }

    private ResponseCookie cookie(String value, Duration duration) {
        return ResponseCookie.from("tucoffee_refresh", value)
                .httpOnly(true)
                .secure(settings.cookieSecure())
                .sameSite("Strict")
                .path("/api/v1/auth")
                .maxAge(duration.isNegative() ? Duration.ZERO : duration)
                .build();
    }
}
