package com.tuscoffee;

import static org.junit.jupiter.api.Assertions.*;

import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.HttpCookie;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Black-box HTTP/security checks against real Spring filters, transactions and MySQL. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"spring.config.import=", "debug=false", "logging.level.root=INFO", "logging.level.org.springframework=INFO"})
class IdentityHttpTests extends MySqlIntegrationSupport {
    private static final String PASSWORD = "Coffee-safe-password42";
    private static final JsonMapper JSON = JsonMapper.builder().build();
    @Autowired JdbcTemplate jdbc;
    @Autowired PasswordEncoder encoder;
    @Autowired Environment environment;
    private URI base;

    @BeforeEach
    void isolatedFixture() {
        base = URI.create("http://127.0.0.1:" + environment.getProperty("local.server.port") + "/api/v1/");
        // Only this class uses identity tables and all point to the dedicated disposable container.
        jdbc.update("DELETE FROM auth_token_history");
        jdbc.update("DELETE FROM auth_sessions");
        jdbc.update("DELETE FROM auth_rate_limits");
        jdbc.update("DELETE FROM users");
    }

    @Test
    void healthAndBothMigrationsRemainAvailable() throws Exception {
        status(200, new Browser().get("health"));
        status(401, new Browser().get("unknown-resource"));
        Browser user = account("deny-default@example.com");
        status(200, user.login("deny-default@example.com", PASSWORD));
        // Unknown routes are outside the authenticated route groups and are denied as anonymous.
        status(401, user.get("unknown-resource"));
        assertEquals(2, jdbc.queryForObject("SELECT COUNT(*) FROM flyway_schema_history WHERE success = 1 AND version IN ('1','2')", Integer.class));
    }

    @Test
    void registrationNormalizesEmailAndNeverExposesHash() throws Exception {
        Browser browser = new Browser();
        var response = browser.write("POST", "auth/register", Map.of("name", "  Coffee User  ", "email", "  FIRST@Example.com  ", "password", PASSWORD));
        status(201, response);
        JsonNode user = body(response);
        assertEquals("first@example.com", user.path("email").asString());
        assertEquals("Coffee User", user.path("name").asString());
        assertEquals("USER", user.path("role").asString());
        assertFalse(response.body().contains("password"));
        assertFalse(response.body().contains("hash"));
        var stored = jdbc.queryForObject("SELECT password_hash FROM users WHERE email = ?", String.class, "first@example.com");
        assertNotEquals(PASSWORD, stored);
        assertTrue(encoder.matches(PASSWORD, stored));
        status(409, browser.write("POST", "auth/register", Map.of("name", "Other User", "email", "FIRST@example.com", "password", PASSWORD)));
        status(401, browser.get("users/me"));
    }

    @Test
    void registrationRejectsMassAssignmentAndPasswordByteBoundary() throws Exception {
        Browser browser = new Browser();
        status(400, browser.write("POST", "auth/register", Map.of("name", "Coffee User", "email", "role@example.com", "password", PASSWORD, "role", "ADMIN")));
        status(400, browser.write("POST", "auth/register", Map.of("name", "Coffee User", "email", "active@example.com", "password", PASSWORD, "active", true)));
        status(400, browser.write("POST", "auth/register", Map.of("name", "Coffee User", "email", "short@example.com", "password", "123456789")));
        status(400, browser.write("POST", "auth/register", Map.of("name", "Coffee User", "email", "bytes@example.com", "password", "é".repeat(37))));
        status(201, browser.write("POST", "auth/register", Map.of("name", "Coffee User", "email", "boundary@example.com", "password", "é".repeat(36))));
    }

    @Test
    void concurrentDuplicateRegistrationsCreateOnlyOneAccount() throws Exception {
        Browser first = new Browser(), second = new Browser();
        first.csrf(); second.csrf();
        Map<String, String> request = Map.of("name", "Coffee User", "email", "race@example.com", "password", PASSWORD);
        var one = CompletableFuture.supplyAsync(() -> first.uncheckedWrite("POST", "auth/register", request));
        var two = CompletableFuture.supplyAsync(() -> second.uncheckedWrite("POST", "auth/register", request));
        assertEquals(java.util.Set.of(201, 409), java.util.Set.of(one.join().statusCode(), two.join().statusCode()));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE email = 'race@example.com'", Integer.class));
    }

    @Test
    void csrfAndOriginProtectEvenPublicMutations() throws Exception {
        Browser browser = new Browser();
        status(403, browser.request("POST", "auth/register", Map.of("name", "Coffee User", "email", "csrf@example.com", "password", PASSWORD), false, "http://localhost:4200"));
        browser.csrf();
        status(403, browser.request("POST", "auth/register", Map.of("name", "Coffee User", "email", "csrf@example.com", "password", PASSWORD), true, "https://attacker.example"));
        status(403, browser.request("POST", "auth/refresh", null, false, "http://localhost:4200"));
    }

    @Test
    void loginIssuesRestrictedCookieAndUserCannotCallAdmin() throws Exception {
        Browser browser = account("user@example.com");
        var login = browser.login("user@example.com", PASSWORD);
        status(200, login);
        assertEquals(900, body(login).path("expiresIn").asInt());
        String cookie = login.headers().allValues("set-cookie").stream().filter(value -> value.startsWith("tucoffee_refresh=")).findFirst().orElseThrow();
        assertTrue(cookie.contains("HttpOnly"));
        assertTrue(cookie.contains("SameSite=Strict"));
        assertTrue(cookie.contains("Path=/api/v1/auth"));
        assertFalse(cookie.contains("Secure"));
        assertFalse(login.body().contains("password"));
        assertFalse(login.body().contains("refreshToken"));
        String refresh = browser.cookie("tucoffee_refresh");
        assertTrue(Base64.getUrlDecoder().decode(refresh).length >= 32);
        String persisted = jdbc.queryForObject("SELECT refresh_hash FROM auth_sessions", String.class);
        assertNotEquals(refresh, persisted);
        assertEquals(64, persisted.length());
        status(200, browser.get("users/me"));
        status(403, browser.get("admin/users"));
        status(401, new Browser().get("admin/users"));
    }

    @Test
    void failedLoginCountersCommitAndCannotBeBypassedByClaimedForwardedIp() throws Exception {
        Browser browser = account("existing@example.com");
        String unknown = body(browser.login("unknown@example.com", PASSWORD)).path("detail").asString();
        String wrong = body(browser.login("existing@example.com", "Wrong-password42")).path("detail").asString();
        assertEquals(unknown, wrong);
        for (int attempt = 0; attempt < 3; attempt++) status(401, browser.login("unknown@example.com", PASSWORD));
        status(429, browser.login("existing@example.com", PASSWORD));
        assertTrue(jdbc.queryForObject("SELECT MAX(failures) FROM auth_rate_limits", Integer.class) >= 5);
        Browser otherBrowser = new Browser();
        otherBrowser.csrf();
        var request = otherBrowser.builder("POST", "auth/login", Map.of("email", "existing@example.com", "password", PASSWORD), true, "http://localhost:4200")
                .header("X-Forwarded-For", "203.0.113.1").build();
        status(429, otherBrowser.client.send(request, HttpResponse.BodyHandlers.ofString()));
    }

    @Test
    void expiredAndTamperedAccessAreRejectedButValidRefreshRestoresAccess() throws Exception {
        Browser browser = account("expiry@example.com");
        browser.login("expiry@example.com", PASSWORD);
        String valid = browser.access;
        browser.access = expiredAccess(valid);
        var expired = browser.get("users/me");
        status(401, expired);
        assertEquals("ACCESS_TOKEN_EXPIRED", body(expired).path("code").asString());
        browser.access = valid.substring(0, valid.lastIndexOf('.') + 1) + "brokenSignature";
        status(401, browser.get("users/me"));
        browser.access = null;
        var refresh = browser.write("POST", "auth/refresh", null);
        status(200, refresh);
        browser.access = body(refresh).path("accessToken").asString();
        status(200, browser.get("users/me"));
    }

    @Test
    void rotationIsAbsoluteAndReuseRevokesWholeFamilyEvenAfter401() throws Exception {
        Browser browser = account("rotate@example.com");
        browser.login("rotate@example.com", PASSWORD);
        String previous = browser.cookie("tucoffee_refresh");
        Timestamp expiry = jdbc.queryForObject("SELECT expires_at FROM auth_sessions", Timestamp.class);
        var refresh = browser.write("POST", "auth/refresh", null);
        status(200, refresh);
        browser.access = body(refresh).path("accessToken").asString();
        String current = browser.cookie("tucoffee_refresh");
        assertNotEquals(previous, current);
        assertEquals(expiry, jdbc.queryForObject("SELECT expires_at FROM auth_sessions", Timestamp.class));
        browser.replaceRefresh(previous);
        status(401, browser.write("POST", "auth/refresh", null));
        assertNotNull(jdbc.queryForObject("SELECT revoked_at FROM auth_sessions", Timestamp.class));
        status(401, browser.get("users/me"));
        browser.replaceRefresh(current);
        status(401, browser.write("POST", "auth/refresh", null));
    }

    @Test
    void simultaneousRefreshNeverKeepsCompromisedFamilyAlive() throws Exception {
        Browser browser = account("parallel-refresh@example.com");
        browser.login("parallel-refresh@example.com", PASSWORD);
        String previous = browser.cookie("tucoffee_refresh");
        Browser clone = new Browser(); clone.csrf(); clone.replaceRefresh(previous);
        browser.csrf();
        var one = CompletableFuture.supplyAsync(() -> browser.uncheckedWrite("POST", "auth/refresh", null));
        var two = CompletableFuture.supplyAsync(() -> clone.uncheckedWrite("POST", "auth/refresh", null));
        assertEquals(java.util.Set.of(200, 401), java.util.Set.of(one.join().statusCode(), two.join().statusCode()));
        status(401, browser.get("users/me"));
        assertNotNull(jdbc.queryForObject("SELECT revoked_at FROM auth_sessions", Timestamp.class));
    }

    @Test
    void expiredFamilyCannotRefreshAndLogoutWorksWithoutAccess() throws Exception {
        Browser browser = account("logout@example.com");
        browser.login("logout@example.com", PASSWORD);
        String oldAccess = browser.access, refresh = browser.cookie("tucoffee_refresh");
        browser.access = null;
        status(204, browser.write("POST", "auth/logout", null));
        assertEquals("", browser.cookie("tucoffee_refresh"));
        browser.access = oldAccess;
        status(401, browser.get("users/me"));
        browser.replaceRefresh(refresh);
        status(401, browser.write("POST", "auth/refresh", null));
        status(204, browser.write("POST", "auth/logout", null));
        browser.login("logout@example.com", PASSWORD);
        jdbc.update("UPDATE auth_sessions SET expires_at = ? WHERE revoked_at IS NULL", Timestamp.from(Instant.now().minusSeconds(60)));
        status(401, browser.write("POST", "auth/refresh", null));
    }

    @Test
    void logoutWithExpiredAccessRevokesUsingRefreshCookie() throws Exception {
        Browser browser = account("expired-logout@example.com");
        browser.login("expired-logout@example.com", PASSWORD);
        String oldAccess = browser.access;
        browser.access = expiredAccess(oldAccess);
        status(204, browser.write("POST", "auth/logout", null));
        browser.access = oldAccess;
        status(401, browser.get("users/me"));
    }

    @Test
    void logoutWithOnlyExpiredSignedAccessStillRevokesSession() throws Exception {
        Browser browser = account("expired-access-only@example.com");
        browser.login("expired-access-only@example.com", PASSWORD);
        String oldAccess = browser.access;
        browser.replaceRefresh("");
        browser.access = expiredAccess(oldAccess);
        status(204, browser.write("POST", "auth/logout", null));
        browser.access = oldAccess;
        status(401, browser.get("users/me"));
    }

    @Test
    void profileAcceptsValidatedFieldsAndRejectsPrivilegeChanges() throws Exception {
        Browser browser = account("profile@example.com"); browser.login("profile@example.com", PASSWORD);
        status(200, browser.write("PATCH", "users/me", Map.of("name", "New Name", "phone", "0901234567", "address", "Hanoi")));
        assertEquals("New Name", body(browser.get("users/me")).path("name").asString());
        status(400, browser.write("PATCH", "users/me", Map.of("name", "New Name", "phone", "123", "address", "Hanoi")));
        status(400, browser.write("PATCH", "users/me", Map.of("name", "New Name", "phone", "0901234567", "address", "Hanoi", "role", "ADMIN")));
        status(400, browser.write("PATCH", "users/me", Map.of("name", "New Name", "phone", "0901234567", "address", "Hanoi", "email", "hijack@example.com")));
        status(400, browser.write("PATCH", "users/me", Map.of("name", "X", "phone", "0901234567", "address", "x".repeat(301))));
        status(400, browser.write("PATCH", "users/me", Map.of("name", "New Name")));
        status(400, browser.write("PATCH", "users/me", Map.of("name", 123, "phone", "0901234567", "address", "Hanoi")));
        Map<String, Object> optional = new LinkedHashMap<>();
        optional.put("name", "New Name"); optional.put("phone", null); optional.put("address", null);
        status(200, browser.write("PATCH", "users/me", optional));
        assertEquals("USER", body(browser.get("users/me")).path("role").asString());
    }

    @Test
    void passwordChangeRevokesOtherSessionsAndRotatesCurrentRefresh() throws Exception {
        Browser current = account("password@example.com"); current.login("password@example.com", PASSWORD);
        Browser other = new Browser(); other.login("password@example.com", PASSWORD);
        String oldRefresh = current.cookie("tucoffee_refresh");
        String oldAccess = current.access;
        status(400, current.write("PUT", "users/me/password", Map.of("currentPassword", "Wrong-password42", "newPassword", "Replacement-password42")));
        status(200, other.get("users/me"));
        var changed = current.write("PUT", "users/me/password", Map.of("currentPassword", PASSWORD, "newPassword", "Replacement-password42"));
        status(200, changed);
        String rotated = body(changed).path("accessToken").asString();
        assertNotEquals(oldAccess, rotated);
        current.access = oldAccess;
        status(401, current.get("users/me"));
        current.access = rotated;
        assertNotEquals(oldRefresh, current.cookie("tucoffee_refresh"));
        status(200, current.get("users/me"));
        status(401, other.get("users/me"));
        status(401, other.write("POST", "auth/refresh", null));
        status(401, new Browser().login("password@example.com", PASSWORD));
        status(200, new Browser().login("password@example.com", "Replacement-password42"));
    }

    @Test
    void adminPagingLockAndUnlockDoNotResurrectSessions() throws Exception {
        Browser user = account("managed@example.com"); user.login("managed@example.com", PASSWORD);
        long id = body(user.get("users/me")).path("id").asLong();
        Browser admin = admin("admin@example.com");
        var page = admin.get("admin/users?q=managed&active=true&page=0&size=1");
        status(200, page); assertEquals(1, body(page).path("totalItems").asInt());
        assertEquals(id, body(page).path("items").get(0).path("id").asLong());
        status(400, admin.get("admin/users?page=-1"));
        status(400, admin.get("admin/users?size=101"));
        status(400, admin.write("PATCH", "admin/users/" + id + "/active", Map.of()));
        status(400, admin.write("PATCH", "admin/users/" + id + "/active", Map.of("active", "false")));
        status(404, admin.write("PATCH", "admin/users/999999/active", Map.of("active", false)));
        status(200, admin.write("PATCH", "admin/users/" + id + "/active", Map.of("active", false)));
        status(401, user.get("users/me"));
        status(401, user.write("POST", "auth/refresh", null));
        status(200, admin.write("PATCH", "admin/users/" + id + "/active", Map.of("active", true)));
        status(401, user.get("users/me"));
        status(200, user.login("managed@example.com", PASSWORD));
    }

    @Test
    void roleAndActiveStateAreReadFromDatabaseOnEveryRequest() throws Exception {
        Browser admin = admin("role-recheck@example.com");
        long id = body(admin.get("users/me")).path("id").asLong();
        status(200, admin.get("admin/users"));
        jdbc.update("UPDATE users SET role = 'USER' WHERE id = ?", id);
        status(403, admin.get("admin/users"));
        status(200, admin.get("users/me"));
        jdbc.update("UPDATE users SET active = 0 WHERE id = ?", id);
        status(401, admin.get("users/me"));
        String inactive = body(new Browser().login("role-recheck@example.com", PASSWORD)).path("detail").asString();
        String missing = body(new Browser().login("missing@example.com", PASSWORD)).path("detail").asString();
        assertEquals(missing, inactive);
    }

    @Test
    void selfLockIsForbiddenAndConcurrentAdminLocksPreserveOneActiveAdmin() throws Exception {
        Browser first = admin("first-admin@example.com"), second = admin("second-admin@example.com");
        long firstId = body(first.get("users/me")).path("id").asLong(), secondId = body(second.get("users/me")).path("id").asLong();
        status(409, first.write("PATCH", "admin/users/" + firstId + "/active", Map.of("active", false)));
        first.csrf(); second.csrf();
        var one = CompletableFuture.supplyAsync(() -> first.uncheckedWrite("PATCH", "admin/users/" + secondId + "/active", Map.of("active", false)));
        var two = CompletableFuture.supplyAsync(() -> second.uncheckedWrite("PATCH", "admin/users/" + firstId + "/active", Map.of("active", false)));
        int a = one.join().statusCode(), b = two.join().statusCode();
        assertTrue((a == 200 && (b == 401 || b == 409)) || (b == 200 && (a == 401 || a == 409)), "Concurrent account locking must allow one winner only");
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE role = 'ADMIN' AND active = 1", Integer.class));
    }

    private Browser account(String email) throws Exception {
        Browser browser = new Browser();
        status(201, browser.write("POST", "auth/register", Map.of("name", "Coffee User", "email", email, "password", PASSWORD)));
        return browser;
    }
    private Browser admin(String email) throws Exception {
        jdbc.update("INSERT INTO users(name,email,password_hash,role,active,created_at) VALUES(?,?,?,'ADMIN',1,?)", "Coffee Admin", email, encoder.encode(PASSWORD), Timestamp.from(Instant.now()));
        Browser browser = new Browser(); status(200, browser.login(email, PASSWORD)); return browser;
    }
    private static JsonNode body(HttpResponse<String> response) { return JSON.readTree(response.body()); }
    private static void status(int expected, HttpResponse<String> response) {
        // Never print response bodies: a failing auth response might contain secrets.
        assertEquals(expected, response.statusCode(), () -> response.request().method() + " " + response.request().uri().getPath());
        if (expected >= 400) assertTrue(response.headers().firstValue("content-type").orElse("").startsWith("application/problem+json"));
    }
    private static String expiredAccess(String current) throws Exception {
        var url = Base64.getUrlEncoder().withoutPadding();
        JsonNode old = JSON.readTree(Base64.getUrlDecoder().decode(current.split("\\.")[1]));
        Map<String, Object> claims = new LinkedHashMap<>();
        claims.put("iss", "tu-coffee"); claims.put("sub", old.path("sub").asString()); claims.put("sid", old.path("sid").asString());
        claims.put("iat", Instant.now().minusSeconds(120).getEpochSecond()); claims.put("exp", Instant.now().minusSeconds(1).getEpochSecond());
        String unsigned = url.encodeToString("{\"alg\":\"HS256\"}".getBytes(StandardCharsets.UTF_8)) + "." + url.encodeToString(JSON.writeValueAsBytes(claims));
        Mac mac = Mac.getInstance("HmacSHA256"); mac.init(new SecretKeySpec(JWT_KEY, "HmacSHA256"));
        return unsigned + "." + url.encodeToString(mac.doFinal(unsigned.getBytes(StandardCharsets.UTF_8)));
    }

    private class Browser {
        final CookieManager cookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
        final HttpClient client = HttpClient.newBuilder().cookieHandler(cookies).build();
        String access;
        void csrf() throws Exception { status(200, get("auth/csrf")); }
        String cookie(String name) { return cookies.getCookieStore().getCookies().stream().filter(c -> c.getName().equals(name) && !c.hasExpired()).map(HttpCookie::getValue).findFirst().orElse(""); }
        void replaceRefresh(String value) {
            cookies.getCookieStore().getCookies().stream().filter(c -> c.getName().equals("tucoffee_refresh")).toList().forEach(c -> cookies.getCookieStore().remove(base, c));
            HttpCookie replacement = new HttpCookie("tucoffee_refresh", value); replacement.setPath("/api/v1/auth"); replacement.setVersion(0);
            cookies.getCookieStore().add(base, replacement);
        }
        HttpResponse<String> login(String email, String password) throws Exception {
            var response = write("POST", "auth/login", Map.of("email", email, "password", password));
            if (response.statusCode() == 200) access = body(response).path("accessToken").asString();
            return response;
        }
        HttpResponse<String> get(String path) throws Exception { return request("GET", path, null, false, "http://localhost:4200"); }
        HttpResponse<String> write(String method, String path, Object value) throws Exception { csrf(); return request(method, path, value, true, "http://localhost:4200"); }
        HttpResponse<String> uncheckedWrite(String method, String path, Object value) {
            try { return request(method, path, value, true, "http://localhost:4200"); }
            catch (Exception error) { throw new IllegalStateException("HTTP test transport failed", error); }
        }
        HttpRequest.Builder builder(String method, String path, Object value, boolean csrf, String origin) {
            var builder = HttpRequest.newBuilder(base.resolve(path)).header("Origin", origin);
            if (access != null) builder.header("Authorization", "Bearer " + access);
            if (csrf) builder.header("X-XSRF-TOKEN", cookie("XSRF-TOKEN"));
            if (value == null) builder.method(method, HttpRequest.BodyPublishers.noBody());
            else builder.header("Content-Type", "application/json").method(method, HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(value)));
            return builder;
        }
        HttpResponse<String> request(String method, String path, Object value, boolean csrf, String origin) throws Exception {
            return client.send(builder(method, path, value, csrf, origin).build(), HttpResponse.BodyHandlers.ofString());
        }
    }
}
