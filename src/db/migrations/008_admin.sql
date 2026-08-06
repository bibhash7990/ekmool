-- 008 — Admin completeness.
--
-- Until now a new product meant editing products.seed.ts and redeploying.
-- This migration is what lets the owner do it from a browser instead: the
-- three fields the catalogue could not express (ordering, and the two SEO
-- strings that were compile-time constants), and an audit log so that
-- "who changed the price of this" has an answer.
--
-- Nothing here deletes. Every destructive-looking admin operation in the
-- code above this file archives instead, for the same reason coupons are
-- switched off rather than removed: a product that has been ordered is part
-- of a financial record, and order_items.variant_id is ON DELETE SET NULL,
-- so deleting a variant would quietly detach it from every order that
-- contained it.

/* ---------------- Catalogue: ordering and SEO ---------------- */

ALTER TABLE products
  -- The owner's chosen order on /products and the home page. Backfilled
  -- from the id below, so the catalogue looks exactly as it does today
  -- until somebody deliberately moves something.
  ADD COLUMN sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  -- The <title> and meta description. NULL means "derive it", which is what
  -- every product does today: src/content/products.ts holds hand-written
  -- editorial copy for the five launch products and remains the better
  -- source when it exists. These columns exist so a product created in the
  -- admin — which has no editorial entry and cannot get one without a
  -- deploy — still ships a real title and description rather than a blank.
  --
  -- Lengths are the practical display limits, not arbitrary: past roughly
  -- 60 characters Google truncates a title, and past ~160 a description.
  -- A column that permits 500 invites writing 500.
  ADD COLUMN seo_title       VARCHAR(70)  NULL,
  ADD COLUMN seo_description VARCHAR(180) NULL,
  ADD KEY idx_products_sort (is_active, sort_order);

UPDATE products SET sort_order = id WHERE sort_order = 0;

/* ---------------- Reports ---------------- */

-- Top products groups by slug across a date range. Without this the report
-- is a full scan of order_items joined to orders — fine at five products
-- and a few hundred orders, not fine later, and the index costs nothing.
ALTER TABLE order_items
  ADD KEY idx_order_items_slug (product_slug);

/* ---------------- Audit log ---------------- */

-- Append-only by construction: src/db/queries/audit.ts exports a writer and
-- two readers, and no function anywhere updates or deletes a row. A log the
-- application can rewrite is not evidence of anything.
--
-- The actor is the Clerk user id rather than an email, because that is the
-- identity the session actually carries and it does not change when someone
-- changes their address. The summary is a sentence written for a human
-- reading this table in six months; `detail` carries the before/after so
-- the sentence never has to be parsed to recover the values.
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor       VARCHAR(120) NOT NULL COMMENT 'Clerk user id',
  action      VARCHAR(60)  NOT NULL COMMENT 'e.g. product.update',
  entity_type VARCHAR(40)  NOT NULL,
  entity_id   VARCHAR(64)  NOT NULL,
  summary     VARCHAR(300) NOT NULL,
  -- Whatever changed, as {field: {from, to}}. NULL where there is nothing
  -- structured to record. Never credentials, never a customer's address —
  -- see recordAdminAction() for what is deliberately kept out.
  detail      JSON         NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_created (created_at),
  KEY idx_audit_entity (entity_type, entity_id, created_at),
  KEY idx_audit_actor (actor, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
