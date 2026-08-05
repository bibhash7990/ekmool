-- 003 — GST and tax invoices.
--
-- Prices on this site are GST-INCLUSIVE. /terms and /shipping-policy both
-- say so, and changing that would change every displayed price. So tax is
-- never added on top; it is back-calculated out of the price the customer
-- already agreed to:
--
--   taxable = round(inclusive / (1 + rate))
--   tax     = inclusive - taxable
--
-- Subtracting rather than rounding the tax independently is what makes an
-- invoice reconcile to total_paise exactly, with no stray paise.
--
-- Every figure is snapshotted onto order_items at the time of supply. A
-- rate change next year must not silently rewrite last year's invoice.

/* ---------------- Catalogue: what each product is, for tax ---------------- */

ALTER TABLE products
  -- Harmonised System of Nomenclature. Required on a tax invoice above the
  -- turnover threshold, and there is no reason to omit it below one.
  ADD COLUMN hsn_code     VARCHAR(10)      NULL,
  -- Basis points, so 5% is 500 and there are no floats anywhere near money.
  ADD COLUMN gst_rate_bps SMALLINT UNSIGNED NOT NULL DEFAULT 500;

/* ---------------- Orders: place of supply and invoice identity ---------------- */

ALTER TABLE orders
  -- The delivery state decides the split: same as the seller's state means
  -- CGST + SGST, different means IGST. Both are frozen on the order because
  -- the seller's registration can move and old invoices must not follow it.
  ADD COLUMN place_of_supply VARCHAR(100) NULL,
  ADD COLUMN seller_state    VARCHAR(100) NULL,
  -- Allocated lazily, on the first time an invoice is actually rendered.
  -- Allocating at checkout would burn numbers on orders that get cancelled,
  -- and a gap in an invoice series is a question you do not want to answer.
  ADD COLUMN invoice_number  VARCHAR(40)  NULL,
  ADD COLUMN invoice_date    DATE         NULL,
  -- Materialised from order_status_history so the returns window is one
  -- indexed comparison rather than a correlated subquery. The history
  -- remains the audit trail; this is a convenience copy of one row of it.
  ADD COLUMN delivered_at    TIMESTAMP    NULL,
  ADD UNIQUE KEY uq_orders_invoice (invoice_number),
  ADD KEY idx_orders_delivered (delivered_at);

/* ---------------- Order items: the frozen tax snapshot ---------------- */

ALTER TABLE order_items
  ADD COLUMN hsn_code            VARCHAR(10)       NULL,
  ADD COLUMN gst_rate_bps        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN taxable_value_paise INT UNSIGNED      NOT NULL DEFAULT 0,
  ADD COLUMN cgst_paise          INT UNSIGNED      NOT NULL DEFAULT 0,
  ADD COLUMN sgst_paise          INT UNSIGNED      NOT NULL DEFAULT 0,
  ADD COLUMN igst_paise          INT UNSIGNED      NOT NULL DEFAULT 0;

/* ---------------- Invoice numbering ---------------- */

-- One row per Indian financial year (1 April – 31 March), incremented under
-- SELECT ... FOR UPDATE so two concurrent invoices cannot take the same
-- number. GST requires the series to be consecutive within the year.
CREATE TABLE IF NOT EXISTS invoice_counters (
  fy         CHAR(7)      NOT NULL COMMENT 'e.g. 2026-27',
  last_seq   INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                          ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (fy)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

/* ---------------- Backfill ---------------- */

-- HSN codes and rates for the catalogue as it stands. Whole spices and
-- their powders sit at 5%; makhana likewise. THESE ARE A STARTING POINT —
-- confirm both the codes and the rates with your CA before you issue a real
-- tax invoice. They are seeded here so the mechanism has something true
-- enough to work with, not because they are settled.
UPDATE products SET hsn_code = '09103020', gst_rate_bps = 500
  WHERE slug IN ('kandhamal-turmeric-powder', 'lakadong-turmeric-powder');
UPDATE products SET hsn_code = '09042112', gst_rate_bps = 500
  WHERE slug IN ('guntur-chilli-powder', 'byadagi-chilli-powder');
UPDATE products SET hsn_code = '20081920', gst_rate_bps = 500
  WHERE slug = 'mithila-makhana';

-- Existing orders are backfilled with NO TAX ACCOUNTED: taxable value equal
-- to what was charged, and a zero split.
--
-- That is deliberate, not a shortcut. These orders were placed before any
-- registration was configured, and s.32 of the CGST Act forbids collecting
-- tax without one — so no GST was collected on them, and inventing a split
-- now would be describing a transaction that did not happen. A taxable value
-- without a matching tax figure would also be a row that does not reconcile,
-- which is exactly the defect an accountant finds. Their invoices print as
-- pro-forma and say so.
--
-- The HSN code is still filled in, because that is a fact about the
-- product rather than about the transaction.
UPDATE order_items i
   SET i.gst_rate_bps = 0,
       i.taxable_value_paise = i.line_total_paise,
       i.hsn_code = (
         SELECT p.hsn_code FROM products p WHERE p.slug = i.product_slug
       )
 WHERE i.taxable_value_paise = 0;

UPDATE orders o
   SET o.place_of_supply = o.address_state
 WHERE o.place_of_supply IS NULL;

UPDATE orders o
   SET o.delivered_at = (
     SELECT MIN(h.created_at) FROM order_status_history h
      WHERE h.order_id = o.id AND h.to_status = 'delivered'
   )
 WHERE o.delivered_at IS NULL;
