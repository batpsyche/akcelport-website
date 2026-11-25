-- Adds the News link to the header menu of an already seeded site document (live and draft), before Contact.
CREATE FUNCTION pg_temp.with_news_nav(doc jsonb) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_set(doc, '{nav}', (
    SELECT jsonb_agg(e ORDER BY pos)
    FROM (
      SELECT e, ord * 2 AS pos FROM jsonb_array_elements(doc->'nav') WITH ORDINALITY AS n(e, ord)
      UNION ALL
      SELECT '{"label":"News","href":"/news/"}'::jsonb,
        COALESCE((SELECT min(ord) * 2 - 1 FROM jsonb_array_elements(doc->'nav') WITH ORDINALITY AS c(e, ord) WHERE e->>'href' = '/contact/'), 2147483647)
    ) AS items
  ))
$$;

CREATE FUNCTION pg_temp.needs_news_nav(doc jsonb) RETURNS boolean LANGUAGE sql AS $$
  SELECT doc IS NOT NULL AND jsonb_typeof(doc->'nav') = 'array' AND NOT (doc->'nav' @> '[{"href":"/news/"}]')
$$;

UPDATE pages SET
  live = CASE WHEN pg_temp.needs_news_nav(live) THEN pg_temp.with_news_nav(live) ELSE live END,
  draft = CASE WHEN pg_temp.needs_news_nav(draft) THEN pg_temp.with_news_nav(draft) ELSE draft END
WHERE key = 'site' AND (pg_temp.needs_news_nav(live) OR pg_temp.needs_news_nav(draft));

DROP FUNCTION pg_temp.with_news_nav(jsonb);
DROP FUNCTION pg_temp.needs_news_nav(jsonb);
