-- Owners were inserted with name = email when contact name was blank (findOrCreateOwner fallback).
-- Backfill from linked contract counterparty (same semantics as import: name, else company).

WITH email_like AS (
  SELECT id
  FROM owners
  WHERE trim(name) ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
),
best_row AS (
  SELECT DISTINCT ON (c.owner_id)
    c.owner_id,
    coalesce(
      nullif(trim(c.counterparty_name), ''),
      nullif(trim(c.counterparty_company), '')
    ) AS new_name
  FROM contracts c
  INNER JOIN email_like e ON e.id = c.owner_id
  WHERE coalesce(
      nullif(trim(c.counterparty_name), ''),
      nullif(trim(c.counterparty_company), '')
    ) IS NOT NULL
  ORDER BY
    c.owner_id,
    c.signing_date DESC NULLS LAST,
    c.created_at DESC
)
UPDATE owners o
SET name = br.new_name
FROM best_row br
WHERE o.id = br.owner_id
  AND trim(br.new_name) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$';
