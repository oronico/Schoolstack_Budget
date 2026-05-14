# SchoolStack Budget — Weekly Usage Report

**Week ending:** _____ (e.g. May 18, 2026)
**Prepared by:** _____
**Source:** Google Analytics 4 (visitors) + Railway Postgres (in-product activity)

---

## 1. Headline numbers

| Metric | This week | Last week | Δ |
| --- | --- | --- | --- |
| Visitors (unique) | **___** | ___ | ___ |
| Sessions | **___** | ___ | ___ |
| New signups | **___** | ___ | ___ |
| Active users (signed in, last 7d) | **___** | ___ | ___ |
| Models created | **___** | ___ | ___ |
| Lender packets exported | **___** | ___ | ___ |

---

## 2. Visitors — from Google Analytics

> Source: analytics.google.com → Reports → User acquisition (last 7 days)

- **Unique visitors:** _____
- **Sessions:** _____
- **Avg engagement time:** _____ min
- **% engaged sessions:** _____ %

### Top traffic sources

| Source / medium | Visitors |
| --- | --- |
| _____ | _____ |
| _____ | _____ |
| _____ | _____ |

> Source: Reports → Acquisition → Traffic acquisition

### Top pages

| Page | Views |
| --- | --- |
| _____ | _____ |
| _____ | _____ |
| _____ | _____ |

> Source: Reports → Engagement → Pages and screens

### Where visitors are

| Country / city | Visitors |
| --- | --- |
| _____ | _____ |
| _____ | _____ |

> Source: Reports → User → Demographic details

---

## 3. In-product activity — from Railway Postgres

> Run the SQL block at the bottom of this document in Railway → Postgres → Data → Query.

### Activation funnel (last 7 days)

| Stage | Users | % of active |
| --- | --- | --- |
| Active (any event) | _____ | 100% |
| Started a model | _____ | _____% |
| Progressed in wizard | _____ | _____% |
| Reached consultant view | _____ | _____% |
| Exported anything | _____ | _____% |
| Exported a Lender Packet | _____ | _____% |

### Exports this week

| Format | Exports | Distinct users |
| --- | --- | --- |
| PDF (lender packet, board packet, etc.) | _____ | _____ |
| XLSX (underwriting workbook, pro forma) | _____ | _____ |

### Top in-product actions

| Action | Count |
| --- | --- |
| _____ | _____ |
| _____ | _____ |
| _____ | _____ |

---

## 4. Quality / health

- **Errors logged this week:** _____
- **Top error route:** _____
- **Anything to triage?** _____

---

## 5. Notable users this week

| User | Activity |
| --- | --- |
| _____ | _____ |
| _____ | _____ |

---

## 6. Wins / highlights

-
-

## 7. Concerns / asks

-
-

---

## Appendix — SQL to run in Railway for sections 3 & 4

```sql
-- Activation funnel (last 7 days)
WITH per_user AS (
  SELECT user_id,
    BOOL_OR(event_name = 'created_model')             AS started,
    BOOL_OR(event_name LIKE 'wizard_section_%')       AS used_wizard,
    BOOL_OR(event_name = 'consultant_view')           AS reached_consultant,
    BOOL_OR(event_name LIKE 'exported_%')             AS exported_any,
    BOOL_OR(event_name LIKE 'exported_lender_%')      AS exported_lender_packet
  FROM events
  WHERE user_id IS NOT NULL AND created_at > NOW() - INTERVAL '7 days'
  GROUP BY user_id
)
SELECT
  COUNT(*)                                           AS active_users,
  COUNT(*) FILTER (WHERE started)                    AS started_a_model,
  COUNT(*) FILTER (WHERE used_wizard)                AS progressed_in_wizard,
  COUNT(*) FILTER (WHERE reached_consultant)         AS reached_consultant,
  COUNT(*) FILTER (WHERE exported_any)               AS exported_anything,
  COUNT(*) FILTER (WHERE exported_lender_packet)     AS exported_lender_packet
FROM per_user;

-- Exports breakdown (last 7 days)
SELECT format, COUNT(*) AS exports, COUNT(DISTINCT user_id) AS distinct_users
FROM exports
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY 1 ORDER BY exports DESC;

-- Top events (last 7 days)
SELECT event_name, COUNT(*) AS n, COUNT(DISTINCT user_id) AS distinct_users
FROM events
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY 1 ORDER BY n DESC LIMIT 15;

-- Errors (last 7 days)
SELECT route, COUNT(*) AS n, MAX(created_at) AS last_seen
FROM error_logs
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY 1 ORDER BY n DESC LIMIT 10;

-- Notable users (most active, last 7 days, real users only)
SELECT
  u.email,
  COUNT(e.id)                                            AS events_7d,
  COUNT(*) FILTER (WHERE e.event_name LIKE 'exported_%') AS exports_7d,
  MAX(e.created_at)::date                                AS last_activity
FROM users u
JOIN events e ON e.user_id = u.id
WHERE e.created_at > NOW() - INTERVAL '7 days'
  AND NOT (
       u.email ILIKE '%@bhope.org'
    OR u.email ILIKE '%@schoolstack.ai'
    OR u.email ILIKE '%@e2e.schoolstack.test'
    OR u.email ILIKE '%smoke%' OR u.email ILIKE '%playwright%' OR u.email ILIKE '%@example.com'
  )
GROUP BY u.email
ORDER BY events_7d DESC
LIMIT 10;

-- New signups this week
SELECT COUNT(*) AS new_signups_7d
FROM users
WHERE created_at > NOW() - INTERVAL '7 days'
  AND NOT (
       email ILIKE '%@bhope.org'
    OR email ILIKE '%@schoolstack.ai'
    OR email ILIKE '%@e2e.schoolstack.test'
    OR email ILIKE '%smoke%' OR email ILIKE '%playwright%' OR email ILIKE '%@example.com'
  );
```
