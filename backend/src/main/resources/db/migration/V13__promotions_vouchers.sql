CREATE TABLE vouchers (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 code VARCHAR(40) NOT NULL UNIQUE,
 title VARCHAR(160) NOT NULL,
 description TEXT NOT NULL,
 kind VARCHAR(10) NOT NULL,
 amount BIGINT NOT NULL,
 min_subtotal BIGINT NOT NULL,
 max_discount BIGINT NULL,
 starts_at TIMESTAMP(6) NOT NULL,
 ends_at TIMESTAMP(6) NOT NULL,
 total_limit INT NOT NULL,
 per_user_limit INT NOT NULL,
 enabled BOOLEAN NOT NULL DEFAULT TRUE,
 advertised BOOLEAN NOT NULL DEFAULT FALSE,
 version BIGINT NOT NULL DEFAULT 0
);
CREATE TABLE voucher_groups (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 name VARCHAR(100) NOT NULL UNIQUE
);
CREATE TABLE voucher_group_members (
 group_id BIGINT NOT NULL,
 user_id BIGINT NOT NULL,
 PRIMARY KEY (group_id, user_id),
 FOREIGN KEY (group_id) REFERENCES voucher_groups(id),
 FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE TABLE voucher_grants (
 voucher_id BIGINT NOT NULL,
 user_id BIGINT NOT NULL,
 issued_by BIGINT NOT NULL,
 issued_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 PRIMARY KEY (voucher_id, user_id),
 INDEX idx_voucher_grants_user (user_id),
 FOREIGN KEY (voucher_id) REFERENCES vouchers(id),
 FOREIGN KEY (user_id) REFERENCES users(id),
 FOREIGN KEY (issued_by) REFERENCES users(id)
);
CREATE TABLE voucher_redemptions (
 order_id BIGINT PRIMARY KEY,
 voucher_id BIGINT NOT NULL,
 user_id BIGINT NOT NULL,
 voucher_code VARCHAR(40) NOT NULL,
 subtotal_vnd BIGINT NOT NULL,
 discount_vnd BIGINT NOT NULL,
 INDEX idx_voucher_redemptions_voucher (voucher_id, order_id),
 FOREIGN KEY (order_id) REFERENCES orders(id),
 FOREIGN KEY (voucher_id) REFERENCES vouchers(id),
 FOREIGN KEY (user_id) REFERENCES users(id)
);
