-- 005 — Discovery: wishlists and back-in-stock interest.
--
-- Two tables, and deliberately no FULLTEXT index. Search runs over the
-- hourly-cached catalogue in memory (src/lib/search.ts) rather than as a
-- query, because at five products a FULLTEXT scan would be slower, would
-- put a database round trip on a path that currently survives MySQL being
-- down, and — the part that actually matters — could not match "haldi" to
-- turmeric. The synonym table is the feature; the index would not be.
-- Revisit at a few thousand products, which is where an in-memory scan
-- stops being free.

CREATE TABLE IF NOT EXISTS wishlist_items (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id  INT UNSIGNED NOT NULL,
  -- The slug, not a variant id or a product id. A wishlist is a note about
  -- a thing you want, not a line item: people save "Lakadong turmeric",
  -- then choose the pack size when they buy. Storing the slug also means a
  -- variant being retired cannot silently empty someone's list.
  product_slug VARCHAR(120) NOT NULL,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  -- Saving the same product twice is a no-op, not a second row. The merge
  -- from a guest's localStorage on sign-in relies on this being an upsert.
  UNIQUE KEY uq_wishlist_customer_product (customer_id, product_slug),
  KEY idx_wishlist_customer (customer_id, created_at),
  CONSTRAINT fk_wishlist_customer FOREIGN KEY (customer_id)
    REFERENCES customers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Back-in-stock interest.
--
-- This is a transactional notification a person explicitly asked for about
-- one specific pack, not a mailing list, and the two must never be confused:
-- nothing here feeds marketing, and the row is consumed when the mail goes
-- out. Erasure under the DPDP Act deletes these outright (unlike orders,
-- which are financial records that have to survive) — see
-- src/db/queries/privacy.ts.
CREATE TABLE IF NOT EXISTS back_in_stock_requests (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  variant_id    INT UNSIGNED NOT NULL,
  email         VARCHAR(200) NOT NULL,
  -- Bumped when someone asks again for a pack they were already waiting on
  -- — after a previous notification, or because they forgot. It is the
  -- honest demand signal for the owner: how many people, how many times.
  request_count INT UNSIGNED NOT NULL DEFAULT 1,
  -- NULL means still waiting. Set when the mail is sent, which is also what
  -- stops the stock-update path from mailing the same person twice.
  notified_at   TIMESTAMP    NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                             ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  -- One row per person per pack, ever. A repeat request updates this row
  -- (clearing notified_at) rather than inserting a second, so a variant
  -- that goes in and out of stock a dozen times cannot accumulate a dozen
  -- rows per waiting customer.
  UNIQUE KEY uq_back_in_stock_variant_email (variant_id, email),
  -- The lookup the stock-update path makes: everyone still waiting on this
  -- variant. Partial indexes do not exist in MySQL, so notified_at is in
  -- the key rather than a WHERE clause on the index.
  KEY idx_back_in_stock_pending (variant_id, notified_at),
  KEY idx_back_in_stock_email (email),
  CONSTRAINT fk_back_in_stock_variant FOREIGN KEY (variant_id)
    REFERENCES product_variants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
