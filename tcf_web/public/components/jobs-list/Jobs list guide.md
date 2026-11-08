# `<jobs-list>` guide

The layout of the public `/jobs` page: heading, search, a grid of `<job-card>` children, an empty message and a pager.

| Slot | Content |
|---|---|
| `title`, `subtitle` | The heading texts (use `data-i18n="jobs:list.title"`, …). |
| `search` | A `<form action="/jobs" method="get">` with a field and a submit button. It is laid out as field + button; stacked on mobile. |
| default | The `<job-card>` elements. With none, the empty message shows. |

| Attribute | Content |
|---|---|
| `page`, `pages` | Current page and page count. The pager shows only when `pages` is above 1. |
| `query` | The search text; kept in the pager links as `?query=…&page=…`. |

The server (`www/jobs/index.py`, `tcf_web/jobs.py`) filters and paginates; this component only draws. Pager links navigate like boosted links. Files and strings as in the job-card guide.
