# navigation.js and partial loads: current state

Splash (`splash.js`) and localization (`localization.js`) are unchanged. Everything below was tested in jsdom and in real Chromium against a stub site that mirrors the page template. It has not yet been run on the real site.

Template assumed:

```html
<body hx-boost="true" hx-target="#page-container" hx-select="#page-container" hx-swap="outerHTML">
  <splash-screen id="splash">…</splash-screen>
  <div id="page-container" hx-history-elt>…</div>
</body>
```

---

## 1. Page navigation (boosted links, GET forms, `navigateTo`)

- **First load:** the splash starts from its loop, waits for window load, fonts, images (5 s cap) and the translations, then lifts.
- **A page change:**
  - The splash intro and the request start together.
  - The response is held until the page is covered, then swapped in.
  - Swapped-in content is localized under the splash.
  - The outro starts once images are ready.
- **Errors:** the outro runs first, then `$.errorDialog.show()`. The page is left unchanged.
- **`hx-confirm`:** replaced by `$.confirmationDialog`. It shows before the splash and before the request. Cancelling means no splash and no request.
- **Back/forward:** each press plays the splash and restores the page from htmx's snapshot. A Back press during a request aborts it, and Back wins.
- **Watchdog:** any splash that takes more than 20 s is force-ended with an error dialog.
- **Opt-out:** `data-splash="off"` on an element or any ancestor skips the splash for requests from it.

## 2. `$.navigation.navigateTo(url, showLoader = true, { replace })`

It clicks a hidden boosted `<a>`, so it behaves exactly like a link click and inherits the `<body>` defaults.

- `showLoader: false` skips the splash.
- `replace: true` replaces the history entry instead of adding one.
- Cross-origin URLs do a normal page load and ignore the other arguments.
- It returns nothing.

## 3. Overlapping navigations

Applies to navigations from `navigateTo` and from real link and GET-form clicks. The newest one wins.

| Situation | What happens |
|---|---|
| Old response not yet released (still loading, or arrived and held under the intro) | The old request is aborted and the new one is sent inside the same splash, with no second intro. A stale held response is never swapped in. |
| Repeat of the URL already loading | Ignored, so double-clicks are harmless. |
| Too late to abort (response already swapped, outro running, back/forward in progress) | A link or `navigateTo` call is queued in one slot (newest wins) and gets its own splash afterwards. A GET form at that point goes through as before. |
| Two splash-less calls | They abort each other through `hx-sync="body:replace"`. |
| POSTs, polling, anything with its own `hx-get`, `hx-confirm` or `data-splash="off"` | Left alone. Never aborted by a navigation. |

## 4. CSRF

For POST, PUT, PATCH and DELETE to the same origin, `navigation.js` sets `X-Frappe-CSRF-Token` from `$.api.session.csrf`.

- The token is read at request time.
- Nothing is sent for guests (empty, `null` or `"None"`), for GET/HEAD/OPTIONS, or to other origins.
- No trigger needs its own header.
- The header name is the `CSRF_HEADER` constant in `navigation.js` (default `X-Frappe-CSRF-Token`), in the block just before `$(function () {`.

## 5. Partial loads in the portal

A `<button>` with `hx-get` or `hx-post` fills a section without touching the URL, history or splash.

```html
<button type="button"
        hx-post="/portal/concessions"
        hx-vals='{"view": "mine"}'
        hx-target="#table-area"
        hx-select="unset"
        hx-swap="innerHTML"
        hx-sync="this:drop"
        hx-disabled-elt="this"
        data-splash="off">Concession requests</button>
<div id="table-area"></div>
```

For a read-only load, use `hx-get` and drop `hx-vals`, `hx-sync` and `hx-disabled-elt`.

| Rule | Why |
|---|---|
| `data-splash="off"` on the trigger, or on a wrapper around partial triggers | Every htmx request plays the splash by default. Don't wrap boosted navigation links, or they lose their splash. |
| `hx-select="unset"` | Cancels the `#page-container` selector inherited from `<body>`, which would otherwise wipe the target. |
| `hx-swap` set explicitly (`innerHTML`) | Cancels the inherited `outerHTML`, which would replace the target itself. |
| Use a `<button>`, not a boosted `<a>` | A link pushes the URL and opens the bare fragment on Ctrl-click. If a link is required, add `hx-push-url="false"`. |
| POST: `hx-sync="this:drop"` or `hx-disabled-elt="this"` | Without them a double click sends two POSTs. |

**Server side**

- Return only the fragment, not a full page.
- Decide what to show from the logged-in session and enforce permissions there. Never trust "who the user is" sent by the browser, and don't rely on hiding HTML for security.
- Use GET for read-only loads and POST for changes or sensitive data.

**History**

- A loaded table is part of the page snapshot, so going away and coming back restores it.
- With `hx-push-url`, Back works but plays the full splash and restores the page as it was before the table loaded.

**Overlaps:** a page navigation during a partial load is harmless, and partial loads are never aborted by navigations.

**Failures:** a failed partial load (4xx/5xx, network error, timeout, swap error) shows `$.errorDialog.show()` with the same messages as a page failure, with no splash.

- If a splash is running at that moment, the message waits until the splash is gone. Identical messages are shown once.
- Put `data-error-dialog="off"` on an element, or an ancestor, to keep its failures silent. Use it for polling and live search.
- Nothing is shown if the trigger has already been removed from the page (the user moved on), or while the browser is leaving the page.

## 6. Testing

- **`navigation-selftest.js`:** pasted into the DevTools console on the real site, it runs 29 checks (navigation, overlaps, back/forward, links, error handling, failed partial loads) and prints a pass/fail list. It passes on the stub site, and it caught 12 failures in the earlier version.
- **Not covered by tests:** the real splash animation, Safari, Firefox, touch devices, GET forms, and cross-origin `navigateTo`.

## 7. Open points

- **Pages without `#page-container`:** not handled, as agreed.
- **Optional rule:** play the splash only when the target is `#page-container`, so `data-splash="off"` isn't needed. `hx-select` and `hx-swap` would still be needed.
- **Raw HTML from Frappe:** partial loads need an endpoint that returns a fragment, not Frappe's JSON-wrapped method response.
- **Unconfirmed assumptions:** that the header name is `X-Frappe-CSRF-Token` and that GET needs no token. The name is now a constant, and the GET rule is one line, if the server differs.
- **Smaller known edges:**
  - A link queued late loses its own `hx-push-url` and `hx-target` settings.
  - `hx-confirm` while a splash is running falls back to the browser's native `window.confirm()` (see section 9).
  - In `splash.js`, `cancel()` doesn't clear a pending outro timer. This only matters if `cancel()` is used.
- **htmx upgrades:** holding the response relies on undocumented htmx behaviour, so re-run the self-test after upgrading htmx.

## 8. Files

- `navigation.js`: complete updated file.
- `navigation-selftest.js`: console self-test.
- `navigation_overlap.diff`, `navigation_csrf.diff`: the diffs of the overlap and CSRF changes.

## 9. `hx-confirm` while a splash is running

Normally `hx-confirm` shows `$.confirmationDialog` before the splash starts. If a splash is **already running** (page change or back/forward), the request is not handled by `navigation.js` and htmx shows its own native `window.confirm()` with the same question. Observed in Chromium:

| Situation | Result |
|---|---|
| No splash running | The custom `$.confirmationDialog` is used. |
| Splash running, programmatic click, OK | A native `confirm()` appeared and `$.confirmationDialog` was not called. The request was sent as an ordinary request, outside the splash session. |
| Splash running, programmatic click, Cancel | The same native dialog. No request was sent. |
| Splash running, real pointer click | Blocked by the splash overlay (the test splash covers the page), so no dialog. |

What it implies:

- **It is the browser's dialog.** It is not styled and not translated, and it freezes the page while it is open.
- **The confirmation is never skipped.** Cancel drops the request. OK sends it untouched.
- **OK can run an action on a page that is about to be replaced.** The server executes it, but the target element may be gone when the response arrives, so the user sees no result.
- **It is rare.** It needs a keyboard activation or code (`htmx.trigger`, `.click()`) while the splash is up.
- **Not provoked:** I tried to make the 20 s watchdog fire while the dialog was open (watchdog shortened to 1.5 s, dialog held 3 s) and could not.

Possible changes, not implemented:

1. Route it through `$.confirmationDialog` even during a splash. The dialog might sit behind the splash overlay.
2. Wait until the splash is gone and then ask. This needs the trigger to still exist.
3. Drop the request silently while a splash is running. This is the safest for destructive actions, because a confirmation raised while the page is being replaced is stale.