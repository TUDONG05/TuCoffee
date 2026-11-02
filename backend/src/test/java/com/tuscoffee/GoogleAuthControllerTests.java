package com.tuscoffee;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.tuscoffee.controller.*;
import com.tuscoffee.dto.*;
import com.tuscoffee.exception.ApiException;
import com.tuscoffee.security.*;
import com.tuscoffee.service.IdentityService;
import java.util.Base64;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class GoogleAuthControllerTests {
    private final AuthSettings settings = new AuthSettings(Base64.getEncoder().encodeToString(new byte[32]), List.of(), true);
    private final TokenService tokens = new TokenService(settings);
    private final GoogleTokenVerifier verifier = mock(GoogleTokenVerifier.class);
    private final IdentityService identity = mock(IdentityService.class);
    private final AuthController auth = mock(AuthController.class);

    private GoogleAuthController controller(String clientId) {
        return new GoogleAuthController(new GoogleSettings(clientId), settings, tokens, verifier, identity, auth);
    }

    @Test void disabledConfigurationDoesNotIssueNonce() {
        var result = controller("").config();
        assertFalse(result.getBody().enabled());
        assertNull(result.getBody().nonce());
        assertNull(result.getHeaders().getFirst("Set-Cookie"));
    }

    @Test void challengeIsNoStoreHttpOnlySecureAndScoped() {
        var result = controller("web-client").config();
        String cookie = result.getHeaders().getFirst("Set-Cookie");
        assertTrue(tokens.validGoogleNonce(result.getBody().nonce()));
        assertEquals("no-store", result.getHeaders().getCacheControl());
        assertTrue(cookie.contains("HttpOnly")); assertTrue(cookie.contains("Secure"));
        assertTrue(cookie.contains("SameSite=Strict")); assertTrue(cookie.contains("Max-Age=300"));
        assertTrue(cookie.contains("Path=/api/v1/auth/google"));
    }

    @Test void missingOrForgedNonceNeverReachesIdentityService() {
        for (String nonce : new String[] {null, "forged", tokens.access(1, "session")}) {
            var error = assertThrows(ApiException.class, () -> controller("web-client").login(
                    new GoogleLoginRequest("credential", null), nonce, new MockHttpServletRequest(), new MockHttpServletResponse()));
            assertEquals("GOOGLE_NONCE_INVALID", error.code());
        }
        verifyNoInteractions(identity, verifier, auth);
    }

    @Test void successfulLoginUsesExistingCookiesAndClearsNonce() {
        var google = new GoogleIdentity("google-sub", "an@example.com", "An");
        var result = new AuthResult(new AuthResponse("access", 900, null), "refresh", java.time.Instant.now().plusSeconds(300));
        String nonce = tokens.googleNonce();
        when(verifier.verify("credential", nonce)).thenReturn(google);
        var request = new MockHttpServletRequest(); var response = new MockHttpServletResponse();
        when(identity.googleLogin(google, "password", request.getRemoteAddr())).thenReturn(result);
        assertEquals(result.response(), controller("web-client").login(new GoogleLoginRequest("credential", "password"), nonce, request, response));
        verify(auth).authenticatedCookies(result, request, response, true);
        assertTrue(response.getHeader("Set-Cookie").contains("Max-Age=0"));
    }
}
