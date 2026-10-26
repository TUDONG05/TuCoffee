package com.tuscoffee.identity;

import com.tuscoffee.identity.security.IdentityPrincipal;
import com.tuscoffee.identity.security.TokenService;
import com.tuscoffee.shared.error.ApiException;
import java.time.Instant;
import java.util.UUID;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class IdentityService {
    private final IdentityStore store;
    private final IdentityValidation validation;
    private final PasswordEncoder passwords;
    private final TokenService tokens;
    private final String dummyPassword;
    public IdentityService(IdentityStore store, IdentityValidation validation, PasswordEncoder passwords, TokenService tokens) {
        this.store = store; this.validation = validation; this.passwords = passwords; this.tokens = tokens;
        dummyPassword = passwords.encode(UUID.randomUUID().toString());
    }
    public record AuthResponse(String accessToken, long expiresIn, User user) {
        @Override public String toString() { return "AuthResponse[tokens redacted]"; }
    }
    public record AuthResult(AuthResponse response, String refreshToken, Instant refreshExpiry) {
        @Override public String toString() { return "AuthResult[tokens redacted]"; }
    }
    private ApiException unauthorized() { return new ApiException(401, "SESSION_REVOKED", "Phiên không còn hiệu lực."); }
    @Transactional
    public User register(IdentityRequests.Register input) {
        String name = validation.name(input.name()), email = validation.email(input.email());
        validation.password(input.password());
        String passwordHash = passwords.encode(input.password());
        store.lock();
        if (store.byEmail(email).isPresent()) throw new ApiException(409, "EMAIL_EXISTS", "Email đã được sử dụng.");
        return store.insert(name, email, passwordHash, "USER");
    }
    @Transactional(noRollbackFor = ApiException.class)
    public AuthResult login(IdentityRequests.Login input, String remoteIp) {
        String email = validation.email(input.email()); validation.credentialsPassword(input.password());
        store.lock();
        Instant now = Instant.now();
        String emailKey = tokens.hash("email:" + email), ipKey = tokens.hash("ip:" + remoteIp);
        if (store.rateBlocked(emailKey, now) || store.rateBlocked(ipKey, now)) {
            throw new ApiException(429, "RATE_LIMITED", "Thử lại sau 15 phút.");
        }
        var account = store.byEmail(email);
        boolean matches = passwords.matches(input.password(), account.map(IdentityStore.Account::passwordHash).orElse(dummyPassword));
        if (account.isEmpty() || !matches || !account.get().user().active()) {
            store.rateFailure(emailKey, now); store.rateFailure(ipKey, now);
            throw new ApiException(401, "INVALID_CREDENTIALS", "Email hoặc mật khẩu không đúng.");
        }
        User user = account.get().user();
        String refresh = tokens.refresh();
        var session = store.createSession(UUID.randomUUID().toString(), user.id(), tokens.hash(refresh), now.plusSeconds(604800));
        return result(user, session, refresh);
    }
    @Transactional(noRollbackFor = ApiException.class)
    public AuthResult refresh(String refresh) {
        if (refresh == null || refresh.isEmpty()) throw new ApiException(401, "NO_REFRESH_TOKEN", "Thiếu thông tin phiên.");
        if (refresh.length() > 200) throw new ApiException(401, "INVALID_TOKEN", "Phiên không hợp lệ.");
        store.lock();
        String hash = tokens.hash(refresh);
        var current = store.refresh(hash);
        if (current.isEmpty()) {
            var historical = store.historical(hash);
            if (historical.isPresent()) {
                store.revoke(historical.get().id());
                throw new ApiException(401, "REFRESH_REUSED", "Phiên đã bị thu hồi. Vui lòng đăng nhập lại.");
            }
            throw new ApiException(401, "INVALID_TOKEN", "Phiên không hợp lệ.");
        }
        var session = current.get();
        var account = store.byId(session.userId());
        String invalid = session.revokedAt() != null ? "SESSION_REVOKED"
                : !session.expiresAt().isAfter(Instant.now()) ? "SESSION_EXPIRED"
                : account.isEmpty() || !account.get().user().active() ? "ACCOUNT_DISABLED" : null;
        if (invalid != null) { store.revoke(session.id()); throw new ApiException(401, invalid, "Phiên không còn hiệu lực."); }
        String next = tokens.refresh(); store.rotate(session, tokens.hash(next));
        return result(account.get().user(), session, next);
    }
    private AuthResult result(User user, IdentityStore.Session session, String refresh) {
        return new AuthResult(new AuthResponse(tokens.access(user.id(), session.id()), 900, user), refresh, session.expiresAt());
    }
    @Transactional
    public void logout(String refresh, String authorization) {
        store.lock();
        if (refresh != null && refresh.length() <= 200) {
            String hash = tokens.hash(refresh);
            store.refresh(hash).or(() -> store.historical(hash)).ifPresent(session -> store.revoke(session.id()));
        }
        if (authorization != null && authorization.startsWith("Bearer ")) {
            try {
                var jwt = tokens.decodeForLogout(authorization.substring(7));
                store.session(jwt.getClaimAsString("sid")).filter(s -> Long.toString(s.userId()).equals(jwt.getSubject()))
                        .ifPresent(s -> store.revoke(s.id()));
            } catch (org.springframework.security.oauth2.jwt.JwtException | IllegalArgumentException ignored) {
                // Invalid/expired access never prevents idempotent cookie-based logout.
            }
        }
    }
    public User me(IdentityPrincipal principal) { return current(principal); }
    private User current(IdentityPrincipal principal) {
        var session = store.session(principal.sessionId()).orElseThrow(this::unauthorized);
        var user = store.byId(principal.user().id()).orElseThrow(this::unauthorized).user();
        if (!user.active()) throw new ApiException(401, "ACCOUNT_DISABLED", "Tài khoản không còn hoạt động.");
        if (!session.expiresAt().isAfter(Instant.now())) throw new ApiException(401, "SESSION_EXPIRED", "Phiên đã hết hạn.");
        if (session.userId() != user.id() || session.revokedAt() != null) throw unauthorized();
        return user;
    }
    @Transactional
    public User profile(IdentityPrincipal principal, IdentityRequests.Profile input) {
        String name = validation.name(input.name()), phone = validation.phone(input.phone()), address = validation.address(input.address());
        store.lock(); current(principal);
        store.profile(principal.user().id(), name, phone, address);
        return store.byId(principal.user().id()).orElseThrow(this::unauthorized).user();
    }
    @Transactional
    public AuthResult password(IdentityPrincipal principal, IdentityRequests.Password input) {
        validation.credentialsPassword(input.currentPassword()); validation.password(input.newPassword());
        store.lock(); User user = current(principal);
        var account = store.byId(user.id()).orElseThrow(this::unauthorized);
        if (!passwords.matches(input.currentPassword(), account.passwordHash())) {
            throw new ApiException(400, "INVALID_CURRENT_PASSWORD", "Mật khẩu hiện tại không đúng.");
        }
        store.password(user.id(), passwords.encode(input.newPassword()));
        var previous = store.session(principal.sessionId()).orElseThrow(this::unauthorized);
        store.revokeUser(user.id(), "");
        String next = tokens.refresh();
        var session = store.createSession(UUID.randomUUID().toString(), user.id(), tokens.hash(next), previous.expiresAt());
        return result(user, session, next);
    }
    public IdentityStore.UserPage users(IdentityPrincipal principal, String q, Boolean active, int page, int size) {
        requireAdmin(current(principal));
        if (q == null) q = "";
        if (q.length() > 100 || page < 0 || page > 1000000 || size < 1 || size > 100) throw IdentityValidation.bad("Tham số phân trang hoặc tìm kiếm không hợp lệ.");
        return store.users(q.trim(), active, page, size);
    }
    @Transactional
    public User active(IdentityPrincipal principal, long id, IdentityRequests.Active input) {
        if (input.active() == null || id < 1) throw IdentityValidation.bad("Trạng thái active bắt buộc là boolean.");
        store.lock(); User actor = current(principal); requireAdmin(actor);
        User target = store.byId(id).orElseThrow(() -> new ApiException(404, "USER_NOT_FOUND", "Không tìm thấy tài khoản.")).user();
        if (!input.active() && (actor.id() == id || (target.active() && target.role().equals("ADMIN") && store.activeAdmins() <= 1))) {
            throw new ApiException(409, "ADMIN_LOCK_NOT_ALLOWED", "Không thể tự khóa hoặc khóa quản trị viên hoạt động cuối cùng.");
        }
        store.active(id, input.active());
        if (!input.active()) store.revokeUser(id, "");
        return store.byId(id).orElseThrow().user();
    }
    private void requireAdmin(User user) {
        if (!user.role().equals("ADMIN")) throw new ApiException(403, "FORBIDDEN", "Không đủ quyền truy cập.");
    }
    @Transactional
    public User bootstrap(String name, String email, String password) {
        name = validation.name(name); email = validation.email(email); validation.password(password); store.lock();
        if (store.byEmail(email).isPresent()) throw new ApiException(409, "EMAIL_EXISTS", "Email đã được sử dụng; không nâng quyền tài khoản có sẵn.");
        return store.insert(name, email, passwords.encode(password), "ADMIN");
    }
}
