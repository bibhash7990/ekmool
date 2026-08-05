-- 004 — Return requests.
--
-- The rules here are not invented; they are what /refund-policy already
-- promises, encoded so the form cannot offer something the policy refuses:
--
--   damaged / wrong item / missing item  → report within 48 hours
--   sealed, unopened, changed your mind  → within 7 days of delivery
--   opened food packs                    → not returnable at all, because
--                                          resale is not lawful
--
-- Both windows run from delivery, which is why 003 materialised
-- orders.delivered_at.

CREATE TABLE IF NOT EXISTS return_requests (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id     CHAR(26)     NOT NULL,
  reason       ENUM('damaged','wrong_item','missing_item','unopened_change_of_mind')
                            NOT NULL,
  -- What the customer said, in their words. The owner reads this before
  -- deciding, so it is required rather than optional.
  detail       VARCHAR(1000) NOT NULL,
  status       ENUM('requested','approved','rejected','received','refunded')
                            NOT NULL DEFAULT 'requested',
  -- The owner's note when they resolve it; shown to the customer.
  resolution   VARCHAR(1000) NULL,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                            ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  -- One open request per order. A customer with a second problem adds to
  -- the first rather than opening a duplicate the owner has to reconcile.
  UNIQUE KEY uq_return_order (order_id),
  KEY idx_returns_status (status, created_at),
  CONSTRAINT fk_returns_order FOREIGN KEY (order_id)
    REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
