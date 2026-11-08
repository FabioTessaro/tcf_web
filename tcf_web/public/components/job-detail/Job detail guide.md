# `<job-detail>` guide

The page of one opening, rendered from `templates/generators/job_opening.html`.

| Attribute | Content |
|---|---|
| `job-title`, `company` | Heading and byline. |
| `posted`, `closes` | ISO dates, shown in the page language. `closes` only when the opening is open. |
| `location`, `department`, `employment-type`, `salary` | Facts; an empty one is hidden. `salary` is formatted by the template. |
| `status` | `Open` shows the apply button; anything else shows "This position is closed." |
| `apply-href` | Same-origin target of the apply button (`/apply?opening=…`). |

The default slot takes the description. The template runs it through the `safe_html` Jinja method (`tcf_web.jobs.safe_html`) first, because it is rich text written by HR and the slot is unescaped. Everything set by attributes is printed as text.
