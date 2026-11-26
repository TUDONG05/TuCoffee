package com.tuscoffee;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.tuscoffee.dto.GoogleIdentity;
import com.tuscoffee.entity.*;
import com.tuscoffee.exception.ApiException;
import com.tuscoffee.repository.*;
import com.tuscoffee.security.*;
import com.tuscoffee.service.IdentityService;
import com.tuscoffee.validation.IdentityValidation;
import jakarta.validation.Validation;
import java.util.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

class GoogleIdentityTests {
    private final UserRepository users = mock(UserRepository.class);
    private final AuthSessionRepository sessions = mock(AuthSessionRepository.class);
    private final AuthRateLimitRepository limits = mock(AuthRateLimitRepository.class);
    private final IdentityLockRepository locks = mock(IdentityLockRepository.class);
    private final BCryptPasswordEncoder passwords = new BCryptPasswordEncoder(4);
    private IdentityService identity;
    private final GoogleIdentity google = new GoogleIdentity("subject-1", "an@example.com", "Nguyễn An");

    @BeforeEach void setup() {
        identity = new IdentityService(users, sessions, mock(AuthTokenHistoryRepository.class), limits, locks,
                new IdentityValidation(Validation.buildDefaultValidatorFactory().getValidator()), passwords,
                new TokenService(new AuthSettings(Base64.getEncoder().encodeToString(new byte[32]), List.of(), true)));
        when(locks.acquire()).thenReturn(Optional.of(mock(IdentityLock.class)));
        when(users.saveAndFlush(any())).thenAnswer(call -> {
            User user = call.getArgument(0);
            var id = User.class.getDeclaredField("id"); id.setAccessible(true); id.set(user, 5L);
            return user;
        });
        when(sessions.saveAndFlush(any())).thenAnswer(call -> call.getArgument(0));
    }

    @Test void createsGoogleOnlyUserAndIssuesNormalSession() {
        var result = identity.googleLogin(google, null, "127.0.0.1");
        assertEquals("USER", result.response().user().role());
        assertFalse(result.response().user().passwordLoginAvailable());
        assertNotNull(result.refreshToken());
        verify(users).saveAndFlush(argThat(user -> "subject-1".equals(user.getGoogleSubject()) && user.getPasswordHash() == null));
    }

    @Test void requiresExistingPasswordBeforeLinkingAndPreservesRole() throws Exception {
        User existing = account("ADMIN");
        when(users.findByEmail(google.email())).thenReturn(Optional.of(existing));
        assertEquals("GOOGLE_LINK_REQUIRED", assertThrows(ApiException.class, () -> identity.googleLogin(google, null, "ip")).code());
        assertNull(existing.getGoogleSubject());
        assertEquals(401, assertThrows(ApiException.class, () -> identity.googleLogin(google, "wrong", "ip")).status());
        verify(limits, times(2)).save(any());
        assertNull(existing.getGoogleSubject());
        var result = identity.googleLogin(google, "correct-password", "ip");
        assertEquals("subject-1", existing.getGoogleSubject());
        assertEquals("ADMIN", result.response().user().role());
    }

    @Test void linkedSubjectIsStableEvenWhenGoogleEmailChanges() throws Exception {
        User existing = account("USER"); existing.linkGoogle("subject-1");
        when(users.findByGoogleSubject("subject-1")).thenReturn(Optional.of(existing));
        assertEquals(5, identity.googleLogin(new GoogleIdentity("subject-1", "changed@example.com", "Other"), null, "ip").response().user().id());
        verify(users, never()).findByEmail(any());
    }

    @Test void disabledAndConflictingAccountsCannotSignIn() throws Exception {
        User existing = account("USER"); existing.linkGoogle("other-subject");
        when(users.findByEmail(google.email())).thenReturn(Optional.of(existing));
        assertEquals("GOOGLE_IDENTITY_CONFLICT", assertThrows(ApiException.class, () -> identity.googleLogin(google, "correct-password", "ip")).code());
        existing.setActive(false);
        when(users.findByGoogleSubject("subject-1")).thenReturn(Optional.of(existing));
        assertEquals("ACCOUNT_DISABLED", assertThrows(ApiException.class, () -> identity.googleLogin(google, null, "ip")).code());
        verify(sessions, never()).saveAndFlush(any());
    }

    @Test void blockedLinkAttemptsCannotCreateOrLinkAnything() {
        AuthRateLimit limit = mock(AuthRateLimit.class);
        when(limit.isBlocked(any())).thenReturn(true);
        when(limits.findById(anyString())).thenReturn(Optional.of(limit));
        assertEquals(429, assertThrows(ApiException.class, () -> identity.googleLogin(google, "guess", "ip")).status());
        verify(users, never()).saveAndFlush(any());
        verify(sessions, never()).saveAndFlush(any());
    }

    private User account(String role) throws Exception {
        User user = new User("Nguyễn An", "an@example.com", passwords.encode("correct-password"), role);
        var id = User.class.getDeclaredField("id"); id.setAccessible(true); id.set(user, 5L);
        return user;
    }
}
