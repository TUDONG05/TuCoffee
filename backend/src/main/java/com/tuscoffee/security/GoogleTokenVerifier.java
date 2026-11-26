package com.tuscoffee.security;

import com.tuscoffee.dto.GoogleIdentity;
import com.tuscoffee.exception.ApiException;
import java.time.Duration;
import java.time.Instant;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;
import org.springframework.http.client.SimpleClientHttpRequestFactory;

@Component
public class GoogleTokenVerifier {
    private final GoogleSettings settings;
    private final JwtDecoder decoder;

    @Autowired
    public GoogleTokenVerifier(GoogleSettings settings) {
        this(settings, googleDecoder());
    }

    GoogleTokenVerifier(GoogleSettings settings, JwtDecoder decoder) {
        this.settings = settings;
        this.decoder = decoder;
    }

    private static JwtDecoder googleDecoder() {
        var factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(3));
        factory.setReadTimeout(Duration.ofSeconds(3));
        // Fixed provider URL; never fetch a URL supplied in an untrusted token.
        return NimbusJwtDecoder.withJwkSetUri("https://www.googleapis.com/oauth2/v3/certs")
                .restOperations(new RestTemplate(factory)).build();
    }

    public GoogleIdentity verify(String credential, String nonce) {
        if (!settings.enabled())
            throw new ApiException(503, "GOOGLE_NOT_CONFIGURED", "Đăng nhập Google chưa được cấu hình.");
        if (credential == null || credential.length() > 16384 || nonce == null || nonce.isBlank()) throw invalid();
        try {
            var jwt = decoder.decode(credential);
            String issuer = jwt.getClaimAsString("iss");
            String subject = jwt.getSubject();
            String email = jwt.getClaimAsString("email");
            String authorizedParty = jwt.getClaimAsString("azp");
            if (issuer == null || !Set.of("https://accounts.google.com", "accounts.google.com").contains(issuer)
                    || jwt.getAudience() == null || !jwt.getAudience().contains(settings.clientId())
                    || (authorizedParty != null && !settings.clientId().equals(authorizedParty))
                    || jwt.getExpiresAt() == null || !jwt.getExpiresAt().isAfter(Instant.now())
                    || subject == null || subject.isBlank() || subject.length() > 255
                    || email == null || email.isBlank() || email.length() > 150
                    || !Boolean.TRUE.equals(jwt.getClaims().get("email_verified"))
                    || !nonce.equals(jwt.getClaimAsString("nonce"))) throw invalid();
            String name = jwt.getClaimAsString("name");
            if (name == null || name.trim().length() < 2) name = "Khách Google";
            name = name.trim();
            if (name.length() > 100) name = name.substring(0, Character.isHighSurrogate(name.charAt(99)) ? 99 : 100);
            return new GoogleIdentity(subject, email, name);
        } catch (JwtException | IllegalArgumentException error) {
            throw invalid();
        }
    }

    private ApiException invalid() {
        return new ApiException(401, "GOOGLE_TOKEN_INVALID", "Thông tin Google không hợp lệ hoặc đã hết hạn. Vui lòng chọn lại tài khoản.");
    }
}
