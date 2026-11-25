package com.tuscoffee;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import com.tuscoffee.entity.User;
import com.tuscoffee.entity.AuthSession;
import com.tuscoffee.exception.ApiException;
import com.tuscoffee.repository.*;
import com.tuscoffee.service.*;
import java.time.*;
import java.util.UUID;
import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

@SpringBootTest
class RecoveryIntegrationTests extends MySqlIntegrationSupport {
    @Autowired RecoveryService recovery;
    @Autowired UserRepository users;
    @Autowired AuthSessionRepository sessions;
    @Autowired PasswordEncoder passwords;
    @Autowired JdbcTemplate db;
    @MockitoBean RecoveryDelivery delivery;
    @MockitoBean(name="recoveryClock") Clock clock;
    private final Instant now=Instant.parse("2026-11-09T00:00:00Z");
    private void assertNoChallenge(String id) {
        assertEquals(0, db.queryForObject("SELECT COUNT(*) FROM password_reset_challenges WHERE challenge_id=?", Integer.class, id));
    }
    @org.junit.jupiter.api.BeforeEach void fixedClock() { when(clock.instant()).thenReturn(now); }
    @Test void resetConsumesOnceRevokesAllAndPreservesRole() throws Exception {
        String email=UUID.randomUUID()+"@example.com";
        User user=users.saveAndFlush(new User("Recovery Test",email,passwords.encode("old-password"),"ADMIN"));
        AuthSession session=sessions.saveAndFlush(new AuthSession(UUID.randomUUID().toString(),user,"a"+UUID.randomUUID().toString().replace("-","")+"b".repeat(31),Instant.now().plusSeconds(3600)));
        var challenge=recovery.request(email,"integration-"+UUID.randomUUID());
        var captor=org.mockito.ArgumentCaptor.forClass(String.class);
        verify(delivery,timeout(3000)).deliver(eq(challenge.challengeId()),eq(email),captor.capture());
        assertFalse(db.queryForObject("SELECT code_hash FROM password_reset_challenges WHERE challenge_id=?",String.class,challenge.challengeId()).contains(captor.getValue()));
        assertThrows(ApiException.class,()->recovery.reset(challenge.challengeId(),captor.getValue().equals("000000")?"999999":"000000","new-password"));
        assertEquals(1,db.queryForObject("SELECT attempts FROM password_reset_challenges WHERE challenge_id=?",Integer.class,challenge.challengeId()));
        recovery.reset(challenge.challengeId(),captor.getValue(),"new-password");
        User updated=users.findById(user.getId()).orElseThrow();
        assertTrue(passwords.matches("new-password",updated.getPasswordHash())); assertEquals("ADMIN",updated.getRole());
        assertNotNull(sessions.findById(session.getId()).orElseThrow().getRevokedAt());
        assertThrows(ApiException.class,()->recovery.reset(challenge.challengeId(),captor.getValue(),"another-password"));
    }
    @Test void throttledAndAbsentRequestsRemainGenericAndSuppressed() {
        String email=UUID.randomUUID()+"@example.com", ip="integration-"+UUID.randomUUID();
        var first=recovery.request(email,ip); var second=recovery.request(email,ip);
        assertEquals(first.message(),second.message()); assertNotEquals(first.challengeId(),second.challengeId());
        assertNoChallenge(first.challengeId());
        assertNoChallenge(second.challengeId());
    }
    @Test void blockedIpCannotGrowChallengeOrEmailLimitTables() {
        String ip="integration-"+UUID.randomUUID();
        recovery.request(UUID.randomUUID()+"@example.com", ip);
        long challenges=db.queryForObject("SELECT COUNT(*) FROM password_reset_challenges", Long.class);
        long limits=db.queryForObject("SELECT COUNT(*) FROM password_reset_limits", Long.class);
        for (int i=0; i<32; i++) {
            var result=recovery.request(UUID.randomUUID()+"@example.com", ip);
            assertNoChallenge(result.challengeId());
        }
        assertEquals(challenges,db.queryForObject("SELECT COUNT(*) FROM password_reset_challenges", Long.class));
        assertEquals(limits,db.queryForObject("SELECT COUNT(*) FROM password_reset_limits", Long.class));
    }
    @Test void resendingInvalidatesOldCodeAndExpiryUsesInjectedClock() {
        String email=UUID.randomUUID()+"@example.com", ip="integration-"+UUID.randomUUID();
        users.saveAndFlush(new User("Recovery Test",email,passwords.encode("old-password"),"USER"));
        var first=recovery.request(email,ip);
        when(clock.instant()).thenReturn(now.plusSeconds(61));
        var second=recovery.request(email,ip);
        assertNotNull(db.queryForObject("SELECT invalidated_at FROM password_reset_challenges WHERE challenge_id=?",java.sql.Timestamp.class,first.challengeId()));
        assertThrows(ApiException.class,()->recovery.reset(first.challengeId(),"123456","new-password"));
        when(clock.instant()).thenReturn(now.plusSeconds(661));
        assertThrows(ApiException.class,()->recovery.reset(second.challengeId(),"123456","new-password"));
        assertEquals(0,db.queryForObject("SELECT attempts FROM password_reset_challenges WHERE challenge_id=?",Integer.class,second.challengeId()));
    }
    @Test void bothEmailAndIpEnforceFiveRequestsPerHour() {
        String email=UUID.randomUUID()+"@example.com", ip="integration-"+UUID.randomUUID();
        users.saveAndFlush(new User("Recovery Test",email,passwords.encode("old-password"),"USER"));
        for(int i=0;i<5;i++) {
            when(clock.instant()).thenReturn(now.plusSeconds(i*61));
            var challenge=recovery.request(email,ip);
            assertNotNull(db.queryForObject("SELECT user_id FROM password_reset_challenges WHERE challenge_id=?",Long.class,challenge.challengeId()));
        }
        when(clock.instant()).thenReturn(now.plusSeconds(3600));
        var blocked=recovery.request(email,"another-ip-"+UUID.randomUUID());
        assertNoChallenge(blocked.challengeId());
        String email2=UUID.randomUUID()+"@example.com";
        users.saveAndFlush(new User("Recovery Test",email2,passwords.encode("old-password"),"USER"));
        var ipBlocked=recovery.request(email2,ip);
        assertNoChallenge(ipBlocked.challengeId());
    }    @Test void resendRequiresSixtySecondsAndFifthWrongGuessLocksChallenge() {
        String email=UUID.randomUUID()+"@example.com", ip="integration-"+UUID.randomUUID();
        users.saveAndFlush(new User("Recovery Test",email,passwords.encode("old-password"),"USER"));
        var first=recovery.request(email,ip);
        var captor=org.mockito.ArgumentCaptor.forClass(String.class);
        verify(delivery,timeout(3000)).deliver(eq(first.challengeId()),eq(email),captor.capture());
        when(clock.instant()).thenReturn(now.plusSeconds(59));
        var blocked=recovery.request(email,ip);
        assertNoChallenge(blocked.challengeId());
        String wrong=captor.getValue().equals("000000")?"999999":"000000";
        for(int i=0;i<5;i++) assertThrows(ApiException.class,()->recovery.reset(first.challengeId(),wrong,"new-password"));
        assertEquals(5,db.queryForObject("SELECT attempts FROM password_reset_challenges WHERE challenge_id=?",Integer.class,first.challengeId()));
        assertThrows(ApiException.class,()->recovery.reset(first.challengeId(),captor.getValue(),"new-password"));
        when(clock.instant()).thenReturn(now.plusSeconds(60));
        var next=recovery.request(email,ip);
        assertNotNull(db.queryForObject("SELECT user_id FROM password_reset_challenges WHERE challenge_id=?",Long.class,next.challengeId()));
    }    @Test void concurrentResetConsumesExactlyOnce() throws Exception {
        String email=UUID.randomUUID()+"@example.com";
        users.saveAndFlush(new User("Recovery Test",email,passwords.encode("old-password"),"USER"));
        var challenge=recovery.request(email,"integration-"+UUID.randomUUID());
        var captor=org.mockito.ArgumentCaptor.forClass(String.class);
        verify(delivery,timeout(3000)).deliver(eq(challenge.challengeId()),eq(email),captor.capture());
        var gate=new java.util.concurrent.CountDownLatch(1);
        try(var pool=java.util.concurrent.Executors.newFixedThreadPool(2)) {
            java.util.concurrent.Callable<Boolean> action=()-> {
                gate.await();
                try { recovery.reset(challenge.challengeId(),captor.getValue(),"new-password"); return true; }
                catch(ApiException rejected) { return false; }
            };
            var a=pool.submit(action); var b=pool.submit(action); gate.countDown();
            assertNotEquals(a.get(10,java.util.concurrent.TimeUnit.SECONDS),b.get(10,java.util.concurrent.TimeUnit.SECONDS));
        }
    }}

