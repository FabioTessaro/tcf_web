# `<job-apply-form>` guide

The public application form on `/apply?opening=<name>`. It posts a multipart form to `tcf_web.api.jobs.submit_application` and has three screens: form, sent, unavailable.

| Attribute | Content |
|---|---|
| `opening` | The Job Opening name. Sent with the form; the server re-checks it. |
| `opening-title` | Shown under the heading. |
| `unavailable` | Boolean. Shows the "position unavailable" screen (set by `www/apply.html` when the opening is closed, unpublished or missing). |

## What is checked where

The three EDIT HERE blocks in `job-apply-form.js` follow login-card's pattern. The browser checks required fields, email, phone, lengths and the file (extension, empty, 5 MB) only as a convenience. The server is the authority (`tcf_web/api/job_validation.py`, which also checks the file's leading bytes and content type). Keep the two sets of limits equal by hand.

## Server answers

`200` with `ok` = sent. `422` with `errors` maps field names to `jobs:errors.*` keys. `429` is the per-IP limit (5 applications an hour). A duplicate application, a filled honeypot and a closed-but-existing opening do not reveal themselves: the first two answer as success.

## Events

`job-apply-form:sent` `{ opening }` (bubbles, composed).
