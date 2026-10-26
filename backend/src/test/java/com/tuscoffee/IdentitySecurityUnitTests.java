package com.tuscoffee;

import static org.junit.jupiter.api.Assertions.*;

import com.tuscoffee.identity.IdentityRequests;
import com.tuscoffee.identity.IdentityService;
import com.tuscoffee.identity.security.AuthSettings;
import com.tuscoffee.identity.security.TokenService;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.JwtException;

class IdentitySecurityUnitTests {
    @Test
    void credentialsAndAuthResponsesNeverExposeSecretsViaDiagnosticString() {
        String secret = "DO-NOT-LOG-THIS-CREDENTIAL";
        var response = new IdentityService.AuthResponse(secret, 900, null);
        List<Object> values = List.of(new IdentityRequests.Register("User", "a@example.com", secret),
                new IdentityRequests.Login("a@example.com", secret), new IdentityRequests.Password(secret, secret),
                new AuthSettings(secret, List.of("http://localhost:4200"), true), response,
                new IdentityService.AuthResult(response, secret, Instant.now()));
        values.forEach(value -> assertFalse(value.toString().contains(secret), value.getClass().getSimpleName()));
    }

    @Test
    void jwtConfigurationRejectsMissingMalformedAndWeakSecrets() {
        assertThrows(IllegalStateException.class, () -> tokenService(null));
        assertThrows(IllegalStateException.class, () -> tokenService("not:base64"));
        assertThrows(IllegalStateException.class, () -> tokenService(Base64.getEncoder().encodeToString(new byte[31])));
    }

    @Test
    void jwtSignatureAndRandomRefreshHaveRequiredStrength() {
        var tokens = tokenService(Base64.getEncoder().encodeToString(new byte[32]));
        String access = tokens.access(41, "test-session-id");
        var parsed = tokens.decode(access);
        assertEquals("41", parsed.getSubject());
        assertEquals("tu-coffee", parsed.getClaimAsString("iss"));
        assertEquals("test-session-id", parsed.getClaimAsString("sid"));
        assertEquals(900, parsed.getExpiresAt().getEpochSecond() - parsed.getIssuedAt().getEpochSecond());
        assertThrows(JwtException.class, () -> tokens.decode(access.substring(0, access.lastIndexOf('.') + 1) + "invalidSignature"));
        String refresh = tokens.refresh();
        assertEquals(32, Base64.getUrlDecoder().decode(refresh).length);
        assertNotEquals(refresh, tokens.refresh());
        assertEquals(64, tokens.hash(refresh).length());
        assertEquals(tokens.hash(refresh), tokens.hash(refresh));
    }

    private TokenService tokenService(String secret) {
        return new TokenService(new AuthSettings(secret, List.of("http://localhost:4200"), true));
    }
}
