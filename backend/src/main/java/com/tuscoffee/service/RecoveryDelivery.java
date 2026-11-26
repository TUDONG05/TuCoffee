package com.tuscoffee.service;

import java.sql.Timestamp;
import java.time.Clock;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import com.tuscoffee.repository.IdentityLockRepository;

@Service
public class RecoveryDelivery {
    private final JdbcTemplate db;
    private final IdentityLockRepository lock;
    private final Clock clock;
    private final TransactionTemplate transaction;
    private final JavaMailSenderImpl mail = new JavaMailSenderImpl();
    private final String from;
    private final boolean configured;
    public RecoveryDelivery(JdbcTemplate db, IdentityLockRepository lock, @Qualifier("recoveryClock") Clock clock,
            PlatformTransactionManager manager,
            @Value("${recovery.smtp.host:}") String host, @Value("${recovery.smtp.port:587}") int port,
            @Value("${recovery.smtp.username:}") String username, @Value("${recovery.smtp.password:}") String password,
            @Value("${recovery.smtp.from:}") String from, @Value("${recovery.smtp.auth:true}") boolean auth,
            @Value("${recovery.smtp.starttls:true}") boolean starttls) {
        this.db=db; this.lock=lock; this.clock=clock; this.from=from;
        transaction=new TransactionTemplate(manager);
        transaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        configured=!host.isBlank() && !from.isBlank();
        mail.setHost(host); mail.setPort(port); mail.setUsername(username); mail.setPassword(password);
        var p=mail.getJavaMailProperties(); p.setProperty("mail.smtp.auth", Boolean.toString(auth));
        p.setProperty("mail.smtp.starttls.enable", Boolean.toString(starttls));
        p.setProperty("mail.smtp.starttls.required", Boolean.toString(starttls));
        p.setProperty("mail.smtp.connectiontimeout", "3000"); p.setProperty("mail.smtp.timeout", "3000");
        p.setProperty("mail.smtp.writetimeout", "3000");
    }
    public void deliver(String id, String email, String code) {
        // Recheck after queue delay, then release the DB transaction before all network I/O.
        boolean current=Boolean.TRUE.equals(transaction.execute(status -> {
            lock.acquire().orElseThrow();
            Integer count=db.queryForObject("SELECT COUNT(*) FROM password_reset_challenges WHERE challenge_id=? AND user_id IS NOT NULL AND consumed_at IS NULL AND invalidated_at IS NULL AND expires_at>? AND delivery_status='PENDING'",Integer.class,id,Timestamp.from(clock.instant()));
            if(count==null || count==0) {
                db.update("UPDATE password_reset_challenges SET delivery_status='SUPPRESSED' WHERE challenge_id=? AND delivery_status='PENDING'",id);
                return false;
            }
            return true;
        }));
        if(!current) return;
        if(!configured) { failed(id); return; }
        boolean sent=false;
        try {
            SimpleMailMessage message=new SimpleMailMessage(); message.setFrom(from); message.setTo(email);
            message.setSubject("TuCoffee - Mã đặt lại mật khẩu");
            message.setText("Mã đặt lại mật khẩu TuCoffee: " + code + "\nMã có hiệu lực 10 phút. Chỉ sử dụng mã trong email mới nhất. Nếu không yêu cầu, bạn có thể bỏ qua email này.");
            mail.send(message); sent=true;
        } catch (RuntimeException ignored) { /* SMTP exceptions can contain addresses: never log. */ }
        final String result=sent?"SENT":"FAILED";
        transaction.executeWithoutResult(status -> db.update("UPDATE password_reset_challenges SET delivery_status=? WHERE challenge_id=? AND delivery_status='PENDING'",result,id));
    }
    public void failed(String id) {
        transaction.executeWithoutResult(status -> db.update("UPDATE password_reset_challenges SET delivery_status='FAILED' WHERE challenge_id=? AND delivery_status='PENDING'",id));
    }
}
