-- Editorial copy that the admin can change without a deploy.
--
-- A flat key/value space rather than a column per field, because a column
-- per field means a migration every time a page gains a paragraph — which
-- is the problem this table exists to remove. Keys are dotted and
-- namespaced by page: 'home.hero.heading', 'policy.refund.body'.
--
-- This table is an OVERRIDE layer, not the source of truth. Every key also
-- exists as a compile-time constant in src/content/defaults.ts, and a key
-- absent here renders its default. That is deliberate and load-bearing:
-- rule 8 requires the browsing pages to serve with MySQL stopped, and
-- `npm run chaos` asserts it. A row here changes what is rendered at the
-- next build or tag purge; a missing row, or an unreachable database,
-- changes nothing at all.
--
-- No soft delete. A key that no longer appears in the code is dead weight
-- rather than history — the admin reports orphans so they can be removed
-- deliberately, and the audit log already records what the value was.
CREATE TABLE IF NOT EXISTS site_content (
  content_key VARCHAR(160) NOT NULL COMMENT 'dotted key, e.g. home.hero.heading',
  -- TEXT, not VARCHAR: a policy body is longer than any row limit worth
  -- guessing at, and the per-key length ceiling belongs in Zod at the
  -- write path where it can produce a readable message.
  value       TEXT         NOT NULL,
  -- 'text' renders as-is; 'markdown' is rendered on the server and passed
  -- as a node, per the rule about rich content in client components.
  format      ENUM('text','markdown') NOT NULL DEFAULT 'text',
  -- Clerk user id, matching admin_audit_log.actor: it is the identity the
  -- session carries, and it survives someone changing their email.
  updated_by  VARCHAR(120) NULL,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                           ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (content_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
