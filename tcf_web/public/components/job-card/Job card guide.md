# `<job-card>` guide

A slanted link card for one job opening, used by `/jobs`. Everything is set with attributes and printed as text, never as HTML, so database values cannot inject markup.

| Attribute | Content |
|---|---|
| `href` | Where the card goes (`/jobs/company/title`). Navigates like a boosted link. |
| `job-title`, `company`, `location`, `employment-type` | Text. An empty one is hidden. |
| `posted` | ISO date (`2026-11-08`), shown in the page language as "Posted …". |

Files: `job-card.js` (only this is included), `.html`, `.scss`/`.css`. Strings come from the shared `../jobs/jobs.i18n.js` (`jobs:card.posted`). Colours, the slant and the surface follow `tokens/tokens.css`, which the page must load.
