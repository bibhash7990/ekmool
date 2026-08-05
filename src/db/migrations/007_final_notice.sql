-- 007 — The second chase on an unpaid order.
--
-- Its own column rather than a cleverer reading of reminder_sent_at.
--
-- The tempting alternative was to reuse that column with a time window —
-- "chase again once the first reminder is more than twenty hours old" —
-- and it does work, right up until somebody changes the auto-cancel window
-- in cancelStaleOrders. Then the same order becomes eligible a third time,
-- and a fourth, and the only thing that ever stopped it was an interval
-- written down somewhere else entirely. A column that means one thing is
-- worth four bytes.

ALTER TABLE orders
  -- Set when the "we are about to release this" notice goes out, roughly a
  -- day after the order and a day before cancelStaleOrders takes the stock
  -- back. NULL means it has not been sent.
  ADD COLUMN final_notice_sent_at TIMESTAMP NULL AFTER reminder_sent_at;

-- The sweep reads (payment_status, status, final_notice_sent_at, created_at)
-- and there is no index on that shape. Orders is small today and will not
-- always be.
CREATE INDEX idx_orders_final_notice
  ON orders (payment_status, status, final_notice_sent_at, created_at);
