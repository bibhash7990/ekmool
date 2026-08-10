-- EKMOOL — initial schema
-- InnoDB / utf8mb4 throughout. All money is INT paise (never float).

CREATE TABLE IF NOT EXISTS products (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug              VARCHAR(120)  NOT NULL,
  name              VARCHAR(160)  NOT NULL,
  origin_state      VARCHAR(80)   NOT NULL,
  gi_tag_name       VARCHAR(120)  NOT NULL,
  short_description VARCHAR(400)  NOT NULL,
  long_description  MEDIUMTEXT    NOT NULL,
  accent            ENUM('gold','terracotta','green') NOT NULL DEFAULT 'gold',
  is_active         TINYINT(1)    NOT NULL DEFAULT 1,
  created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                  ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_products_slug (slug),
  KEY idx_products_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS product_variants (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id          INT UNSIGNED NOT NULL,
  sku                 VARCHAR(64)  NOT NULL,
  pack_size_label     VARCHAR(40)  NOT NULL,
  pack_size_grams     INT UNSIGNED NOT NULL,
  price_inr           INT UNSIGNED NOT NULL COMMENT 'paise',
  mrp_inr             INT UNSIGNED NOT NULL COMMENT 'paise',
  stock_qty           INT          NOT NULL DEFAULT 0,
  low_stock_threshold INT UNSIGNED NOT NULL DEFAULT 10,
  is_active           TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order          INT UNSIGNED NOT NULL DEFAULT 0,
  created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                                   ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_variants_sku (sku),
  KEY idx_variants_product (product_id, sort_order),
  CONSTRAINT fk_variants_product FOREIGN KEY (product_id)
    REFERENCES products (id) ON DELETE CASCADE,
  CONSTRAINT chk_variants_stock_nonneg CHECK (stock_qty >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS product_images (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id INT UNSIGNED NOT NULL,
  url        VARCHAR(400) NOT NULL,
  alt_text   VARCHAR(400) NOT NULL,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  is_primary TINYINT(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_images_product (product_id, sort_order),
  CONSTRAINT fk_images_product FOREIGN KEY (product_id)
    REFERENCES products (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS orders (
  id                  CHAR(26)     NOT NULL COMMENT 'ULID',
  idempotency_key     VARCHAR(120) NOT NULL,
  customer_name       VARCHAR(160) NOT NULL,
  customer_email      VARCHAR(200) NOT NULL,
  customer_phone      VARCHAR(20)  NOT NULL,
  address_line1       VARCHAR(200) NOT NULL,
  address_line2       VARCHAR(200) NULL,
  address_city        VARCHAR(100) NOT NULL,
  address_state       VARCHAR(100) NOT NULL,
  address_pincode     VARCHAR(10)  NOT NULL,
  address_landmark    VARCHAR(200) NULL,
  payment_method      ENUM('cod','razorpay') NOT NULL,
  payment_status      ENUM('pending','paid','failed','refunded') NOT NULL
                        DEFAULT 'pending',
  razorpay_order_id   VARCHAR(64)  NULL,
  razorpay_payment_id VARCHAR(64)  NULL,
  subtotal_paise      INT UNSIGNED NOT NULL,
  shipping_paise      INT UNSIGNED NOT NULL DEFAULT 0,
  total_paise         INT UNSIGNED NOT NULL,
  status              ENUM('pending','confirmed','packed','shipped',
                           'delivered','cancelled') NOT NULL DEFAULT 'pending',
  tracking_id         VARCHAR(120) NULL,
  notes               VARCHAR(500) NULL,
  reminder_sent_at    TIMESTAMP    NULL,
  created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                                   ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_orders_idempotency (idempotency_key),
  -- NULL-able unique: many pending orders may have no payment id, but a
  -- given Razorpay payment can only ever be recorded once (webhook replay).
  UNIQUE KEY uq_orders_razorpay_payment (razorpay_payment_id),
  KEY idx_orders_email (customer_email),
  KEY idx_orders_status (status),
  KEY idx_orders_created (created_at),
  KEY idx_orders_payment_status (payment_status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS order_items (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id          CHAR(26)     NOT NULL,
  variant_id        INT UNSIGNED NULL COMMENT 'nullable: variant may be deleted later',
  sku               VARCHAR(64)  NOT NULL,
  product_slug      VARCHAR(120) NOT NULL,
  product_name      VARCHAR(160) NOT NULL,
  pack_size_label   VARCHAR(40)  NOT NULL,
  unit_price_paise  INT UNSIGNED NOT NULL,
  qty               INT UNSIGNED NOT NULL,
  line_total_paise  INT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  KEY idx_order_items_order (order_id),
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id)
    REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_order_items_variant FOREIGN KEY (variant_id)
    REFERENCES product_variants (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS order_status_history (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id    CHAR(26)     NOT NULL,
  from_status VARCHAR(30)  NULL,
  to_status   VARCHAR(30)  NOT NULL,
  note        VARCHAR(300) NULL,
  actor       VARCHAR(120) NOT NULL DEFAULT 'system',
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_status_history_order (order_id, created_at),
  CONSTRAINT fk_status_history_order FOREIGN KEY (order_id)
    REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS email_log (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id   CHAR(26)     NULL,
  template   VARCHAR(60)  NOT NULL,
  recipient  VARCHAR(200) NOT NULL,
  subject    VARCHAR(300) NOT NULL,
  status     ENUM('sent','failed','skipped_no_smtp') NOT NULL,
  error      VARCHAR(500) NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_email_log_order (order_id, template),
  KEY idx_email_log_created (created_at),
  CONSTRAINT fk_email_log_order FOREIGN KEY (order_id)
    REFERENCES orders (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
