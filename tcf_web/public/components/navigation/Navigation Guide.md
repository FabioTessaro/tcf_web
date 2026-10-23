# navigation.js developer guide

How to use, extend and debug `navigation.js` and the files around it (splash, localization, your dialogs). Written for someone who has never seen the code and wants to use it on a brand new site.

**Contents**

1. [The big picture](#1-the-big-picture)
2. [What is in the package](#2-what-is-in-the-package)
3. [Set it up on a new site](#3-set-it-up-on-a-new-site)
4. [How it works](#4-how-it-works)
5. [Recipes](#5-recipes)
6. [Reference](#6-reference)
7. [Troubleshooting](#7-troubleshooting)
8. [Changing navigation.js safely](#8-changing-navigationjs-safely)
9. [Testing](#9-testing)
10. [Known limitations](#10-known-limitations)
11. [Appendix: a complete minimal page](#appendix-a-complete-minimal-page)

---

## 1. The big picture

### What the visitor experiences

- The first time a page opens, a full-screen animated splash (your logo) covers the page, then lifts when the page, fonts and translations are ready.
- Clicking a normal link does **not** reload the browser page. The splash animates in and covers the page, the new content is swapped in underneath it, and the splash lifts. The address bar and the Back button work as usual.
- Some parts of a page (for example a table in a portal) can be loaded into a section **without** any splash, as an in-page update.

### How it is built

Four layers cooperate. Only the first one is this guide's subject.

| Layer | Library / file | Job |
|---|---|---|
| Controller | `navigation.js` | Decides when the splash plays, holds the new page until the splash covers the screen, handles Back/Forward, errors, overlapping clicks, CSRF, and offers `$.navigation.navigateTo()` |
| Page loading | **htmx** | Fetches HTML from the server and swaps it into the page (this is what makes "no browser reload" possible) |
| Animation | `splash.js` + **anime.js** + SVG assets | Draws the splash and exposes `start()`, `finish()` and friends |
| Text | `localization.js` + **i18next** | Translates text marked with `data-i18n` |

### Words used in this guide

| Term | Meaning |
|---|---|
| **htmx** | A small library that lets HTML attributes (`hx-get`, `hx-post`, ...) fetch HTML and put it into the page |
| **Boosted** link/form | With `hx-boost="true"` on `<body>`, every normal `<a>` and `<form>` is turned into an htmx request automatically |
| **Target / swap** | Where htmx puts the response (`hx-target`) and how (`hx-swap`, for example replace the element or only its contents) |
| **Fragment** | A piece of HTML, not a whole page. Partial loads return fragments |
| **Page change** | A request that replaces `#page-container` (the main content). It gets the splash |
| **Partial load** | A request that fills a smaller section of the page. It gets no splash |
| **Session** | One run of the splash. `navigation.js` allows exactly one at a time |
| **Snapshot** | htmx's saved copy of `#page-container`, used when the visitor presses Back |

---

## 2. What is in the package

```
tcf_web/
├── navigation/navigation.js          the controller (this guide)
├── splash/
│   ├── splash.js                     <splash-screen>, <splash-background>, <splash-logo> (ES module)
│   ├── splash.html                   the Jinja snippet that puts the splash in the page
│   ├── splash.scss  (+ scss/*.scss)  styles, written against the site's palette
│   ├── splash.css                    compiled copy of the SCSS; splash.js also injects it itself
│   └── assets/splash-background.svg, splash-logo.svg
└── localization/localization.js      i18next wrapper: $.localization
```

Things **you** must supply (not in the package):

| Item | Used for |
|---|---|
| jQuery, htmx, anime.js v4 | Runtime libraries |
| `$.confirmationDialog.show(question)` | Your confirm dialog, used for `hx-confirm` |
| `$.errorDialog.show(message)` | Your error dialog |
| `$.api.session.csrf` (optional) | The CSRF token, if your server needs one |
| i18next, jquery-i18next (optional) | Only for localization |

---

## 3. Set it up on a new site

### 3.1 One base template

The whole design assumes that **every page uses the same base template** and differs only inside `#page-container`. Only `#page-container` is taken from each response, so anything outside it (scripts and styles in `<head>`, the splash, a navbar) is loaded once and stays.

```html
<body hx-boost="true"
      hx-target="#page-container" hx-select="#page-container" hx-swap="outerHTML">

  <splash-screen id="splash">
    <splash-background>…svg…</splash-background>
    <splash-logo>…svg…</splash-logo>
  </splash-screen>

  <!-- navbar etc. can go here, outside the container -->

  <div id="page-container" hx-history-elt>
    …this page's content…
  </div>
</body>
```

The rules that come with it:

| Rule | Why |
|---|---|
| `<body>` carries `hx-boost`, `hx-target`, `hx-select`, `hx-swap` exactly like this | Every link then replaces only `#page-container` |
| The splash is **outside** `#page-container` | The container is replaced on every page change. A splash inside it would be destroyed |
| `hx-history-elt` is on `#page-container`, **not** on `<body>` | htmx snapshots and restores only that element for Back/Forward. If it contained the splash, the splash would be replaced by a frozen copy and stop working after the first Back. `navigation.js` prints a console warning at startup if you get this wrong |
| The splash id is `splash` | `navigation.js` looks it up with `getElementById("splash")` |
| Every page you can navigate to returns a full page that contains `#page-container` | See [limitations](#10-known-limitations): pages without it are not handled yet |

### 3.2 Script load order

Put everything in `<head>` with `defer`, in this order. The order matters.

```html
<head>
  <!-- styles: include splash.css here to avoid a flash of the unstyled page -->
  <link rel="stylesheet" href="/static/css/splash.css">

  <!-- 1. libraries -->
  <script src="/static/vendor/jquery.min.js" defer></script>
  <script src="/static/vendor/htmx.min.js" defer></script>
  <script src="/static/vendor/anime.umd.min.js" defer></script>      <!-- anime.js v4, global "anime" -->

  <!-- 2. localization (optional) -->
  <script src="/static/vendor/i18next.min.js" defer></script>
  <script src="/static/vendor/jquery-i18next.min.js" defer></script>
  <script src="/static/js/localization.js" defer></script>
  <!-- component *.i18n.js files go here, after localization.js -->

  <!-- 3. your plugins: dialogs and the session token (section 3.4 and 3.5) -->
  <script src="/static/js/dialogs.js" defer></script>

  <!-- 4. the splash (a module) and then the controller -->
  <script type="module" src="/static/js/splash.js"></script>
  <script src="/static/js/navigation.js" defer></script>
</head>
```

Why this works: deferred scripts and module scripts run in document order, after the HTML is parsed. `navigation.js` is last, so by the time its jQuery ready callback runs, jQuery, htmx, anime.js and the `<splash-screen>` element already exist. Do not load anything `navigation.js` needs *after* it: jQuery's ready callback can run between deferred scripts.

Two requirements to remember:

- `splash.js` must be loaded as `type="module"` **in the page, not injected later**. If it is loaded late, `<splash-screen>` is not defined yet when `navigation.js` starts and you get `$.loader.startFromLoop is not a function`.
- `splash.js` throws immediately if jQuery is not on `window`, and it needs the global `anime` (anime.js v4).

Pin exact versions of every library. The package was developed against htmx 2.x and jQuery 3.x/4.x (see [Testing](#9-testing) for exactly what was tested).

### 3.3 The splash markup and styles

- In Frappe/Jinja, `splash.html` includes the two SVG files into the template:
  ```html
  <splash-screen id="splash">
      <splash-background>{% include "tcf_web/public/components/splash/assets/splash-background.svg" %}</splash-background>
      <splash-logo>{% include "tcf_web/public/components/splash/assets/splash-logo.svg" %}</splash-logo>
  </splash-screen>
  ```
  Without Jinja, paste the SVG markup directly, or give each element a `src="/path/file.svg"` attribute and `splash.js` will fetch it.
- `<splash-screen>` is `position: fixed; inset: 0; z-index: 9998`, so while it is visible it covers the page **and blocks mouse clicks on it**. This matters for the [`hx-confirm` fallback](#54-ask-for-confirmation-first).
- The splash must be **visible by default through CSS**. That is how the first page load has no flash of the unstyled page: the splash is already covering it, and `navigation.js` then starts the animation from its loop and lifts it when everything is ready. `splash.js` injects `splash.css` itself, but only once JavaScript runs, so also link `splash.css` in `<head>`.
- `splash.scss` is written against the site's `palette` module (variables like `$dark-background`, `$light-background`, `$dark-primary-medium`, `$light-primary-medium`). On a new site either provide a palette module with those variables, or edit `splash.css` directly. The colours follow `prefers-color-scheme` (dark and light).
- The animation can be tuned with attributes on `<splash-screen>`, for example `logo-loop-delay="800"` or `min-splash-duration="400"`. The full list is in [section 6.5](#65-splash-attributes).

### 3.4 Your dialogs

`navigation.js` calls two functions you must define. They are used only at runtime, so they can be defined anywhere before the first use.

```js
// Show a question. Return a Promise: resolve (with anything but false) = confirmed;
// reject or resolve(false) = cancelled.
$.confirmationDialog = { show: (question) => Promise.resolve(window.confirm(question)) };

// Show a message. The return value is ignored.
$.errorDialog = { show: (message) => window.alert(message) };
```

Those `confirm`/`alert` versions are only a starting point. Replace them with your own styled dialogs. If either object is missing, the first error or confirmation throws a `TypeError`.

### 3.5 CSRF token (optional)

If your server needs a CSRF token on unsafe requests (Frappe does), expose it as `$.api.session.csrf`. `navigation.js` then adds it as a header to every **same-origin** `POST`, `PUT`, `PATCH` and `DELETE` made by htmx, so no button needs its own header.

- Guests have no token. Empty, `null` and the string `"None"` are all treated as "no token".
- The token is read when each request is sent, so a token that appears later (after a login) is picked up.
- The header name is the `CSRF_HEADER` constant just before `$(function () {` in `navigation.js` (default `X-Frappe-CSRF-Token`). Change it there if your server expects another name. On a site without CSRF, leave `$.api` undefined and nothing is sent.

### 3.6 Localization (optional)

If `$.localization` exists, `navigation.js` uses it automatically: the first splash waits for the translations, and every swapped-in page and every restored Back page is translated while the splash still covers it. If it does not exist, `navigation.js` simply skips this. Details in [section 5.7](#57-translatable-text).

### 3.7 Check it works

1. Open the site: the splash should cover the page and then lift.
2. Click a link: splash in, new page, splash out. The address bar changes and Back works.
3. Run the [self-test](#9-testing). It tells you in about two minutes whether the setup is healthy.

---

## 4. How it works

### 4.1 First load

1. `navigation.js` finds `#splash` and calls `startFromLoop()`: the splash is already covering the page, and its logo loop starts.
2. It waits for: the window `load` event, then the translations (if localization is present), then fonts and images that are still loading. Each of the last two waits at most 5 seconds (`ASSET_WAIT_MS`), so a failed asset can never keep the splash up forever.
3. It calls `finish()`: the outro plays and the splash disappears.

### 4.2 A page change (clicking a link)

1. The visitor clicks a boosted link. htmx is about to fetch the page and raises `htmx:confirm`.
2. If the link has `hx-confirm`, your `$.confirmationDialog` is shown first. Cancel means nothing happens: no splash, no request.
3. `navigation.js` starts a **session**: the splash intro begins and the request is sent **at the same moment**.
4. When the response arrives, `navigation.js` **holds it back** until the intro has finished and the page is fully covered. The old page therefore never visibly changes before the splash covers it.
5. The response is released. htmx swaps in the new `#page-container`; the new content is translated.
6. `navigation.js` waits for fonts and images, then plays the outro. The session ends.

The hold-back in step 4 is the heart of the file. It works by cancelling the `htmx:beforeOnLoad` event and later calling the request's `onload` again. This is not documented htmx API, so re-test after upgrading htmx ([section 8](#8-changing-navigationjs-safely)).

### 4.3 Back and Forward

The browser's `popstate` event is caught **before** htmx sees it. The splash covers the page, then the popstate is replayed once so htmx restores the saved snapshot underneath, then the splash lifts. Pressing Back repeatedly is handled:

| When the next press happens | What happens |
|---|---|
| During the intro | Coalesced into the single restore |
| While a page request is loading | The request is aborted; Back wins |
| During the restore or outro | The latest press is queued and gets its own splash afterwards |

Only history entries created by htmx are handled. Hash-only or foreign entries are left to the browser.

### 4.4 Overlapping navigations: the newest one wins

The rules apply to boosted link clicks, GET forms and `$.navigation.navigateTo()`:

| Situation | What happens |
|---|---|
| The running splash is still waiting for its page (loading, or arrived and held) | The old request is aborted and the new one is sent inside the **same** splash. No second intro. A stale held response is never shown |
| The same URL is requested again while it is loading | Ignored (double clicks are harmless) |
| Too late to abort (page already swapped, outro running, Back in progress) | A link or `navigateTo` is queued in one slot (the newest replaces an older queued one) and gets its own splash afterwards. A GET form at that point just goes through |
| Two splash-less navigations | They cancel each other (`hx-sync`), newest wins |
| POST, polling, anything with its own `hx-get`, `data-splash="off"` | Left alone. Never aborted by a navigation |

### 4.5 Errors

For a page change that fails (4xx/5xx, network error, timeout, swap error): the splash plays and lifts, the page is left unchanged, and **then** `$.errorDialog.show(message)` is called, so the dialog is never hidden behind the splash. Messages:

| Failure | Message |
|---|---|
| 4xx / 5xx | "The server returned an error." |
| Network error | "Could not reach the server." |
| Timeout | "The request timed out." |
| Swap error | "The page could not be updated." |
| Watchdog (below) | "The page took too long to respond." |

A failed **partial load** shows the same dialog at once, without a splash (see [5.3](#53-load-part-of-a-page-without-a-splash)).

### 4.6 The watchdog

If a splash has not finished 20 seconds after it started (`WATCHDOG_MS`), the request is aborted and the splash is ended with the "took too long" error. The loader can never stay up forever.

---

## 5. Recipes

### 5.1 Normal links and forms

Nothing to do. Any `<a href>` and any form inside the boosted `<body>` gets the splash and the swap. Links to another site, `target="_blank"` links and Ctrl/Cmd-clicks are not boosted by htmx and behave normally.

### 5.2 Change page from code

```js
$.navigation.navigateTo("/dashboard");                       // with the splash
$.navigation.navigateTo("/dashboard", false);                // without the splash
$.navigation.navigateTo("/dashboard", true, { replace: true }); // replace the history entry
```

- `replace: true` is for cases like "after login": the login page does not stay in the Back list.
- A URL on another origin does a normal full page load and ignores the other arguments.
- It returns nothing. To know when it is finished, listen for `splash-outro-end` on `#splash` (or `htmx:afterSettle` for splash-less calls).
- Several calls in a row: the last one wins ([4.4](#44-overlapping-navigations-the-newest-one-wins)).
- It works by clicking a hidden boosted link, so it behaves exactly like a real click.

### 5.3 Load part of a page without a splash

This is how a portal page can fill a section (for example a table of records) without leaving the page.

```html
<button type="button"
        hx-get="/portal/concessions"
        hx-target="#table-area"
        hx-select="unset"
        hx-swap="innerHTML"
        data-splash="off">
  Concession requests
</button>

<div id="table-area"></div>
```

For a POST (changes data, or sends parameters you do not want in the URL):

```html
<button type="button"
        hx-post="/portal/concessions"
        hx-vals='{"view": "mine"}'
        hx-target="#table-area"
        hx-select="unset"
        hx-swap="innerHTML"
        hx-sync="this:drop"
        hx-disabled-elt="this"
        data-splash="off">
  Concession requests
</button>
```

Every attribute has a reason:

| Attribute | Why it is needed |
|---|---|
| `hx-get` / `hx-post` | An explicit request. Unlike a boosted link, it does not touch the address bar or history |
| `hx-target="#table-area"` | Where the result goes |
| `hx-select="unset"` | `<body>` has `hx-select="#page-container"` and attributes are inherited. Without `unset`, htmx looks for `#page-container` inside your fragment, finds nothing, and wipes the target |
| `hx-swap="innerHTML"` | Same inheritance problem: `<body>` says `outerHTML`, which would replace the target itself |
| `data-splash="off"` | Every htmx request plays the splash by default. This opts out. It can sit on a wrapper around several partial triggers, but **not** around boosted navigation links, which would lose their splash too |
| `hx-sync="this:drop"` or `hx-disabled-elt="this"` (POST) | Without one of them, a double click sends two POSTs |

Server side:

- Return **only the fragment** (the table markup), not a full page and not a page containing `#page-container`.
- In Frappe, a normal `@frappe.whitelist()` method wraps its return value as JSON, which htmx would paste into the page as text. Use an endpoint that returns raw HTML.
- Decide what to show from the logged-in session and enforce permissions on the server. Anything the browser sends can be edited by the user, so never trust a "who am I" value in the request, and remember that hiding HTML is not security.
- Use GET for read-only loads, POST for changes or sensitive parameters.

Also good to know:

- The loaded table becomes part of the page snapshot, so after the visitor leaves and comes Back, it is still there. Back leaves the portal; it does not "close the table".
- If you add `hx-push-url` to a partial load, Back works but plays the **full splash** and restores the page as it was before the table loaded.
- A navigation that happens while a partial request is still loading is harmless; the stale response is dropped silently.
- Prefer a `<button>` over a link. A link with `hx-target` pushes the address bar to the fragment's URL unless you add `hx-push-url="false"`, and Ctrl-click would open the bare fragment in a new tab.

**Failures of partial loads** show `$.errorDialog.show()` with the messages from [4.5](#45-errors), with these rules:

- If a splash is running at that moment, the message waits until it is gone. Identical messages are shown once.
- `data-error-dialog="off"` on an element or an ancestor keeps its failures silent. Use it for polling and live search, where a failure every few seconds would flood the visitor.
- Nothing is shown if the trigger has already been removed from the page (the visitor moved on) or while the browser is leaving the page.

### 5.4 Ask for confirmation first

```html
<button hx-post="/records/delete" hx-confirm="Delete this record?" …>Delete</button>
```

Normally this shows `$.confirmationDialog` before anything else happens. **One exception to know about:** if a splash is already running (a page change or Back is in progress), the request is not handled by `navigation.js` and htmx shows the browser's native `window.confirm()` with the same question. In Chromium this means:

- The native dialog is unstyled and untranslated, and freezes the page while it is open.
- The confirmation is never skipped: Cancel drops the request, OK sends it as an ordinary request that is not part of the splash.
- OK can run the action on a page that is about to be replaced. The server executes it, but the target may be gone when the response arrives, so the visitor sees no result.
- It is rare, because the splash overlay blocks mouse clicks. It takes a keyboard activation or code (`htmx.trigger`, `.click()`) while the splash is up.

For destructive actions, make sure they cannot be triggered by code while a splash is running, or change that branch (the `htmx:confirm` handler).

### 5.5 Opt out of the splash or the error dialog

| Attribute | Effect |
|---|---|
| `data-splash="off"` | Requests from this element (or anything inside it) get no splash |
| `data-error-dialog="off"` | Failures of its splash-less requests show no dialog |

Both can sit on the element itself or any ancestor.

### 5.6 Page-specific JavaScript

Because the browser never reloads, some habits from classic sites stop working:

- `DOMContentLoaded` and `$(document).ready()` fire **once**, on the first load, not after each page change.
- Only `#page-container` is taken from a new page. Scripts and styles in the new page's `<head>` are not loaded, so shared scripts and CSS belong in the base template.
- `<script>` tags **inside** `#page-container` are executed by htmx after each swap. Observed in testing: an inline script ran once after a page change, and ran **again (twice, in that test) when the visitor pressed Back** to that page. Write page scripts so they are safe to run more than once.
- The document title is updated from each response's `<title>`.
- To react when new content arrives, listen to htmx events on `document`, for example `htmx:afterSettle`.
- Event handlers attached to elements inside `#page-container` die with those elements when the container is replaced. For things that persist across pages (navbar, footer, dialogs), attach to elements outside the container, or use delegated handlers on `document`.

### 5.7 Translatable text

Text is translated only when **both** are true: its namespace is registered, and its element has `data-i18n`. Text without `data-i18n` is never touched.

```html
<h2 data-i18n="pricing-card:title">Our plans</h2>
```

```js
$.localization.register('pricing-card', {
  'en-GB': { title: 'Our plans' },
  'de-DE': { title: 'Unsere Tarife' },
});
```

- Keep the default text inside the element. It stays visible if the key is missing or the namespace was never registered. Failures are silent.
- Put the `*.i18n.js` files in the **base template**. A script inside a swapped-in page runs after `htmx:afterSwap`, which can be after the first translation pass.
- `navigation.js` translates swapped-in pages and restored Back pages for you, while the splash still covers them.
- Change language with `$.localization.setLanguage('de-DE')` only. It saves the choice, sets `<html lang>`, translates the page and triggers the jQuery event `app:languagechange` on `document`.
- Supported languages live in `CONFIG.supported` in `localization.js`; adding one also touches every `.i18n.js` file, the switcher and the typography SCSS (the header of `localization.js` lists all four places).
- Known gotcha: `localization.js` has `fallback: "en"` while the supported codes are `en-GB`, `de-DE`, and so on. For a visitor whose browser language is unsupported, i18next ends up on `"en"`: `<html lang="en">` (not `en-GB`) and the default text from the HTML is shown. Keep the default text in the HTML in English, or set the fallback to a supported code.

### 5.8 React to what the splash does

The splash emits native events on `#splash` (they also reach jQuery `.on()`):

```js
$('#splash').on('splash-outro-end', () => { /* the page is fully revealed */ });
```

See the full list in [6.4](#64-events).

---

## 6. Reference

### 6.1 API

| Call | Description |
|---|---|
| `$.navigation.navigateTo(url, showLoader = true, { replace })` | Navigate from code ([5.2](#52-change-page-from-code)). Returns nothing |
| `$.loader` | The `<splash-screen>` element. Set by `navigation.js`; do not start or finish the splash from other code, because `navigation.js` owns it |
| `$.localization.*` | `register`, `setLanguage`, `translate`, `onReady`, `language`, `supported` (see the header of `localization.js`) |

### 6.2 Attributes

| Attribute | On | Effect |
|---|---|---|
| (none) | any htmx request or boosted link | Splash plays, page is held until covered |
| `hx-confirm="Question"` | trigger | `$.confirmationDialog`, then request ([5.4](#54-ask-for-confirmation-first)) |
| `data-splash="off"` | element or ancestor | No splash for its requests |
| `data-error-dialog="off"` | element or ancestor | No error dialog for its splash-less failures |
| `hx-replace-url`, `hx-push-url` | trigger | Standard htmx history control |

### 6.3 Configuration constants in `navigation.js`

| Constant | Default | Where | Meaning |
|---|---|---|---|
| `CSRF_HEADER` | `"X-Frappe-CSRF-Token"` | block before `$(function () {` | Name of the CSRF header |
| `DEBUG` | `false` | first lines of `$(function () {` | Logs every session step to the console as `[nav] …` |
| `WATCHDOG_MS` | `20000` | same | Max lifetime of one splash |
| `ASSET_WAIT_MS` | `5000` | same | Max wait for fonts/images/translations |

### 6.4 Events

On `#splash` (from `splash.js`): `splash-ready`, `splash-intro-start`, `splash-intro-end`, `splash-loop-start`, `splash-outro-start`, `splash-outro-end`, `splash-cancel`. On `<splash-background>` / `<splash-logo>`: `splash-media-ready`.

On `document`: `app:languagechange` (jQuery event, `(event, languageCode)`).

htmx events that `navigation.js` listens to: `htmx:configRequest`, `htmx:confirm`, `htmx:beforeRequest`, `htmx:beforeOnLoad`, `htmx:afterRequest`, `htmx:afterSwap`, `htmx:historyRestore`, `htmx:responseError`, `htmx:sendError`, `htmx:timeout`, `htmx:swapError`, and `htmx:sendAbort` (only to clean up the helper link of `navigateTo`).

### 6.5 Splash attributes

Set on `<splash-screen>`; names are kebab-case, values are numbers (milliseconds) unless stated:

`visible-display` (default `flex`), `hidden-display` (default `none`), `background-wave-direction`, `logo-wave-direction` (degrees, default 45), `background-reveal-duration`, `background-reveal-delay`, `background-tria-reveal-duration`, `logo-reveal-duration`, `logo-reveal-delay`, `logo-tria-reveal-duration`, `logo-loop-duration`, `logo-loop-delay`, `logo-tria-in-duration`, `logo-tria-out-duration`, `background-hide-duration`, `background-hide-delay`, `background-tria-hide-duration`, `logo-hide-duration`, `logo-hide-delay`, `logo-tria-hide-duration`, `min-splash-duration`.

The splash's own API (used by `navigation.js`): `start()`, `startFromLoop()`, `finish()`, `cancel()`, `isRunning()`, `getPhase()` (returns `"idle"`, `"intro"`, `"loop"` or `"outro"`). `start()` rejects with "Loader is not playing the intro" if a splash is already past its intro.

---

## 7. Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| `TypeError: $.loader.startFromLoop is not a function` | `splash.js` is not loaded as a module in the page (wrong path, not `type="module"`, or injected late) |
| `Cannot read properties of null (reading 'startFromLoop')` | No element with `id="splash"` |
| Console: "`<splash-screen>` requires a `<splash-background>` and a `<splash-logo>` child" | The splash markup is incomplete |
| The splash never lifts on the first load | Check the console. A failed script before `navigation.js` stops it. The 5 s asset waits mean it cannot hang on assets alone |
| The splash shows the 20 s "took too long" error | The request never finished. Check the Network tab (a hung server, a request blocked by a browser extension) |
| Splash works once, then stops working after Back/Forward | The splash is inside the history element. The console warning "`#splash` is inside the htmx history element" confirms it. Move `hx-history-elt` to `#page-container` |
| A partial load makes the section **disappear** | `hx-select="unset"` and an explicit `hx-swap` are missing on the trigger ([5.3](#53-load-part-of-a-page-without-a-splash)) |
| A partial load plays the full splash | Missing `data-splash="off"` |
| A partial load changes the address bar | It is a boosted link; use a button, or add `hx-push-url="false"` |
| POST returns 400/403 | CSRF: check `$.api.session.csrf` is set at request time, and the header name (`CSRF_HEADER`) matches what the server expects |
| A POST ran twice | Missing `hx-sync="this:drop"` / `hx-disabled-elt="this"` |
| A browser-style confirm box appeared during a page change | The `hx-confirm` fallback ([5.4](#54-ask-for-confirmation-first)) |
| `TypeError: Cannot read properties of undefined (reading 'show')` | `$.errorDialog` or `$.confirmationDialog` is not defined ([3.4](#34-your-dialogs)) |
| Console: "Loader intro failed … Loader is not playing the intro" | Other code started or finished the splash while `navigation.js` was running it. Only `navigation.js` should call `start`/`finish` |
| Text is not translated after a page change | Namespace registered in a script inside the swapped-in page (too late), or missing `data-i18n`. Move the `*.i18n.js` file to the base template |
| Page script runs twice | Expected after Back ([5.6](#56-page-specific-javascript)); make it idempotent |
| Something odd and you cannot tell why | Set `DEBUG = true` and read the `[nav] begin / popstate / replay / historyRestore / end` lines, then run the [self-test](#9-testing) |

---

## 8. Changing navigation.js safely

The file is small but its parts depend on each other. Before changing it:

1. **Read the header comment.** It is the contract: dependencies, required HTML, attributes, behaviour.
2. **Respect the invariants.**
   - At most one session exists at a time (`s`), and every session ends exactly once through `end()`.
   - The response of a page request is held in `htmx:beforeOnLoad` until the page is covered, and a stale held response must be dropped (`cur.xhr !== xhr`).
   - Only boosted GET navigations are replaced by newer ones; POSTs and requests with their own verb attribute are never aborted.
   - Errors are shown only after the splash is gone.
3. **Decide for every new kind of request** whether it is a page change (splash) or a partial (no splash), and what its failure should do.
4. **Keep `navigation.js` independent.** It works with or without localization; the CSRF block runs outside the jQuery ready callback so it is active before htmx's first request.
5. **Test.** Run the self-test before and after your change. Add a check for new behaviour ([self-test guide](navigation-selftest-guide.md)).
6. **After upgrading htmx or jQuery**, re-run the self-test. The held-response trick uses undocumented htmx behaviour.

---

## 9. Testing

`navigation-selftest.js` is a script you paste into the browser console on the real site. It runs 29 checks (setup, navigation, overlapping clicks, Back/Forward, links, error handling, partial-load failures) and prints a pass/fail list. How to run it, what each line means, and how to add checks is in **`navigation-selftest-guide.md`**.

What was tested during development:

- jsdom, plus **real Chromium 141** (headless) against a stub site that mirrors the template in this guide, with **htmx 2.0.11** and **jQuery 4.0.0**, and a stub splash with the same API as `splash.js`.
- Not tested: the real `splash.js`/anime.js animations, jQuery 3.x, Safari, Firefox, touch devices, GET forms, and cross-origin `navigateTo`.

---

## 10. Known limitations

- **Pages without `#page-container`** (for example standalone desk pages or a logout redirect) are not handled yet: the swap would use an empty selection.
- **`hx-confirm` during a running splash** uses the native `window.confirm()` ([5.4](#54-ask-for-confirmation-first)).
- **Back after a partial load with `hx-push-url`** plays the full splash and restores the page as it was before the partial load.
- **A link queued in the "too late to abort" window** is re-issued through `navigateTo`, so it loses its own `hx-push-url`/`hx-target` settings. GET forms are not queued there.
- **Cross-origin `navigateTo`** ignores `showLoader` and `replace`.
- **`splash.js` `cancel()`** does not clear a pending outro timer. This only matters if you start calling `cancel()`.
- **Localization fallback** (`"en"` vs `en-GB`), see [5.7](#57-translatable-text).
- **Partial-load failures** use the same messages as page failures; there is no per-trigger message.

---

## Appendix A: a complete minimal page

```html
<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <title>My site</title>
  <link rel="stylesheet" href="/static/css/splash.css">

  <script src="/static/vendor/jquery.min.js" defer></script>
  <script src="/static/vendor/htmx.min.js" defer></script>
  <script src="/static/vendor/anime.umd.min.js" defer></script>
  <script src="/static/js/dialogs.js" defer></script>      <!-- $.confirmationDialog, $.errorDialog -->
  <script type="module" src="/static/js/splash.js"></script>
  <script src="/static/js/navigation.js" defer></script>
</head>

<body hx-boost="true"
      hx-target="#page-container" hx-select="#page-container" hx-swap="outerHTML">

  <splash-screen id="splash">
    <splash-background><!-- paste splash-background.svg here --></splash-background>
    <splash-logo><!-- paste splash-logo.svg here --></splash-logo>
  </splash-screen>

  <div id="page-container" hx-history-elt>
    <h1>Home</h1>
    <a href="/about">About</a>

    <!-- a partial load -->
    <button type="button" hx-get="/fragments/news" hx-target="#news"
            hx-select="unset" hx-swap="innerHTML" data-splash="off">Load news</button>
    <div id="news"></div>
  </div>
</body>
</html>
```

`dialogs.js` (starter):

```js
$.confirmationDialog = { show: (q) => Promise.resolve(window.confirm(q)) };
$.errorDialog = { show: (m) => window.alert(m) };
```