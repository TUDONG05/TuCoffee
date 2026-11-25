package com.tuscoffee.service;

import com.tuscoffee.exception.ApiException;
import com.tuscoffee.entity.User;
import com.tuscoffee.repository.AuthSessionRepository;
import com.tuscoffee.repository.IdentityLockRepository;
import com.tuscoffee.repository.UserRepository;
import com.tuscoffee.validation.IdentityValidation;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionException;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
public class RecoveryService {
    private final JdbcTemplate db; private final IdentityLockRepository lock;
    private final UserRepository users; private final AuthSessionRepository sessions;
    private final IdentityValidation validation; private final PasswordEncoder passwords;
    private final Clock clock; private final Executor executor; private final RecoveryDelivery delivery;
    private final byte[] secret; private final SecureRandom random=new SecureRandom();
    public record Challenge(String challengeId, int expiresIn, int resendAfter, String message) {}
    public RecoveryService(JdbcTemplate db, IdentityLockRepository lock, UserRepository users,
            AuthSessionRepository sessions, IdentityValidation validation, PasswordEncoder passwords,
            @Qualifier("recoveryClock") Clock clock, @Qualifier("recoveryExecutor") Executor executor,
            RecoveryDelivery delivery, @Value("${recovery.secret:${auth.jwt-secret}}") String secret) {
        this.db=db; this.lock=lock; this.users=users; this.sessions=sessions; this.validation=validation;
        this.passwords=passwords; this.clock=clock; this.executor=executor; this.delivery=delivery;
        if(secret.length()<32) throw new IllegalArgumentException("Password reset secret must contain at least 32 characters");
        this.secret=secret.getBytes(StandardCharsets.UTF_8);
    }
    @Transactional
    public Challenge request(String inputEmail, String remoteIp) {
        String email=validation.email(inputEmail); Instant now=clock.instant();
        lock.acquire().orElseThrow();
        String emailKey=hash("email:"+email), ipKey=hash("ip:"+remoteIp);
        // Reject a blocked IP before allocating per-email limiter rows. Valid unknown
        // emails still reserve the same limits, independently of account existence.
        boolean allowed=allow(ipKey,now) && allow(emailKey,now);
        Optional<User> user=allowed ? users.findByEmail(email).filter(u->u.isActive() && u.getPasswordHash()!=null) : Optional.empty();
        String id=UUID.randomUUID().toString(), code=String.format(java.util.Locale.ROOT,"%06d",random.nextInt(1_000_000));
        Long userId=allowed ? user.map(u->u.getId()).orElse(null) : null;
        if(userId!=null) {
            db.update("UPDATE password_reset_challenges SET invalidated_at=? WHERE user_id=? AND consumed_at IS NULL AND invalidated_at IS NULL",Timestamp.from(now),userId);
            db.update("INSERT INTO password_reset_challenges(challenge_id,user_id,code_hash,created_at,expires_at,delivery_status) VALUES(?,?,?,?,?,?)",id,userId,hash(id+":"+code),Timestamp.from(now),Timestamp.from(now.plusSeconds(600)),"PENDING");
        }
        if(userId!=null) TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCommit() {
                try { executor.execute(()->delivery.deliver(id,email,code)); }
                catch(RejectedExecutionException ignored) { executorFailure(id); }
            }
        });
        return new Challenge(id,600,60,"Yêu cầu đã được tiếp nhận. Nếu tài khoản đủ điều kiện và email khả dụng, bạn sẽ nhận mã trong ít phút.");
    }
    // afterCommit still has transaction resources bound; REQUIRES_NEW is required for failure persistence.
    private void executorFailure(String id) { delivery.failed(id); }
    @Transactional(noRollbackFor=ApiException.class)
    public void reset(String id,String code,String newPassword) {
        validation.password(newPassword);
        if(id==null || !id.matches("[a-fA-F0-9-]{36}") || code==null || !code.matches("[0-9]{6}")) throw invalid();
        lock.acquire().orElseThrow(); Instant now=clock.instant();
        var rows=db.queryForList("SELECT user_id,code_hash,attempts,expires_at,consumed_at,invalidated_at FROM password_reset_challenges WHERE challenge_id=?",id);
        if(rows.isEmpty()) throw invalid();
        Map<String,Object> r=rows.getFirst();
        if(r.get("user_id")==null || r.get("consumed_at")!=null || r.get("invalidated_at")!=null || ((Number)r.get("attempts")).intValue()>=5 || !((Timestamp)r.get("expires_at")).toInstant().isAfter(now)) throw invalid();
        if(!MessageDigest.isEqual(hash(id+":"+code).getBytes(StandardCharsets.US_ASCII),r.get("code_hash").toString().getBytes(StandardCharsets.US_ASCII))) {
            db.update("UPDATE password_reset_challenges SET attempts=attempts+1 WHERE challenge_id=? AND attempts<5",id); throw invalid();
        }
        long userId=((Number)r.get("user_id")).longValue();
        var user=users.findById(userId).filter(u->u.isActive() && u.getPasswordHash()!=null).orElseThrow(this::invalid);
        user.changePassword(passwords.encode(newPassword)); users.flush();
        db.update("UPDATE password_reset_challenges SET consumed_at=? WHERE challenge_id=?",Timestamp.from(now),id);
        sessions.revokeAllForUser(userId,now);
    }
    private boolean allow(String key,Instant now) {
        var rows=db.queryForList("SELECT window_start,last_sent_at,request_count FROM password_reset_limits WHERE rate_key=?",key);
        if(rows.isEmpty()) { db.update("INSERT INTO password_reset_limits(rate_key,window_start,last_sent_at,request_count) VALUES(?,?,?,1)",key,Timestamp.from(now),Timestamp.from(now)); return true; }
        var r=rows.getFirst(); Instant start=((Timestamp)r.get("window_start")).toInstant();
        Instant last=r.get("last_sent_at")==null ? Instant.EPOCH : ((Timestamp)r.get("last_sent_at")).toInstant();
        // Conservative rolling limit: reset the burst only after an idle hour. This cannot allow a boundary burst of ten emails.
        boolean fresh=!last.plusSeconds(3600).isAfter(now);
        if(last.plusSeconds(60).isAfter(now) || (!fresh && ((Number)r.get("request_count")).intValue()>=5)) return false;
        db.update("UPDATE password_reset_limits SET window_start=?,last_sent_at=?,request_count=?,version=version+1 WHERE rate_key=?",Timestamp.from(fresh?now:start),Timestamp.from(now),fresh?1:((Number)r.get("request_count")).intValue()+1,key); return true;
    }
    private String hash(String value) {
        try { Mac mac=Mac.getInstance("HmacSHA256"); mac.init(new SecretKeySpec(secret,"HmacSHA256")); return HexFormat.of().formatHex(mac.doFinal(value.getBytes(StandardCharsets.UTF_8))); }
        catch(java.security.GeneralSecurityException e) { throw new IllegalStateException("Recovery hashing unavailable"); }
    }
    private ApiException invalid() { return new ApiException(400,"INVALID_RESET_CODE","Mã không hợp lệ, đã hết hạn hoặc đã được sử dụng. Vui lòng yêu cầu mã mới."); }
}
