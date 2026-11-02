package com.tuscoffee.service;

import com.tuscoffee.dto.AuthResponse;
import com.tuscoffee.dto.AuthResult;
import com.tuscoffee.dto.ChangePasswordRequest;
import com.tuscoffee.dto.LoginRequest;
import com.tuscoffee.dto.RegisterRequest;
import com.tuscoffee.dto.UpdateProfileRequest;
import com.tuscoffee.dto.UpdateUserActiveRequest;
import com.tuscoffee.dto.UserPage;
import com.tuscoffee.dto.UserResponse;
import com.tuscoffee.entity.AuthRateLimit;
import com.tuscoffee.entity.AuthSession;
import com.tuscoffee.entity.AuthTokenHistory;
import com.tuscoffee.entity.User;
import com.tuscoffee.repository.AuthRateLimitRepository;
import com.tuscoffee.repository.AuthSessionRepository;
import com.tuscoffee.repository.AuthTokenHistoryRepository;
import com.tuscoffee.repository.IdentityLockRepository;
import com.tuscoffee.repository.UserRepository;
import com.tuscoffee.security.IdentityPrincipal;
import com.tuscoffee.security.TokenService;
import com.tuscoffee.exception.ApiException;
import com.tuscoffee.validation.IdentityValidation;
import java.time.Instant;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class IdentityService {
    private final UserRepository users;
    private final AuthSessionRepository sessions;
    private final AuthTokenHistoryRepository tokenHistory;
    private final AuthRateLimitRepository rateLimits;
    private final IdentityLockRepository coordinator;
    private final IdentityValidation validation;
    private final PasswordEncoder passwords;
    private final TokenService tokens;
    private final String dummyPassword;

    public IdentityService(
            UserRepository users,
            AuthSessionRepository sessions,
            AuthTokenHistoryRepository tokenHistory,
            AuthRateLimitRepository rateLimits,
            IdentityLockRepository coordinator,
            IdentityValidation validation,
            PasswordEncoder passwords,
            TokenService tokens) {
        this.users = users;
        this.sessions = sessions;
        this.tokenHistory = tokenHistory;
        this.rateLimits = rateLimits;
        this.coordinator = coordinator;
        this.validation = validation;
        this.passwords = passwords;
        this.tokens = tokens;
        this.dummyPassword = passwords.encode(UUID.randomUUID().toString());
    }

    @Transactional
    public UserResponse register(RegisterRequest input) {
        String name = validation.name(input.name());
        String email = validation.email(input.email());
        validation.password(input.password());
        String passwordHash = passwords.encode(input.password());
        lock();
        ensureEmailAvailable(email);
        return UserResponse.from(users.saveAndFlush(new User(name, email, passwordHash, "USER")));
    }

    @Transactional(noRollbackFor = ApiException.class)
    public AuthResult login(LoginRequest input, String remoteIp) {
        String email = validation.email(input.email());
        validation.credentialsPassword(input.password());
        lock();
        Instant now = Instant.now();
        String emailKey = tokens.hash("email:" + email);
        String ipKey = tokens.hash("ip:" + remoteIp);
        if (rateBlocked(emailKey, now) || rateBlocked(ipKey, now)) {
            throw new ApiException(429, "RATE_LIMITED", "Thử lại sau 15 phút.");
        }
        Optional<User> account = users.findByEmail(email);
        boolean matches =
                passwords.matches(
                        input.password(), account.map(User::getPasswordHash).orElse(dummyPassword));
        if (account.isEmpty() || !matches || !account.get().isActive()) {
            recordFailure(emailKey, now);
            recordFailure(ipKey, now);
            throw new ApiException(401, "INVALID_CREDENTIALS", "Email hoặc mật khẩu không đúng.");
        }
        return createSession(account.get(), now.plusSeconds(604800));
    }

    @Transactional(noRollbackFor = ApiException.class)
    public AuthResult refresh(String refresh) {
        if (refresh == null || refresh.isEmpty()) {
            throw new ApiException(401, "NO_REFRESH_TOKEN", "Thiếu thông tin phiên.");
        }
        if (refresh.length() > 200) throw invalidToken();
        lock();
        String hash = tokens.hash(refresh);
        Optional<AuthSession> current = sessions.findByRefreshHash(hash);
        if (current.isEmpty()) {
            Optional<AuthTokenHistory> historical = tokenHistory.findById(hash);
            if (historical.isPresent()) {
                historical.get().getSession().revoke(Instant.now());
                // noRollbackFor preserves this revocation even though the request returns 401.
                throw new ApiException(
                        401, "REFRESH_REUSED", "Phiên đã bị thu hồi. Vui lòng đăng nhập lại.");
            }
            throw invalidToken();
        }
        AuthSession session = current.get();
        User user = session.getUser();
        String invalid =
                session.getRevokedAt() != null
                        ? "SESSION_REVOKED"
                        : !session.getExpiresAt().isAfter(Instant.now())
                                ? "SESSION_EXPIRED"
                                : !user.isActive() ? "ACCOUNT_DISABLED" : null;
        if (invalid != null) {
            session.revoke(Instant.now());
            throw new ApiException(401, invalid, "Phiên không còn hiệu lực.");
        }
        // Persist the previous hash before changing the managed session entity.
        tokenHistory.saveAndFlush(new AuthTokenHistory(session));
        String next = tokens.refresh();
        session.rotate(tokens.hash(next));
        return result(user, session, next);
    }

    @Transactional(noRollbackFor = ApiException.class)
    public AuthResult googleLogin(com.tuscoffee.dto.GoogleIdentity google, String currentPassword, String remoteIp) {
        String email = validation.email(google.email());
        lock();
        Instant now = Instant.now();
        String emailKey = tokens.hash("email:" + email);
        String ipKey = tokens.hash("ip:" + remoteIp);
        if (rateBlocked(emailKey, now) || rateBlocked(ipKey, now))
            throw new ApiException(429, "RATE_LIMITED", "Thử lại sau 15 phút.");
        var linked = users.findByGoogleSubject(google.subject());
        User user;
        if (linked.isPresent()) {
            user = linked.get();
        } else {
            var existing = users.findByEmail(email);
            if (existing.isPresent()) {
                user = existing.get();
                if (!user.isActive()) throw new ApiException(401, "ACCOUNT_DISABLED", "Tài khoản không còn hoạt động.");
                if (user.getGoogleSubject() != null)
                    throw new ApiException(409, "GOOGLE_IDENTITY_CONFLICT", "Tài khoản đã liên kết với một tài khoản Google khác.");
                if (currentPassword == null || currentPassword.isEmpty())
                    throw new ApiException(409, "GOOGLE_LINK_REQUIRED", "Email đã có tài khoản TuCoffee. Nhập mật khẩu hiện tại để liên kết Google.");
                validation.credentialsPassword(currentPassword);
                boolean matches = passwords.matches(currentPassword,
                        user.getPasswordHash() == null ? dummyPassword : user.getPasswordHash());
                if (!matches || user.getPasswordHash() == null) {
                    recordFailure(emailKey, now); recordFailure(ipKey, now);
                    throw new ApiException(401, "INVALID_CREDENTIALS", "Mật khẩu xác nhận không đúng.");
                }
            } else {
                user = new User(validation.name(google.name()), email, null, "USER");
            }
            user.linkGoogle(google.subject());
            user = users.saveAndFlush(user);
        }
        if (!user.isActive()) throw new ApiException(401, "ACCOUNT_DISABLED", "Tài khoản không còn hoạt động.");
        return createSession(user, now.plusSeconds(604800));
    }

    @Transactional
    public void logout(String refresh, String authorization) {
        lock();
        if (refresh != null && refresh.length() <= 200) {
            String hash = tokens.hash(refresh);
            sessions.findByRefreshHash(hash)
                    .or(() -> tokenHistory.findById(hash).map(AuthTokenHistory::getSession))
                    .ifPresent(session -> session.revoke(Instant.now()));
        }
        if (authorization != null && authorization.startsWith("Bearer ")) {
            try {
                var jwt = tokens.decodeForLogout(authorization.substring(7));
                findSession(jwt.getClaimAsString("sid"))
                        .filter(
                                session ->
                                        Long.toString(session.getUser().getId())
                                                .equals(jwt.getSubject()))
                        .ifPresent(session -> session.revoke(Instant.now()));
            } catch (org.springframework.security.oauth2.jwt.JwtException
                    | IllegalArgumentException ignored) {
                // Invalid access must not prevent idempotent cookie-based logout.
            }
        }
    }

    @Transactional(readOnly = true)
    public IdentityPrincipal authenticate(long userId, String sessionId) {
        return new IdentityPrincipal(UserResponse.from(current(userId, sessionId)), sessionId);
    }

    @Transactional(readOnly = true)
    public UserResponse me(IdentityPrincipal principal) {
        return UserResponse.from(current(principal));
    }

    @Transactional
    public UserResponse profile(IdentityPrincipal principal, UpdateProfileRequest input) {
        String name = validation.name(input.name());
        String phone = validation.phone(input.phone());
        String address = validation.address(input.address());
        lock();
        User user = current(principal);
        user.updateProfile(name, phone, address);
        return UserResponse.from(users.save(user));
    }

    @Transactional
    public AuthResult password(IdentityPrincipal principal, ChangePasswordRequest input) {
        validation.credentialsPassword(input.currentPassword());
        validation.password(input.newPassword());
        lock();
        User user = current(principal);
        if (user.getPasswordHash() == null)
            throw new ApiException(400, "GOOGLE_MANAGED_PASSWORD", "Tài khoản này đăng nhập bằng Google. Quản lý mật khẩu tại Google.");
        if (!passwords.matches(input.currentPassword(), user.getPasswordHash())) {
            throw new ApiException(
                    400, "INVALID_CURRENT_PASSWORD", "Mật khẩu hiện tại không đúng.");
        }
        Instant expiry =
                findSession(principal.sessionId()).orElseThrow(this::unauthorized).getExpiresAt();
        long userId = user.getId();
        user.changePassword(passwords.encode(input.newPassword()));
        // Bulk revoke flushes the new password, then clears stale entities from this
        // transaction.
        sessions.revokeAllForUser(userId, Instant.now());
        User updated = users.findById(userId).orElseThrow(this::unauthorized);
        return createSession(updated, expiry);
    }

    @Transactional(readOnly = true)
    public UserPage users(
            IdentityPrincipal principal, String q, Boolean active, int page, int size) {
        requireAdmin(current(principal));
        if (q == null) q = "";
        if (q.length() > 100 || page < 0 || page > 1000000 || size < 1 || size > 100) {
            throw IdentityValidation.bad("Tham số phân trang hoặc tìm kiếm không hợp lệ.");
        }
        String escaped =
                q.trim()
                        .toLowerCase(Locale.ROOT)
                        .replace("!", "!!")
                        .replace("%", "!%")
                        .replace("_", "!_");
        var result =
                users.search(
                        "%" + escaped + "%",
                        active,
                        PageRequest.of(page, size, Sort.by("id").ascending()));
        return new UserPage(
                result.getContent().stream().map(UserResponse::from).toList(),
                result.getNumber(),
                result.getSize(),
                result.getTotalElements(),
                result.getTotalPages());
    }

    @Transactional
    public UserResponse active(
            IdentityPrincipal principal, long id, UpdateUserActiveRequest input) {
        if (input.active() == null || id < 1)
            throw IdentityValidation.bad("Trạng thái active bắt buộc là boolean.");
        lock();
        User actor = current(principal);
        requireAdmin(actor);
        User target =
                users.findById(id)
                        .orElseThrow(
                                () ->
                                        new ApiException(
                                                404,
                                                "USER_NOT_FOUND",
                                                "Không tìm thấy tài khoản."));
        if (!input.active()
                && (actor.getId() == id
                        || (target.isActive()
                                && target.getRole().equals("ADMIN")
                                && users.countByRoleAndActiveTrue("ADMIN") <= 1))) {
            throw new ApiException(
                    409,
                    "ADMIN_LOCK_NOT_ALLOWED",
                    "Không thể tự khóa hoặc khóa quản trị viên hoạt động cuối cùng.");
        }
        target.setActive(input.active());
        users.save(target);
        if (!input.active()) sessions.revokeAllForUser(id, Instant.now());
        return UserResponse.from(target);
    }

    @Transactional
    public UserResponse bootstrap(String name, String email, String password) {
        name = validation.name(name);
        email = validation.email(email);
        validation.password(password);
        String passwordHash = passwords.encode(password);
        lock();
        ensureEmailAvailable(email);
        return UserResponse.from(users.saveAndFlush(new User(name, email, passwordHash, "ADMIN")));
    }

    private void lock() {
        coordinator
                .acquire()
                .orElseThrow(() -> new IllegalStateException("Missing identity coordination row."));
    }

    private User current(IdentityPrincipal principal) {
        return current(principal.user().id(), principal.sessionId());
    }

    private User current(long userId, String sessionId) {
        AuthSession session = findSession(sessionId).orElseThrow(this::unauthorized);
        if (session.getUser().getId() != userId || session.getRevokedAt() != null)
            throw unauthorized();
        if (!session.getExpiresAt().isAfter(Instant.now())) {
            throw new ApiException(401, "SESSION_EXPIRED", "Phiên đã hết hạn.");
        }
        User user = users.findById(userId).orElseThrow(this::unauthorized);
        if (!user.isActive())
            throw new ApiException(401, "ACCOUNT_DISABLED", "Tài khoản không còn hoạt động.");
        return user;
    }

    private Optional<AuthSession> findSession(String id) {
        return id == null ? Optional.empty() : sessions.findById(id);
    }

    private void ensureEmailAvailable(String email) {
        if (users.findByEmail(email).isPresent()) {
            throw new ApiException(
                    409,
                    "EMAIL_EXISTS",
                    "Email đã được sử dụng; không nâng quyền tài khoản có sẵn.");
        }
    }

    private boolean rateBlocked(String key, Instant now) {
        return rateLimits.findById(key).map(limit -> limit.isBlocked(now)).orElse(false);
    }

    private void recordFailure(String key, Instant now) {
        AuthRateLimit limit = rateLimits.findById(key).orElseGet(() -> new AuthRateLimit(key, now));
        limit.recordFailure(now);
        rateLimits.save(limit);
    }

    private AuthResult createSession(User user, Instant expiry) {
        String refresh = tokens.refresh();
        AuthSession session =
                sessions.saveAndFlush(
                        new AuthSession(
                                UUID.randomUUID().toString(), user, tokens.hash(refresh), expiry));
        return result(user, session, refresh);
    }

    private void requireAdmin(User user) {
        if (!user.getRole().equals("ADMIN")) {
            throw new ApiException(403, "FORBIDDEN", "Không đủ quyền truy cập.");
        }
    }

    private AuthResult result(User user, AuthSession session, String refresh) {
        return new AuthResult(
                new AuthResponse(
                        tokens.access(user.getId(), session.getId()), 900, UserResponse.from(user)),
                refresh,
                session.getExpiresAt());
    }

    private ApiException unauthorized() {
        return new ApiException(401, "SESSION_REVOKED", "Phiên không còn hiệu lực.");
    }

    private ApiException invalidToken() {
        return new ApiException(401, "INVALID_TOKEN", "Phiên không hợp lệ.");
    }
}
