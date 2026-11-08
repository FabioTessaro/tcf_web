# Developing with `<account-buttons>`

## 1. What you get

`<account-buttons>` is the group of account buttons in the navbar, built as a web component with Shadow DOM and jQuery. It draws whatever the **server** lists in `$.api.session.entries`, which is **one entry at most**: a guest sees "Login", a desk user sees "Desk", an employee without desk access (or outside the network, once that rule exists) sees "HR", any other logged-in user sees "Account" (`/me`, where the logout is). Each entry has its own icon, label and link.

Because the server builds the list, the navbar cannot offer something the user may not open. Hidden means absent: for example Desk is not drawn at all when the server does not return it.

It is built on `component-base.js`. It fires no events of its own, and needs nothing from the navbar except being placed in it.

## 2. Files and setup

One folder, which must be served over HTTP. Only `account-buttons.js` is included in pages:

| File | Role |
|---|---|
| `account-buttons.js` | Behaviour. The only file you include. |
| `account-buttons.html` | Markup placed inside the shadow root. |
| `account-buttons.scss` / `account-buttons.css` | Styles of the shadow root. You compile the scss. |
| `account-buttons.i18n.js` | The labels. Loaded by the component itself, so it is **not** included by hand. |

jQuery (3 or later) must load first, then `component-base.js`. `localization.js` is optional: without it the labels stay empty, as they did before.

```html
<script src="/path/jquery.min.js"></script>
<script src="/path/component-base/component-base.js"></script>
<script src="/path/navbar/navbar.js"></script>
<script src="/path/account-buttons/account-buttons.js"></script>

<nav-bar>
  <account-buttons navbar-role="utility"></account-buttons>
  <!-- menu buttons, language switcher, ... -->
</nav-bar>
```

- **`navbar-role="utility"` goes on the tag.** The navbar uses it to put the button in the top row on desktop and in the footer of the menu on mobile.
- **The tag name:** `<account-buttons>`. Add `data-tag="x-y"` to the script tag to rename it.
- **Cache busting:** `account-buttons.js?v=2` copies the version onto the html, css and i18n files it loads.

## 3. How it behaves

### Where the entries come from

`tcf_web.api.session.get_session` returns `entries`, built by `tcf_web/entries.py`:

| User | Entries |
|---|---|
| guest | `login` (`/login?redirect-to=<current page>`, built in the browser) |
| System User (desk access) | `desk` (`/desk`) |
| anything contributed by an app | e.g. `hr` (`/hrms`) from tcf_hr, for users with an active Employee |

Only the entry with the lowest `order` is returned (Desk 10, HR 20, Account 90), so a user who qualifies for both sees Desk. The component still draws any list it is given.
| logged in, nothing above | `account` (`/me`) |

Other apps add entries with the hook `tcf_web_account_entries` (dotted paths to `fn(user) -> list[dict]`). An entry is `{key, href, label, icon, boost, order}`; `label` is an i18n key in the `account-buttons` namespace. Entries are validated on the server and again in the browser: `href` must be a same-origin path, keys are unique (first wins) and the list is sorted by `order`. `boost: false` (the default) is a full page load, which is right for Desk, HR and `/me`.

The list is applied:

- when `frappe:ready` or `frappe:session-changed` fires (the session arrives in the event);
- after htmx page changes (`htmx:afterSettle`, `htmx:historyRestore`), from `$.api.session`; nothing is redrawn if the list did not change;
- when the component connects, if the session is already known.

An unknown session (`null`) leaves the buttons as they are. Until a session is applied the component shows the guest "Login" default from the template.

**The login link's return target** is the current page, never the login page itself (that would loop), and always a same-origin path. It is refreshed on `popstate` and `hashchange`, and just before the user interacts (pointer enter, pointer down, keyboard focus, context menu).

**Desktop and mobile** are two links per entry, kept in sync. CSS shows one of them. The desktop link has the icon and an inner label. On mobile the link itself carries the text.

**Links** with `boost: true` keep the boosted navigation through `$.navigation.navigateTo`, with the splash. Links with `boost: false` get `hx-boost="false"`, which the component leaves to the browser.

**For page CSS and scripts**, every link has `data-account-entry="<key>"`.

## 4. Styling

`account-buttons.scss` keeps all the original rules and the `$pb-*` variables, unchanged. It adds three things at the top:

- `@include icons.material-symbols;` repeats the icon class rule inside the shadow root (see `typography/material-symbols.md`).
- `:host { display: contents; }` so the component takes no box of its own.
- `:host([hidden]) { display: none; }` so the `hidden` attribute still works.

The tweakables (corner brackets, highlight sweep, scale, durations) are still the `$pb-*` variables at the top of the scss. Edit them and recompile.

## 5. Replacing the old button

The old version was one template and a script that listened on the whole `document`. Now:

- Remove the old include and script. Add `<account-buttons navbar-role="utility"></account-buttons>`. (This component was `<portal-button>` before it learned to draw several entries.)
- The handlers move into the component. They are bound when it connects and removed when it disconnects, so nothing is delegated from `document` and nothing leaks.
- `account-buttons.i18n.js` is unchanged, and the page no longer includes it.
- Recompile `account-buttons.scss` and replace the old css.

## 6. Gotchas

- **`navbar-role="utility"` must be on the tag.** Without it the navbar treats the button as a menu item.
- **The component reads `$.api.session` itself.** Set it before you fire `frappe:ready`, or the late-built instance and the htmx triggers will see an old session.
- **Desk and HR are full page loads on purpose.** They are other apps. Keep `boost: false` for them.
- **Do not style the host's box.** With `display: contents`, width, margin or padding on `<account-buttons>` have no effect.
- **Several instances work.** Each one follows the session on its own.
- **Selectors inside the shadow root stay simple.** The component writes its button list as `.a,.b` because jQuery's `.find()` inside a shadow tree did not return anything for selectors with spaces or combinators (see `component-base.md`).
- **`focusin` is a native listener.** jQuery 3 cannot deliver it from inside a shadow root (see `component-base.md`).
- **There is no ARIA yet.** This is planned for all the components together.