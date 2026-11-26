package com.tuscoffee.controller;

import com.tuscoffee.dto.*;
import com.tuscoffee.exception.ApiException;
import com.tuscoffee.security.*;
import com.tuscoffee.service.IdentityService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.time.Duration;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/auth/google")
public class GoogleAuthController {
    private static final String COOKIE = "tucoffee_google_nonce";
    private final GoogleSettings google;
    private final AuthSettings settings;
    private final TokenService tokens;
    private final GoogleTokenVerifier verifier;
    private final IdentityService identity;
    private final AuthController auth;

    public GoogleAuthController(GoogleSettings google, AuthSettings settings, TokenService tokens,
            GoogleTokenVerifier verifier, IdentityService identity, AuthController auth) {
        this.google = google; this.settings = settings; this.tokens = tokens;
        this.verifier = verifier; this.identity = identity; this.auth = auth;
    }

    @GetMapping("/config")
    public ResponseEntity<GoogleLoginConfig> config() {
        if (!google.enabled()) return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(new GoogleLoginConfig(false, null, null));
        String nonce = tokens.googleNonce();
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .header(HttpHeaders.SET_COOKIE, cookie(nonce, Duration.ofMinutes(5)).toString())
                .body(new GoogleLoginConfig(true, google.clientId(), nonce));
    }

    @PostMapping
    public AuthResponse login(@RequestBody GoogleLoginRequest input,
            @CookieValue(name = COOKIE, required = false) String nonce,
            HttpServletRequest request, HttpServletResponse response) {
        response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
        if (!google.enabled()) throw new ApiException(503, "GOOGLE_NOT_CONFIGURED", "Đăng nhập Google chưa được cấu hình.");
        if (!tokens.validGoogleNonce(nonce))
            throw new ApiException(401, "GOOGLE_NONCE_INVALID", "Phiên Google đã hết hạn. Vui lòng chọn lại tài khoản.");
        var verified = verifier.verify(input.credential(), nonce);
        var result = identity.googleLogin(verified, input.currentPassword(), request.getRemoteAddr());
        auth.authenticatedCookies(result, request, response, true);
        response.addHeader(HttpHeaders.SET_COOKIE, cookie("", Duration.ZERO).toString());
        return result.response();
    }

    private ResponseCookie cookie(String value, Duration age) {
        return ResponseCookie.from(COOKIE, value).httpOnly(true).secure(settings.cookieSecure())
                .sameSite("Strict").path("/api/v1/auth/google").maxAge(age).build();
    }
}
