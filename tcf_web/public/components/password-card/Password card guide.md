# `<password-card>` guide

## 1. What you get

The card for setting a new password, in the same slanted style as `<login-card>`. One component, two entry paths:

| Mode | When | Fields |
|---|---|---|
| `change` | Logged in, no `?key=` in the URL | current, new, confirm |
| `reset` | Emailed link, `?key=` present | new, confirm |
| `done` | After a successful save | none, a continue button |
| `invalid` | The server answered 410: link used or expired | none, a back-to-login button |

The mode is chosen at load from the URL. A guest on the `change` path is sent to `/login?redirect-to=<this page>`, and login-card brings them back.

## 2. Files and setup

| File | Role |
|---|---|
| `password-card.js` | Behaviour. The only file included in pages (`www/base.html` does it). |
| `password-card.html` | Shadow DOM markup. |
| `password-card.scss` / `.css` | Styles. Compile the scss, keep the css in step. |
| `password-card.i18n.js` | Headings, buttons, error messages, and the page fields' labels and placeholders. |

Needs `text-field`, `primary-button`, `frappe.js` and `frappe.auth.js` (for `$.api.auth.changePassword` and `resetPassword`).

## 3. Using it in a page

See `www/update-password.html`: three `<text-field type="password">` children with `slot="current|new|confirm"`. The `current` slot is ignored in `reset` mode.

## 4. Behaviour to know

- **Validation** in the file only covers what needs no server (required, confirm matches, new differs from current). The server decides the rest.
- **Server errors:** 401/403 marks the current-password field; 410 switches to `invalid`; anything else (for example a password policy failure) opens `$.errorDialog` with Frappe's message.
- **Redirect after success** is `?redirect-to=` (same-origin only) or `/`. Frappe's own next URL is ignored on purpose, because for desk users it is the desk.
- **Events** (bubble, composed): `password-card:success` `{ target }`, `password-card:modechange` `{ mode, previous }`.
- **Not included:** the on-screen-keyboard handling of login-card. Add it if the three fields prove too tall on small phones.
- **Success logs the user in again** (Frappe does that in both flows), so `$.api.session` is refreshed.
