package com.tuscoffee;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.tuscoffee.config.SecurityConfig;
import com.tuscoffee.controller.AuthController;
import com.tuscoffee.controller.GoogleAuthController;
import com.tuscoffee.dto.*;
import com.tuscoffee.exception.*;
import com.tuscoffee.security.*;
import com.tuscoffee.service.IdentityService;
import jakarta.servlet.http.Cookie;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.*;
import org.springframework.mock.web.MockServletContext;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.test.context.support.TestPropertySourceUtils;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.support.AnnotationConfigWebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
import tools.jackson.databind.json.JsonMapper;

/** Real MVC + security filters, offline Google/identity boundary; no application database. */
class GoogleSecurityHttpTests {
    @Configuration
    @EnableWebMvc
    @EnableWebSecurity
    @Import({SecurityConfig.class, AuthController.class, GoogleAuthController.class, ApiExceptionHandler.class})
    static class Config {
        @Bean com.tuscoffee.service.TurnstileService turnstile() { return mock(com.tuscoffee.service.TurnstileService.class); }
        @Bean IdentityService identity() { return mock(IdentityService.class); }
        @Bean GoogleTokenVerifier verifier() { return mock(GoogleTokenVerifier.class); }
        @Bean TokenService tokens(AuthSettings settings) { return new TokenService(settings); }
        @Bean ApiErrors errors() { return new ApiErrors(JsonMapper.builder().build()); }
    }

    @Test void googlePostEnforcesCsrfAndSetsActualSessionCookies() throws Exception {
        try (var context = new AnnotationConfigWebApplicationContext()) {
            context.setServletContext(new MockServletContext());
            TestPropertySourceUtils.addInlinedPropertiesToEnvironment(context,
                    "auth.jwt-secret=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
                    "auth.allowed-origins=http://localhost:4200", "auth.cookie-secure=false",
                    "auth.google.client-id=test-client");
            context.register(Config.class); context.refresh();
            var mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
            var turnstile = context.getBean(com.tuscoffee.service.TurnstileService.class);
            when(turnstile.config()).thenReturn(new com.tuscoffee.service.TurnstileService.Config(false,null));
            mvc.perform(get("/api/v1/auth/turnstile/config")).andExpect(status().isOk()).andExpect(jsonPath("$.enabled").value(false));
            doThrow(new ApiException(400,"TURNSTILE_REQUIRED","Verification required")).when(turnstile).verify(isNull(),eq("login"));
            mvc.perform(post("/api/v1/auth/login").with(csrf()).contentType("application/json").content("{}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("TURNSTILE_REQUIRED"));
            verifyNoInteractions(context.getBean(IdentityService.class));
            String nonce = JsonMapper.builder().build().readTree(mvc.perform(get("/api/v1/auth/google/config"))
                    .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("nonce").asText();
            String body = "{\"credential\":\"signed-google-credential\"}";
            mvc.perform(post("/api/v1/auth/google").contentType("application/json").content(body)
                    .cookie(new Cookie("tucoffee_google_nonce", nonce)))
                    .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("CSRF_INVALID"));
            var identity = context.getBean(IdentityService.class);
            verifyNoInteractions(identity);
            var verified = new GoogleIdentity("sub", "an@example.com", "An");
            when(context.getBean(GoogleTokenVerifier.class).verify("signed-google-credential", nonce)).thenReturn(verified);
            when(identity.googleLogin(eq(verified), isNull(), anyString())).thenReturn(
                    new AuthResult(new AuthResponse("access-token", 900, null), "refresh-token", Instant.now().plusSeconds(300)));
            var response = mvc.perform(post("/api/v1/auth/google").with(csrf())
                    .contentType("application/json").content(body).cookie(new Cookie("tucoffee_google_nonce", nonce)))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.accessToken").value("access-token"))
                    .andReturn().getResponse();
            var cookies = response.getHeaders("Set-Cookie");
            assertTrue(cookies.stream().anyMatch(cookie -> cookie.startsWith("tucoffee_refresh=refresh-token") && cookie.contains("HttpOnly")));
            assertTrue(cookies.stream().anyMatch(cookie -> cookie.startsWith("tucoffee_google_nonce=") && cookie.contains("Max-Age=0")));
            assertTrue(cookies.stream().anyMatch(cookie -> cookie.startsWith("XSRF-TOKEN=")));
        }
    }
}
