-- Catalog; source IDs are references, never the local primary key.
CREATE TABLE categories (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 name VARCHAR(100) NOT NULL,
 slug VARCHAR(120) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 is_active BOOLEAN NOT NULL DEFAULT TRUE,
 version BIGINT NOT NULL DEFAULT 0,
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 CONSTRAINT uk_categories_slug UNIQUE(slug),
 CONSTRAINT ck_categories_name CHECK(CHAR_LENGTH(TRIM(name)) BETWEEN 1 AND 100),
 CONSTRAINT ck_categories_version CHECK(version >= 0),
 INDEX idx_categories_active(is_active,id),
 CONSTRAINT ck_categories_is_active CHECK(is_active IN (0,1))
);
CREATE TABLE products (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 category_id BIGINT NOT NULL,
 name VARCHAR(200) NOT NULL,
 description TEXT NULL,
 price_vnd BIGINT NOT NULL,
 image_path VARCHAR(1024) NULL,
 is_active BOOLEAN NOT NULL DEFAULT TRUE,
 version BIGINT NOT NULL DEFAULT 0,
 source_system VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NULL,
 source_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NULL,
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 CONSTRAINT fk_products_category FOREIGN KEY(category_id) REFERENCES categories(id),
 CONSTRAINT uk_products_source UNIQUE(source_system,source_id),
 CONSTRAINT ck_products_price CHECK(price_vnd BETWEEN 0 AND 100000000),
 CONSTRAINT ck_products_name CHECK(CHAR_LENGTH(TRIM(name)) BETWEEN 1 AND 200),
 CONSTRAINT ck_products_version CHECK(version >= 0),
 CONSTRAINT ck_products_source CHECK((source_system IS NULL AND source_id IS NULL) OR (source_system IS NOT NULL AND source_id IS NOT NULL AND CHAR_LENGTH(source_system)>0 AND CHAR_LENGTH(source_id)>0)),
 INDEX idx_products_catalog(category_id,is_active,id),
 INDEX idx_products_active(is_active,id),
 CONSTRAINT ck_products_is_active CHECK(is_active IN (0,1))
);
