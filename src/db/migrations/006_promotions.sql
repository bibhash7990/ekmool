-- 006 — Coupons, reviews and the newsletter.
--
-- The part of this worth reading twice is what a discount does to GST.
--
-- Prices on this site are GST-inclusive, so tax is extracted from the price
-- rather than added to it. Section 15(3)(a) of the CGST Act excludes from
-- the transaction value a discount given at or before the time of supply
-- and recorded in the invoice — which is exactly what a checkout coupon is.
-- So the discount has to come off *before* the tax is worked out, per line,
-- and each line's share has to be stored: an invoice that shows a discount
-- on the total but taxes the undiscounted lines does not reconcile, and
-- over-declares output tax on every order that used a voucher.
--
-- Hence order_items.discount_paise. The allocation is proportional and
-- sums to orders.discount_paise exactly — see allocateDiscount() in
-- src/lib/coupons.ts.

CREATE TABLE IF NOT EXISTS coupons (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  -- Stored uppercase by the application, so the unique index is a real
  -- identity constraint and SAVE10 cannot coexist with save10.
  code               VARCHAR(40)  NOT NULL,
  -- Shown to the customer when the code is accepted, so they can see what
  -- they got rather than inferring it from a number.
  description        VARCHAR(160) NOT NULL,
  kind               ENUM('percent','flat','free_shipping') NOT NULL,
  -- Basis points, for kind='percent'. 1000 = 10%.
  percent_bps        INT UNSIGNED NULL,
  -- Paise, for kind='flat'.
  amount_paise       INT UNSIGNED NULL,
  -- Ceiling on a percentage discount. "20% off, up to ₹200" is the shape
  -- almost every real promotion takes, and without this a percentage
  -- coupon on a large basket is an unbounded liability.
  max_discount_paise INT UNSIGNED NULL,
  min_subtotal_paise INT UNSIGNED NOT NULL DEFAULT 0,
  starts_at          TIMESTAMP    NULL,
  ends_at            TIMESTAMP    NULL,
  -- NULL means unlimited. times_used is incremented inside the checkout
  -- transaction under a row lock, which is what makes a "first 100 orders"
  -- cap hold under concurrency rather than approximately hold.
  global_limit       INT UNSIGNED NULL,
  per_customer_limit INT UNSIGNED NOT NULL DEFAULT 1,
  times_used         INT UNSIGNED NOT NULL DEFAULT 0,
  is_active          TINYINT(1)   NOT NULL DEFAULT 1,
  created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                                  ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_coupons_code (code),
  KEY idx_coupons_active (is_active, ends_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  coupon_id      INT UNSIGNED NOT NULL,
  order_id       CHAR(26)     NOT NULL,
  -- Lowercased. This is what the per-customer cap counts, and it is kept
  -- separately from the order because an erasure anonymises the order but
  -- the cap still has to mean something afterwards. Erasure overwrites this
  -- too — see src/db/queries/privacy.ts.
  customer_email VARCHAR(200) NOT NULL,
  -- The total benefit delivered: money off the goods plus any shipping
  -- waived. Deliberately not the same number as orders.discount_paise,
  -- which is only the part that came off the goods and therefore the only
  -- part that moves the taxable value.
  discount_paise INT UNSIGNED NOT NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  -- One coupon per order, enforced rather than assumed.
  UNIQUE KEY uq_redemption_order (order_id),
  KEY idx_redemption_customer (coupon_id, customer_email),
  CONSTRAINT fk_redemption_order FOREIGN KEY (order_id)
    REFERENCES orders (id) ON DELETE CASCADE,
  -- RESTRICT, not CASCADE: a coupon that has been used is part of the
  -- financial record. Deactivate it; do not delete it out from under the
  -- orders that claimed it.
  CONSTRAINT fk_redemption_coupon FOREIGN KEY (coupon_id)
    REFERENCES coupons (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE orders
  ADD COLUMN coupon_code    VARCHAR(40)  NULL AFTER subtotal_paise,
  -- Money off the goods. Zero on every order placed before this migration,
  -- which is true: they had no coupon.
  ADD COLUMN discount_paise INT UNSIGNED NOT NULL DEFAULT 0 AFTER coupon_code;

ALTER TABLE order_items
  -- This line's share of orders.discount_paise. The shares sum to the order
  -- discount exactly, and taxable_value_paise is computed from
  -- (line_total_paise - discount_paise), never from line_total_paise alone.
  ADD COLUMN discount_paise INT UNSIGNED NOT NULL DEFAULT 0 AFTER line_total_paise;

-- Reviews.
--
-- Only from someone who actually received the product: the row carries the
-- order it came from, and the API will not create one without a delivered
-- order containing that product. There is no path that writes a review
-- without an order id, which means there is no path that fabricates one.
CREATE TABLE IF NOT EXISTS reviews (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_slug   VARCHAR(120) NOT NULL,
  order_id       CHAR(26)     NOT NULL,
  customer_email VARCHAR(200) NOT NULL,
  -- Derived from the order's name, not typed: "Bibhash S.". Publishing a
  -- full name is more than anyone signed up for, and a free-text field
  -- would let one customer sign a review as another.
  display_name   VARCHAR(80)  NOT NULL,
  rating         TINYINT UNSIGNED NOT NULL,
  title          VARCHAR(120) NOT NULL,
  body           VARCHAR(2000) NOT NULL,
  -- Nothing is visible until the owner publishes it.
  status         ENUM('pending','published','rejected') NOT NULL DEFAULT 'pending',
  moderator_note VARCHAR(500) NULL,
  published_at   TIMESTAMP    NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                              ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  -- One review per product per order. Buying the same thing twice earns a
  -- second review; clicking submit twice does not.
  UNIQUE KEY uq_reviews_order_product (order_id, product_slug),
  KEY idx_reviews_product (product_slug, status, created_at),
  KEY idx_reviews_moderation (status, created_at),
  CONSTRAINT fk_reviews_order FOREIGN KEY (order_id)
    REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT chk_reviews_rating CHECK (rating BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Newsletter, double opt-in.
--
-- A row here means someone typed an address. It means nothing else until
-- status is 'confirmed', because anyone can type anyone's address — which
-- is the entire reason double opt-in exists and the reason nothing is ever
-- sent to a 'pending' row except the one confirmation request.
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  email           VARCHAR(200) NOT NULL,
  status          ENUM('pending','confirmed','unsubscribed') NOT NULL
                               DEFAULT 'pending',
  -- SHA-256 of the token in the emailed link, never the token itself. The
  -- link is a bearer credential: someone reading a database backup should
  -- not be able to confirm or unsubscribe anybody.
  token_hash      CHAR(64)     NOT NULL,
  token_issued_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at    TIMESTAMP    NULL,
  unsubscribed_at TIMESTAMP    NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                               ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_newsletter_email (email),
  KEY idx_newsletter_token (token_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
