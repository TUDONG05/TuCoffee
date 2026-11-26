CREATE TABLE product_reviews (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT NOT NULL,
 product_id BIGINT NOT NULL,
 stars INT NOT NULL,
 comment VARCHAR(2000) NULL,
 is_visible BOOLEAN NOT NULL DEFAULT TRUE,
 version BIGINT NOT NULL DEFAULT 0,
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 CONSTRAINT uk_reviews_purchase UNIQUE(user_id,product_id),
 CONSTRAINT fk_reviews_user FOREIGN KEY(user_id) REFERENCES users(id),
 CONSTRAINT fk_reviews_product FOREIGN KEY(product_id) REFERENCES products(id),
 CONSTRAINT ck_reviews_stars CHECK(stars BETWEEN 1 AND 5),
 CONSTRAINT ck_reviews_version CHECK(version>=0),
 INDEX idx_reviews_public(product_id,is_visible,created_at,id),
 INDEX idx_reviews_admin(is_visible,created_at,id),
 CONSTRAINT ck_product_reviews_is_visible CHECK(is_visible IN (0,1))
);
CREATE TABLE review_moderation_events (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 review_id BIGINT NOT NULL,
 actor_id BIGINT NOT NULL,
 is_visible BOOLEAN NOT NULL,
 reason VARCHAR(500) NOT NULL,
 review_version BIGINT NOT NULL,
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 CONSTRAINT fk_review_audit_review FOREIGN KEY(review_id) REFERENCES product_reviews(id),
 CONSTRAINT fk_review_audit_actor FOREIGN KEY(actor_id) REFERENCES users(id),
 CONSTRAINT ck_review_audit_reason CHECK(CHAR_LENGTH(TRIM(reason))>0),
 CONSTRAINT ck_review_audit_version CHECK(review_version>=0),
 INDEX idx_review_audit_history(review_id,created_at,id),
 CONSTRAINT ck_review_moderation_events_is_visible CHECK(is_visible IN (0,1))
);
CREATE TABLE password_reset_challenges (
 challenge_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
 user_id BIGINT NULL,
 purpose VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'RESET_PASSWORD',
 code_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 attempts INT NOT NULL DEFAULT 0,
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 expires_at TIMESTAMP(6) NOT NULL,
 consumed_at TIMESTAMP(6) NULL,
 invalidated_at TIMESTAMP(6) NULL,
 delivery_status VARCHAR(12) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'PENDING',
 CONSTRAINT fk_reset_user FOREIGN KEY(user_id) REFERENCES users(id),
 CONSTRAINT ck_reset_purpose CHECK(purpose='RESET_PASSWORD'),
 CONSTRAINT ck_reset_attempts CHECK(attempts BETWEEN 0 AND 5),
 CONSTRAINT ck_reset_expiry CHECK(expires_at>created_at),
 CONSTRAINT ck_reset_terminal CHECK(consumed_at IS NULL OR invalidated_at IS NULL),
 CONSTRAINT ck_reset_delivery CHECK(delivery_status IN ('PENDING','SENT','FAILED','SUPPRESSED')),
 INDEX idx_reset_user(user_id,purpose,created_at),
 INDEX idx_reset_expiry(expires_at)
);
CREATE TABLE password_reset_limits (
 rate_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
 window_start TIMESTAMP(6) NOT NULL,
 last_sent_at TIMESTAMP(6) NULL,
 request_count INT NOT NULL DEFAULT 0,
 version BIGINT NOT NULL DEFAULT 0,
 CONSTRAINT ck_reset_limit_count CHECK(request_count>=0),
 CONSTRAINT ck_reset_limit_version CHECK(version>=0),
 INDEX idx_reset_limit_cleanup(window_start)
);
