-- 0025_rowstore_auth_backfill.sql
-- Required before deploying strict live-session validation.
-- Blueprint only. Do not apply without an approved production change window.

BEGIN;

-- Existing rows predate explicit active/revocation fields. Preserve explicit disabled
-- states and initialize only missing values.
UPDATE um_rows
SET data = jsonb_set(
      jsonb_set(data, '{status}', COALESCE(data->'status', '"active"'::jsonb), true),
      '{session_revision}', COALESCE(data->'session_revision', '0'::jsonb), true
    ),
    updated_at = now()
WHERE tbl = 'profiles'
  AND deleted = false
  AND (NOT (data ? 'status') OR NOT (data ? 'session_revision'));

UPDATE um_rows
SET data = jsonb_set(data, '{status}', COALESCE(data->'status', '"active"'::jsonb), true),
    updated_at = now()
WHERE tbl = 'organization_users'
  AND deleted = false
  AND NOT (data ? 'status');

CREATE UNIQUE INDEX IF NOT EXISTS uq_um_profiles_normalized_email
  ON um_rows (lower(data->>'email'))
  WHERE tbl='profiles' AND deleted=false AND COALESCE(data->>'email','')<>'';

-- Fail the migration if required identity fields remain incomplete.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM um_rows
    WHERE tbl='profiles' AND deleted=false
      AND (COALESCE(data->>'status','')='' OR data->>'session_revision' IS NULL)
  ) THEN
    RAISE EXCEPTION 'profile auth backfill incomplete';
  END IF;
  IF EXISTS (
    SELECT 1 FROM um_rows
    WHERE tbl='organization_users' AND deleted=false
      AND COALESCE(data->>'status','')=''
  ) THEN
    RAISE EXCEPTION 'organization membership status backfill incomplete';
  END IF;
  IF EXISTS (
    SELECT 1 FROM um_rows p
    WHERE p.tbl='profiles' AND p.deleted=false AND COALESCE(p.data->>'org_id','')<>''
      AND NOT EXISTS (
        SELECT 1 FROM um_rows m
        WHERE m.tbl='organization_users' AND m.deleted=false
          AND m.data->>'user_id'=p.id
          AND m.data->>'org_id'=p.data->>'org_id'
          AND m.data->>'status'='active'
          AND m.data->>'role' IN ('owner','buyer')
      )
  ) THEN
    RAISE EXCEPTION 'manual membership backfill required before auth cutover';
  END IF;
END $$;

COMMIT;

-- Password migration is intentionally not fabricated here. Legacy plaintext or
-- SHA-256 profiles are upgraded to versioned scrypt after their next successful,
-- rate-limited login. The login transaction removes the plaintext field.
