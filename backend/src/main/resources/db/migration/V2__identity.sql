CREATE TABLE users (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL,
    password_hash VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NULL,
    address VARCHAR(300) NULL,
    role VARCHAR(10) NOT NULL DEFAULT 'USER',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP(6) NOT NULL,
    CONSTRAINT uk_users_email UNIQUE (email),
    CONSTRAINT ck_users_role CHECK (role IN ('USER', 'ADMIN'))
);
CREATE TABLE auth_sessions (
    id CHAR(36) NOT NULL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    refresh_hash CHAR(64) NOT NULL,
    expires_at TIMESTAMP(6) NOT NULL,
    revoked_at TIMESTAMP(6) NULL,
    created_at TIMESTAMP(6) NOT NULL,
    CONSTRAINT uk_sessions_refresh UNIQUE (refresh_hash),
    CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_sessions_user (user_id)
);
CREATE TABLE auth_token_history (
    token_hash CHAR(64) NOT NULL PRIMARY KEY,
    session_id CHAR(36) NOT NULL,
    expires_at TIMESTAMP(6) NOT NULL,
    CONSTRAINT fk_history_session FOREIGN KEY (session_id) REFERENCES auth_sessions(id),
    INDEX idx_history_expiry (expires_at)
);
CREATE TABLE auth_rate_limits (
    rate_key CHAR(64) NOT NULL PRIMARY KEY,
    failures INT NOT NULL,
    window_start TIMESTAMP(6) NOT NULL
);
-- Serializes identity state transitions, including first-admin and last-admin checks.
CREATE TABLE identity_lock (id INT NOT NULL PRIMARY KEY);
INSERT INTO identity_lock (id) VALUES (1);
