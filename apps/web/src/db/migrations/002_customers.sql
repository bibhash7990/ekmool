-- 002 — Customer identity.
--
-- Until now a customer existed only as four columns copied onto each order.
-- That is correct for an order (a delivery address must be a snapshot; it
-- cannot change retroactively because the person later moved house), but it
-- means nothing connects one order to the next: no history, no saved
-- addresses, no profile.
--
-- This adds the missing entity without changing how checkout feels. The
-- customer row is created IMPLICITLY at checkout by upserting on email.
-- Nobody is asked to register, and guest checkout stays exactly as it was —
-- which is why orders.customer_id is nullable.

CREATE TABLE IF NOT EXISTS customers (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  -- Stored lowercased by the application so this unique index is a real
  -- identity constraint. utf8mb4_0900_ai_ci is already case-insensitive,
  -- but normalising on write means every read path agrees too.
  email            VARCHAR(200) NOT NULL,
  name             VARCHAR(160) NOT NULL,
  phone            VARCHAR(20)  NOT NULL,
  -- Explicit opt-in only. Placing an order is not consent to be marketed to.
  marketing_opt_in TINYINT(1)   NOT NULL DEFAULT 0,
  created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                                ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_customers_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS customer_addresses (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id      INT UNSIGNED NOT NULL,
  label            VARCHAR(40)  NOT NULL DEFAULT 'Home',
  -- Mirrors the address shape validated in lib/validation/checkout.ts, so a
  -- saved address can prefill checkout without any field mapping.
  line1            VARCHAR(200) NOT NULL,
  line2            VARCHAR(200) NULL,
  city             VARCHAR(100) NOT NULL,
  state            VARCHAR(100) NOT NULL,
  pincode          VARCHAR(10)  NOT NULL,
  landmark         VARCHAR(200) NULL,
  is_default       TINYINT(1)   NOT NULL DEFAULT 0,
  created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                                ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_customer_addresses_customer (customer_id, is_default),
  CONSTRAINT fk_customer_addresses_customer FOREIGN KEY (customer_id)
    REFERENCES customers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- customer_id is nullable with ON DELETE SET NULL: an order must survive its
-- customer being deleted. Under the DPDP Act a deletion request anonymises
-- the person, but the financial record has to remain.
--
-- order_ref is the eight characters we already print on the confirmation page
-- and in every email. Customers quote it, so lookup must be able to find an
-- order by it — and a `LIKE '%XXXXXXXX'` on a growing orders table is a full
-- scan on a public endpoint. A stored generated column makes it an index
-- seek and costs nothing at write time. Eight Crockford base32 characters is
-- 40 bits taken from the ULID's random component; a collision needs roughly
-- 1.4M orders before it is even worth thinking about, and lookup requires a
-- matching email as well.
ALTER TABLE orders
  ADD COLUMN customer_id INT UNSIGNED NULL AFTER id,
  ADD COLUMN order_ref CHAR(8) GENERATED ALWAYS AS (RIGHT(id, 8)) STORED,
  ADD KEY idx_orders_customer (customer_id, created_at),
  ADD KEY idx_orders_ref (order_ref),
  ADD CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id)
    REFERENCES customers (id) ON DELETE SET NULL;

-- Backfill from orders already placed, so existing history is not stranded.
-- Most recent order wins for name and phone: it is the freshest thing the
-- customer told us. MIN(created_at) keeps the signup date honest.
INSERT INTO customers (email, name, phone, created_at)
SELECT
  LOWER(o.customer_email),
  SUBSTRING_INDEX(GROUP_CONCAT(o.customer_name ORDER BY o.created_at DESC
                               SEPARATOR '\037'), '\037', 1),
  SUBSTRING_INDEX(GROUP_CONCAT(o.customer_phone ORDER BY o.created_at DESC
                               SEPARATOR '\037'), '\037', 1),
  MIN(o.created_at)
FROM orders o
GROUP BY LOWER(o.customer_email)
ON DUPLICATE KEY UPDATE customers.email = customers.email;

UPDATE orders o
  JOIN customers c ON c.email = LOWER(o.customer_email)
   SET o.customer_id = c.id
 WHERE o.customer_id IS NULL;
