-- Turns the Google Translate language menu on (translate.enabled: true) in an already seeded site document (live and draft)
-- that has no translate setting yet. Documents that already carry the setting, on or off, are left as they are.
UPDATE pages SET
  live = CASE WHEN jsonb_typeof(live) = 'object' AND NOT live ? 'translate' THEN live || '{"translate":{"enabled":true}}'::jsonb ELSE live END,
  draft = CASE WHEN jsonb_typeof(draft) = 'object' AND NOT draft ? 'translate' THEN draft || '{"translate":{"enabled":true}}'::jsonb ELSE draft END
WHERE key = 'site' AND ((jsonb_typeof(live) = 'object' AND NOT live ? 'translate') OR (jsonb_typeof(draft) = 'object' AND NOT draft ? 'translate'));
