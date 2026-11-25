package com.tuscoffee.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import com.tuscoffee.entity.IdentityLock;
import com.tuscoffee.entity.User;
import com.tuscoffee.exception.ApiException;
import com.tuscoffee.repository.*;
import com.tuscoffee.validation.IdentityValidation;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.support.TransactionSynchronizationManager;

class RecoveryServiceUnitTests {
    JdbcTemplate db=mock(JdbcTemplate.class);
    IdentityLockRepository lock=mock(IdentityLockRepository.class);
    UserRepository users=mock(UserRepository.class);
    AuthSessionRepository sessions=mock(AuthSessionRepository.class);
    IdentityValidation validation=mock(IdentityValidation.class);
    PasswordEncoder passwords=mock(PasswordEncoder.class);
    RecoveryDelivery delivery=mock(RecoveryDelivery.class);
    Instant now=Instant.parse("2026-11-09T00:00:00Z");
    RecoveryService service;
    @BeforeEach void setup() {
        when(lock.acquire()).thenReturn(Optional.of(mock(IdentityLock.class)));
        when(validation.email(anyString())).thenAnswer(i->i.getArgument(0));
        when(db.queryForList(anyString(),any(Object.class))).thenReturn(List.of());
        when(users.findByEmail(anyString())).thenReturn(Optional.empty());
        service=new RecoveryService(db,lock,users,sessions,validation,passwords,Clock.fixed(now,ZoneOffset.UTC),Runnable::run,delivery,"unit-test-secret-32-characters-long-enough");
    }
    @Test void absentEmailStillReturnsOpaqueChallengeWithoutDelivery() {
        var response=service.request("absent@example.com","127.0.0.1");
        assertDoesNotThrow(()->UUID.fromString(response.challengeId()));
        assertEquals(600,response.expiresIn()); assertEquals(60,response.resendAfter());
        verify(db, never()).update(startsWith("INSERT INTO password_reset_challenges"), any(Object[].class));
        verify(db, times(2)).update(startsWith("INSERT INTO password_reset_limits"), any(Object[].class));
        verifyNoInteractions(delivery);
    }
    @Test void blockedIpDoesNotAllocateChallengesOrEmailLimiterRows() {
        when(db.queryForList(startsWith("SELECT window_start"), any(Object.class))).thenReturn(List.of(
                Map.of("window_start", Timestamp.from(now), "last_sent_at", Timestamp.from(now), "request_count", 5)));
        for (int i=0; i<32; i++) {
            var response=service.request("absent-"+i+"@example.com", "127.0.0.1");
            assertDoesNotThrow(()->UUID.fromString(response.challengeId()));
            assertEquals(600, response.expiresIn());
            assertEquals(60, response.resendAfter());
        }
        verify(db, times(32)).queryForList(startsWith("SELECT window_start"), any(Object.class));
        verify(db, never()).update(anyString(), any(Object[].class));
        verify(users, never()).findByEmail(anyString());
        verifyNoInteractions(delivery);
    }
    @Test void wrongCodePersistsAttemptBeforeError() {
        Map<String,Object> row=new HashMap<>(); row.put("user_id",1L); row.put("attempts",0);
        row.put("expires_at",Timestamp.from(now.plusSeconds(600))); row.put("code_hash","0".repeat(64));
        when(db.queryForList(startsWith("SELECT user_id"),any(Object.class))).thenReturn(List.of(row));
        assertThrows(ApiException.class,()->service.reset(UUID.randomUUID().toString(),"123456","valid-password"));
        verify(db).update(startsWith("UPDATE password_reset_challenges SET attempts"),any(Object.class));
        verifyNoInteractions(sessions); verify(users,never()).findById(anyLong());
    }
    @Test void expiredChallengeNeverChangesPassword() {
        Map<String,Object> row=new HashMap<>(); row.put("user_id",1L); row.put("attempts",0);
        row.put("expires_at",Timestamp.from(now)); row.put("code_hash","0".repeat(64));
        when(db.queryForList(startsWith("SELECT user_id"),any(Object.class))).thenReturn(List.of(row));
        assertThrows(ApiException.class,()->service.reset(UUID.randomUUID().toString(),"123456","valid-password"));
        verifyNoInteractions(sessions); verify(passwords,never()).encode(anyString());
    }
    @Test void fiveAttemptsCannotGuessAgain() {
        Map<String,Object> row=new HashMap<>(); row.put("user_id",1L); row.put("attempts",5);
        row.put("expires_at",Timestamp.from(now.plusSeconds(600))); row.put("code_hash","0".repeat(64));
        when(db.queryForList(startsWith("SELECT user_id"),any(Object.class))).thenReturn(List.of(row));
        assertThrows(ApiException.class,()->service.reset(UUID.randomUUID().toString(),"123456","valid-password"));
        verifyNoInteractions(sessions);
    }
    @Test void deliveryWaitsForDatabaseCommit() {
        when(users.findByEmail(anyString())).thenReturn(Optional.of(new User("Test","test@example.com","hash","USER")));
        // Mocked account ID to exercise real eligible path without a persisted entity.
        User user=mock(User.class); when(user.getId()).thenReturn(1L); when(user.isActive()).thenReturn(true); when(user.getPasswordHash()).thenReturn("hash");
        when(users.findByEmail(anyString())).thenReturn(Optional.of(user));
        TransactionSynchronizationManager.initSynchronization();
        try {
            service.request("test@example.com","127.0.0.1");
            verifyNoInteractions(delivery);
            TransactionSynchronizationManager.getSynchronizations().forEach(s->s.afterCommit());
            verify(delivery).deliver(anyString(),eq("test@example.com"),matches("[0-9]{6}"));
        } finally { TransactionSynchronizationManager.clearSynchronization(); }
    }
}
