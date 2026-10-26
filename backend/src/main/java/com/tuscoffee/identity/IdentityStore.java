package com.tuscoffee.identity;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class IdentityStore {
    private final JdbcTemplate jdbc;
    public IdentityStore(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    public record Account(User user, String passwordHash) { }
    public record Session(String id, long userId, String refreshHash, Instant expiresAt, Instant revokedAt) {
        public boolean valid(Instant now) { return revokedAt == null && expiresAt.isAfter(now); }
    }
    public void lock() { jdbc.queryForObject("SELECT id FROM identity_lock WHERE id=1 FOR UPDATE", Integer.class); }
    private Account account(ResultSet rs, int row) throws SQLException {
        return new Account(new User(rs.getLong("id"), rs.getString("name"), rs.getString("email"),
                rs.getString("phone"), rs.getString("address"), rs.getString("role"), rs.getBoolean("active")),
                rs.getString("password_hash"));
    }
    public Optional<Account> byEmail(String email) {
        return jdbc.query("SELECT * FROM users WHERE email=?", this::account, email).stream().findFirst();
    }
    public Optional<Account> byId(long id) {
        return jdbc.query("SELECT * FROM users WHERE id=?", this::account, id).stream().findFirst();
    }
    public User insert(String name, String email, String passwordHash, String role) {
        jdbc.update("INSERT INTO users(name,email,password_hash,role,active,created_at) VALUES(?,?,?,?,TRUE,?)",
                name, email, passwordHash, role, Timestamp.from(Instant.now()));
        return byEmail(email).orElseThrow().user();
    }
    public void profile(long id, String name, String phone, String address) {
        jdbc.update("UPDATE users SET name=?,phone=?,address=? WHERE id=?", name, phone, address, id);
    }
    public void password(long id, String hash) { jdbc.update("UPDATE users SET password_hash=? WHERE id=?", hash, id); }
    public void active(long id, boolean active) { jdbc.update("UPDATE users SET active=? WHERE id=?", active, id); }
    public long activeAdmins() { return jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE role='ADMIN' AND active=TRUE", Long.class); }
    private Session mapSession(ResultSet rs, int row) throws SQLException {
        Timestamp revoked = rs.getTimestamp("revoked_at");
        return new Session(rs.getString("id"), rs.getLong("user_id"), rs.getString("refresh_hash"),
                rs.getTimestamp("expires_at").toInstant(), revoked == null ? null : revoked.toInstant());
    }
    public Optional<Session> session(String id) {
        return jdbc.query("SELECT * FROM auth_sessions WHERE id=?", this::mapSession, id).stream().findFirst();
    }
    public Optional<Session> refresh(String hash) {
        return jdbc.query("SELECT * FROM auth_sessions WHERE refresh_hash=?", this::mapSession, hash).stream().findFirst();
    }
    public Optional<Session> historical(String hash) {
        return jdbc.query("SELECT s.* FROM auth_sessions s JOIN auth_token_history h ON h.session_id=s.id WHERE h.token_hash=?",
                this::mapSession, hash).stream().findFirst();
    }
    public Session createSession(String id, long userId, String hash, Instant expiry) {
        jdbc.update("INSERT INTO auth_sessions(id,user_id,refresh_hash,expires_at,created_at) VALUES(?,?,?,?,?)",
                id, userId, hash, Timestamp.from(expiry), Timestamp.from(Instant.now()));
        return session(id).orElseThrow();
    }
    public void rotate(Session session, String newHash) {
        jdbc.update("INSERT INTO auth_token_history(token_hash,session_id,expires_at) VALUES(?,?,?)",
                session.refreshHash(), session.id(), Timestamp.from(session.expiresAt()));
        jdbc.update("UPDATE auth_sessions SET refresh_hash=? WHERE id=?", newHash, session.id());
    }
    public void revoke(String id) {
        jdbc.update("UPDATE auth_sessions SET revoked_at=? WHERE id=? AND revoked_at IS NULL", Timestamp.from(Instant.now()), id);
    }
    public void revokeUser(long userId, String except) {
        jdbc.update("UPDATE auth_sessions SET revoked_at=? WHERE user_id=? AND id<>? AND revoked_at IS NULL",
                Timestamp.from(Instant.now()), userId, except);
    }
    public boolean rateBlocked(String key, Instant now) {
        return Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT COUNT(*)>0 FROM auth_rate_limits WHERE rate_key=? AND failures>=5 AND window_start>?",
                Boolean.class, key, Timestamp.from(now.minusSeconds(900))));
    }
    public void rateFailure(String key, Instant now) {
        jdbc.update("DELETE FROM auth_rate_limits WHERE rate_key=? AND window_start<=?", key, Timestamp.from(now.minusSeconds(900)));
        jdbc.update("INSERT INTO auth_rate_limits(rate_key,failures,window_start) VALUES(?,1,?) "
                + "ON DUPLICATE KEY UPDATE failures=failures+1", key, Timestamp.from(now));
    }
    public record UserPage(List<User> items, int page, int size, long totalItems, int totalPages) { }
    public UserPage users(String q, Boolean active, int page, int size) {
        String where = " WHERE (? IS NULL OR active=?) AND (LOWER(name) LIKE ? ESCAPE '!' OR email LIKE ? ESCAPE '!')";
        String escaped = q.toLowerCase(java.util.Locale.ROOT).replace("!", "!!").replace("%", "!%").replace("_", "!_");
        String search = "%" + escaped + "%";
        long total = jdbc.queryForObject("SELECT COUNT(*) FROM users" + where, Long.class, active, active, search, search);
        List<User> users = jdbc.query("SELECT * FROM users" + where + " ORDER BY id ASC LIMIT ? OFFSET ?",
                (rs, row) -> account(rs, row).user(), active, active, search, search, size, (long) page * size);
        return new UserPage(users, page, size, total, (int) ((total + size - 1) / size));
    }
}
