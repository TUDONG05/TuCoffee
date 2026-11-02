package com.tuscoffee.security;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.stereotype.Service;

@Service
public class TokenService {
    private final JwtEncoder encoder;
    private final JwtDecoder decoder;
    private final JwtDecoder logoutDecoder;
    private final SecureRandom random = new SecureRandom();

    public TokenService(AuthSettings settings) {
        byte[] secret;
        try {
            secret = Base64.getDecoder().decode(settings.jwtSecret());
        } catch (IllegalArgumentException | NullPointerException error) {
            throw new IllegalStateException(
                    "AUTH_JWT_SECRET must be Base64 with at least 32 decoded bytes.");
        }
        if (secret.length < 32)
            throw new IllegalStateException(
                    "AUTH_JWT_SECRET must contain at least 32 decoded bytes.");
        var key = new SecretKeySpec(secret, "HmacSHA256");
        encoder = new NimbusJwtEncoder(new ImmutableSecret<>(key));
        var jwtDecoder =
                NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build();
        jwtDecoder.setJwtValidator(JwtValidators.createDefaultWithIssuer("tu-coffee"));
        decoder = jwtDecoder;
        var revocationDecoder =
                NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build();
        // Expired access can revoke its own session only; never use this decoder to
        // authenticate.
        revocationDecoder.setJwtValidator(new JwtIssuerValidator("tu-coffee"));
        logoutDecoder = revocationDecoder;
    }

    public String access(long userId, String sid) {
        Instant now = Instant.now();
        var claims =
                JwtClaimsSet.builder()
                        .issuer("tu-coffee")
                        .subject(Long.toString(userId))
                        .issuedAt(now)
                        .expiresAt(now.plusSeconds(900))
                        .claim("sid", sid)
                        .build();
        return encoder.encode(
                        JwtEncoderParameters.from(
                                JwsHeader.with(MacAlgorithm.HS256).build(), claims))
                .getTokenValue();
    }

    public Jwt decode(String token) {
        Jwt jwt = decoder.decode(token);
        // Do not accept expired access tokens within the decoder's default clock-skew
        // grace.
        if (jwt.getExpiresAt() == null) throw new BadJwtException("Missing expiry");
        if (!jwt.getExpiresAt().isAfter(Instant.now())) throw new ExpiredAccessTokenException();
        if (jwt.hasClaim("purpose")) throw new BadJwtException("Not an access token");
        return jwt;
    }

    public String googleNonce() {
        Instant now = Instant.now();
        var claims = JwtClaimsSet.builder().issuer("tu-coffee").subject(refresh())
                .issuedAt(now).expiresAt(now.plusSeconds(300)).claim("purpose", "google-login").build();
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
    }

    public boolean validGoogleNonce(String nonce) {
        if (nonce == null || nonce.length() > 2048) return false;
        try {
            var jwt = decoder.decode(nonce);
            return "google-login".equals(jwt.getClaimAsString("purpose"))
                    && jwt.getExpiresAt() != null && jwt.getExpiresAt().isAfter(Instant.now());
        } catch (JwtException | IllegalArgumentException error) { return false; }
    }

    public Jwt decodeForLogout(String token) {
        return logoutDecoder.decode(token);
    }

    public static final class ExpiredAccessTokenException extends BadJwtException {
        public ExpiredAccessTokenException() {
            super("Expired token");
        }
    }

    public String refresh() {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    public String hash(String token) {
        try {
            return HexFormat.of()
                    .formatHex(
                            MessageDigest.getInstance("SHA-256")
                                    .digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException("SHA-256 unavailable", error);
        }
    }
}
