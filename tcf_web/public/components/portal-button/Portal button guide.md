# Developing with `<portal-button>`

## 1. What you get

`<portal-button>` is the login, portal and desk button of the navbar, built as a web component with Shadow DOM and jQuery. It follows the session: a guest sees "Login", a customer sees "Portal", a desk user sees "Desk". Each state has its own icon, label and link.

It is built on `component-base.js`. It fires no events of its own, and needs nothing from the navbar except being placed in it.

## 2. Files and setup

One folder, which must be served over HTTP. Only `portal-button.js` is included in pages:

| File | Role |
|---|---|
| `portal-button.js` | Behaviour. The only file you include. |
| `portal-button.html` | Markup placed inside the shadow root. |
| `portal-button.scss` / `portal-button.css` | Styles of the shadow root. You compile the scss. |
| `portal-button.i18n.js` | The labels. Loaded by the component itself, so it is **not** included by hand. |

jQuery (3 or later) must load first, then `component-base.js`. `localization.js` is optional: without it the labels stay empty, as they did before.

```html
<script src="/path/jquery.min.js"></script>
<script src="/path/component-base/component-base.js"></script>
<script src="/path/navbar/navbar.js"></script>
<script src="/path/portal-button/portal-button.js"></script>

<nav-bar>
  <portal-button navbar-role="utility"></portal-button>
  <!-- menu buttons, language switcher, ... -->
</nav-bar>
```

- **`navbar-role="utility"` goes on the tag.** The navbar uses it to put the button in the top row on desktop and in the footer of the menu on mobile.
- **The tag name:** `<portal-button>`. Add `data-tag="x-y"` to the script tag to rename it.
- **Cache busting:** `portal-button.js?v=2` copies the version onto the html, css and i18n files it loads.

## 3. How it behaves

The state comes from `$.api.session`:

| State | Icon | Label | Link |
|---|---|---|---|
| guest | `account_circle` | Login | `/login?redirect-to=<current page>` |
| portal user | `globe` | Portal | `/portal` |
| desk user (role `Desk User`) | `apps` | Desk | `/desk`, with `hx-boost="false"` (a full page load) |

The state is applied:

- when `frappe:ready` or `frappe:session-changed` fires (the session arrives in the event);
- after htmx page changes (`htmx:afterSettle`, `htmx:historyRestore`), from `$.api.session`;
- when the component connects, if the session is already known.

An unknown session (`null`) leaves the button as it is. Until a session is applied the button shows the guest defaults from the template.

**The login link's return target** is the current page, never the login page itself (that would loop), and always a same-origin path. Because the page can change without a reload, it is refreshed on `popstate` and `hashchange`, and just before the user interacts (pointer enter, pointer down, keyboard focus, context menu). So a click, a tap, a middle-click and "copy link" all see the current page.

**Desktop and mobile** are two links that are kept in sync. CSS shows one of them. The desktop link has the icon and an inner label. On mobile the link itself carries the text.

**Links** keep the boosted navigation: a plain click on the login or portal link goes through `$.navigation.navigateTo`, with the splash. The desk link has `hx-boost="false"`, which the component leaves to the browser, so it is a normal full page load.

**For page CSS and scripts**, every link has `data-portal-state="guest | portalUser | deskUser"`.

## 4. Styling

`portal-button.scss` keeps all the original rules and the `$pb-*` variables, unchanged. It adds three things at the top:

- `@include icons.material-symbols;` repeats the icon class rule inside the shadow root (see `typography/material-symbols.md`).
- `:host { display: contents; }` so the component takes no box of its own.
- `:host([hidden]) { display: none; }` so the `hidden` attribute still works.

The tweakables (corner brackets, highlight sweep, scale, durations) are still the `$pb-*` variables at the top of the scss. Edit them and recompile.

## 5. Replacing the old button

The old version was one template and a script that listened on the whole `document`. Now:

- Remove the old include and script. Add `<portal-button navbar-role="utility"></portal-button>`.
- The handlers move into the component. They are bound when it connects and removed when it disconnects, so nothing is delegated from `document` and nothing leaks.
- `portal-button.i18n.js` is unchanged, and the page no longer includes it.
- Recompile `portal-button.scss` and replace the old css.

## 6. Gotchas

- **`navbar-role="utility"` must be on the tag.** Without it the navbar treats the button as a menu item.
- **The component reads `$.api.session` itself.** Set it before you fire `frappe:ready`, or the late-built instance and the htmx triggers will see an old session.
- **The desk link is a full page load on purpose.** It is another app. Do not remove `hx-boost="false"`.
- **Do not style the host's box.** With `display: contents`, width, margin or padding on `<portal-button>` have no effect.
- **Several instances work.** Each one follows the session on its own.
- **Selectors inside the shadow root stay simple.** The component writes its button list as `.a,.b` because jQuery's `.find()` inside a shadow tree did not return anything for selectors with spaces or combinators (see `component-base.md`).
- **`focusin` is a native listener.** jQuery 3 cannot deliver it from inside a shadow root (see `component-base.md`).
- **There is no ARIA yet.** This is planned for all the components together.