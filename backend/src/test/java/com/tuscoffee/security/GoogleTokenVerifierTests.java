package com.tuscoffee.security;

import static org.junit.jupiter.api.Assertions.*;

import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.tuscoffee.exception.ApiException;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.*;

class GoogleTokenVerifierTests {
    private final RSAKey key = new RSAKeyGenerator(2048).keyID("test").generate();
    private final JwtEncoder encoder = new NimbusJwtEncoder(new ImmutableJWKSet<>(new JWKSet(key)));
    private final GoogleTokenVerifier verifier = new GoogleTokenVerifier(
            new GoogleSettings("web-client"), NimbusJwtDecoder.withPublicKey(key.toRSAPublicKey()).build());

    GoogleTokenVerifierTests() throws Exception {}

    private String token(String issuer, String audience, Instant expiry, boolean verified, String nonce) {
        var claims = JwtClaimsSet.builder().issuer(issuer).subject("google-123")
                .audience(List.of(audience)).issuedAt(Instant.now().minusSeconds(600)).expiresAt(expiry)
                .claim("email", "an@example.com").claim("email_verified", verified)
                .claim("name", "Nguyễn An").claim("nonce", nonce).build();
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(SignatureAlgorithm.RS256).keyId("test").build(), claims)).getTokenValue();
    }

    @Test void verifiesSignedIdentityAndRejectsWrongClaims() {
        String valid = token("https://accounts.google.com", "web-client", Instant.now().plusSeconds(300), true, "nonce");
        assertEquals("google-123", verifier.verify(valid, "nonce").subject());
        assertRejected(valid, "other-browser");
        assertRejected(token("https://attacker.example", "web-client", Instant.now().plusSeconds(300), true, "nonce"), "nonce");
        assertRejected(token("https://accounts.google.com", "other-client", Instant.now().plusSeconds(300), true, "nonce"), "nonce");
        assertRejected(token("https://accounts.google.com", "web-client", Instant.now().minusSeconds(1), true, "nonce"), "nonce");
        assertRejected(token("https://accounts.google.com", "web-client", Instant.now().plusSeconds(300), false, "nonce"), "nonce");
        int signature = valid.lastIndexOf('.') + 1;
        char changed = valid.charAt(signature) == 'A' ? 'B' : 'A';
        assertRejected(valid.substring(0, signature) + changed + valid.substring(signature + 1), "nonce");
    }

    @Test void requiresConfigurationAndBrowserNonce() {
        assertEquals(503, assertThrows(ApiException.class, () ->
                new GoogleTokenVerifier(new GoogleSettings(""), jwt -> null).verify("token", "nonce")).status());
        assertRejected("not-a-token", "nonce");
        assertRejected(token("https://accounts.google.com", "web-client", Instant.now().plusSeconds(300), true, "nonce"), null);
    }

    @Test void signedTokenWithMissingAudienceIsRejectedAsAnAuthError() {
        var claims = JwtClaimsSet.builder().issuer("https://accounts.google.com").subject("google-123")
                .expiresAt(Instant.now().plusSeconds(300)).claim("email", "an@example.com")
                .claim("email_verified", true).claim("nonce", "nonce").build();
        String token = encoder.encode(JwtEncoderParameters.from(JwsHeader.with(SignatureAlgorithm.RS256).keyId("test").build(), claims)).getTokenValue();
        assertRejected(token, "nonce");
    }

    @Test void nonceIsSignedExpiringAndCannotBeUsedAsAccessToken() {
        var tokens = new TokenService(new AuthSettings(Base64.getEncoder().encodeToString(new byte[32]), List.of(), true));
        String nonce = tokens.googleNonce();
        assertTrue(tokens.validGoogleNonce(nonce));
        assertFalse(tokens.validGoogleNonce(tokens.access(1, "session")));
        assertFalse(tokens.validGoogleNonce("forged"));
        assertThrows(JwtException.class, () -> tokens.decode(nonce));
    }

    private void assertRejected(String token, String nonce) {
        assertEquals("GOOGLE_TOKEN_INVALID", assertThrows(ApiException.class, () -> verifier.verify(token, nonce)).code());
    }
}
