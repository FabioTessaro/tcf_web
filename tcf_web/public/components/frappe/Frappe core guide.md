# frappe.js: session bootstrap

`public/components/frappe/frappe.js` runs once per page load and sets up everything the frontend needs to talk to Frappe as the current visitor. It owns the session (user, roles, language, CSRF token) and the SDK instance. It deliberately knows nothing about login, doctypes or file uploads: those live in extension files that plug into it.

## What it does

1. Calls the whitelisted backend method `tcf_web.api.session.get_session`.
2. Stores the result on `$.api.session`.
3. Creates a `frappe-js-sdk` instance whose requests carry the current CSRF token (`X-Frappe-CSRF-Token`).
4. Runs every registered extension so each one gets a fresh SDK and session.
5. Resolves `$.api.ready` and fires `frappe:ready`.

It can run again at any time through `$.api.session.refresh()`, for example after login or logout, because the CSRF token changes when the session does. A refresh repeats steps 1 to 4 and fires `frappe:session-changed` instead of `frappe:ready`.

## Requirements

- **jQuery** loaded as a classic script before the module. The file writes to `$.api` straight away.
- **Same origin.** The page and the Frappe backend share one origin, so cookies and CSRF headers just work.
- **The backend method** `get_session` (see below) installed and reachable.

Include order in the head:

```html
<script src="/assets/tcf_web/js/jquery.min.js"></script>
<script type="module" src="/assets/tcf_web/components/frappe/frappe.js"></script>
<script type="module" src="/assets/tcf_web/components/frappe/frappe.auth.js"></script>
```

Module scripts are deferred and run in document order, so the core always runs before extensions. Adjust the paths to match your asset layout. Your custom login template does not extend Frappe's base template, so it needs these includes too.

## The API

### `$.api.ready`

A promise that resolves with the session once the first load finishes. It always resolves, even when the backend call fails (see Failure behaviour), so scripts never hang.

```js
$.api.ready.then(function (session) {
	console.log(session.user, session.roles);
});
```

### `$.api.session`

One stable object that is mutated in place, so it is safe to keep a reference to it.

| Field | Meaning |
| --- | --- |
| `user` | User id (email), or `"Guest"` |
| `isGuest` | `true` when nobody is logged in |
| `fullName` | Display name, `null` for guests |
| `roles` | Array of role names (`["Guest"]` for guests) |
| `lang` | Language code Frappe resolved for this request |
| `csrf` | CSRF token, `null` for guests |
| `failed` | `true` if the last session load failed |
| `refresh()` | Reloads the session and rebuilds the SDK; returns a promise |

Read it only after `ready`. Before that it holds guest defaults.

### `$.api.sdk`

The raw `frappe-js-sdk` pieces for the current session: `app`, `auth`, `db`, `call`, `file`. This object is replaced on every rebuild. Never store `$.api.sdk.db` in a long-lived variable. Read it when you need it, or use it inside an extension factory (below), which re-runs for you.

### `$.api.extend(name, factory)`

Registers a feature under `$.api[name]`. The factory receives `{ sdk, session }` and returns the public object. It runs immediately if the SDK already exists, and again on every rebuild.

```js
$.api.extend("data", function (ctx) {
	return {
		list: function (doctype, args) {
			return ctx.sdk.db.getDocList(doctype, args);
		}
	};
});

// elsewhere
$.api.ready.then(function () {
	return $.api.data.list("ToDo", { limit: 5 });
}).then(console.log);
```

`extend` returns `$.api`, so calls can be chained.

### Events

Triggered on `document` with jQuery.

| Event | When | Arguments |
| --- | --- | --- |
| `frappe:ready` | Once, after the first session load | `(event, session)` |
| `frappe:session-changed` | After every later successful refresh | `(event, session, previousUser)` |

```js
$(document).on("frappe:session-changed", function (e, session, previousUser) {
	if (previousUser !== session.user) {
		// update the UI
	}
});
```

## Writing an extension

An extension is a separate module file that calls `$.api.extend`. Rules that keep it correct:

1. **Keep the factory pure.** Build and return an object. Don't fetch, bind events or touch the DOM inside it, because it re-runs on every refresh.
2. **Only use `ctx.sdk` and `ctx.session` inside the returned functions.** That way each call uses the SDK for the current session.
3. **Any method that changes who is logged in must call `ctx.session.refresh()` afterwards.** The CSRF token changes with the session, and without a refresh the next request fails with a CSRF error. Login and logout are the obvious cases.
4. **Use one namespace per concern** (`auth`, `data`, ...) so files can be added or removed independently.

A sketch of a login method following those rules:

```js
$.api.extend("auth", function (ctx) {
	return {
		login: function (username, password) {
			return ctx.sdk.auth
				.loginWithUsernamePassword({ username: username, password: password })
				.then(function () {
					return ctx.session.refresh();
				});
		}
	};
});
```

## Backend method

`tcf_web/tcf_web/api/session.py`:

```python
import frappe
from frappe.sessions import get_csrf_token


@frappe.whitelist(allow_guest=True, methods=["GET"])
def get_session():
	user = frappe.session.user
	is_guest = user == "Guest"

	return {
		"user": user,
		"is_guest": is_guest,
		"full_name": None if is_guest else frappe.utils.get_fullname(user),
		"roles": frappe.get_roles(user),
		"lang": frappe.local.lang,
		"csrf_token": None if is_guest else get_csrf_token(),
	}
```

Endpoint: `/api/method/tcf_web.api.session.get_session`. To expose more session data, add keys here and map them in `applySession` in `frappe.js`. If you move the method to another app, change `SESSION_METHOD` at the top of the file.

## Failure behaviour

- **First load fails** (network error, backend down): the error is logged, `session.failed` is `true`, `session` keeps its guest defaults, and `ready` still resolves. The SDK is built without a CSRF header.
- **A later refresh fails:** the previous session is kept as it is, `session.failed` is set, and no rebuild or `frappe:session-changed` happens. The UI is not silently logged out by a network blip.
- **Overlapping refreshes** share one request, so calling `refresh()` several times in a row is safe.

## Quick checks

In the browser console:

```js
$.api.ready.then(console.log);          // the session
$.api.session.user;                     // "Guest" or the user id
$.api.session.csrf;                     // null for guests, a string when logged in
$.api.sdk.db.getDocList("ToDo", { limit: 1 }).then(console.log);
```

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `$ is not defined` or `$.api` undefined | jQuery isn't loaded before the module |
| `session.failed` is `true` | The method path is wrong, the app isn't installed or migrated, or the server returned an error |
| CSRF error after login or logout | The extension didn't call `session.refresh()` |
| Stale data after a session change | Code kept an old `$.api.sdk.*` reference instead of reading it fresh |
| Extension namespace is undefined | Its script isn't included, or the code ran before `ready` |
| Header seems ignored | Check the `FrappeApp` constructor signature for the SDK version served by jsDelivr (custom headers are the fourth argument) |