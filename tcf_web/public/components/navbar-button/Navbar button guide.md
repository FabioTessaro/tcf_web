# Developing with `<navbar-button>`

## 1. What you get

`<navbar-button>` is a text link of the navbar menu, built as a web component with Shadow DOM and jQuery. One element is one link. It shows a translated label in a desktop style and a mobile style (CSS shows one of them) and keeps the boosted page navigation of the site.

It is built on `component-base.js`. It fires no events and does not need a `<nav-bar>`: the navbar simply places it, because a child without a `navbar-role` is a menu button.

## 2. Files and setup

One folder, which must be served over HTTP. Only `navbar-button.js` is included in pages:

| File | Role |
|---|---|
| `navbar-button.js` | Behaviour. The only file you include. |
| `navbar-button.html` | Markup placed inside the shadow root. |
| `navbar-button.scss` / `navbar-button.css` | Styles of the shadow root. You compile the scss. |
| `navbar-button.i18n.js` | The labels. Loaded by the component itself, so it is **not** included by hand. |

jQuery (3 or later) must load first, then `component-base.js`. `localization.js` is optional: without it the labels keep their default text.

```html
<script src="/path/jquery.min.js"></script>
<script src="/path/component-base/component-base.js"></script>
<script src="/path/navbar/navbar.js"></script>
<script src="/path/navbar-button/navbar-button.js"></script>

<nav-bar>
  <navbar-button href="/" i18n="navbar-button:home.label">Home</navbar-button>
  <navbar-button href="/contacts" i18n="navbar-button:contacts.label">Contacts</navbar-button>
  <navbar-button href="/company" i18n="navbar-button:company.label">Company</navbar-button>
</nav-bar>
```

- **The tag name:** `<navbar-button>`. Add `data-tag="x-y"` to the script tag to rename it.
- **Cache busting:** `navbar-button.js?v=2` copies the version onto the html, css and i18n files it loads.
- **Adding a button:** add a tag. To add a label, add its key to every language block in `navbar-button.i18n.js`.

## 3. Attributes

| Attribute | Effect |
|---|---|
| `href` | Where the link goes. Applied to the desktop link and the mobile link. Without it the link goes to `/`. |
| `i18n` | The translation key of the label, for example `navbar-button:home.label`. |
| `navbar-role` | Optional. A child without a role is a menu button for the navbar, which is what this is. |

All of them can change at any time, and both links follow.

**The text between the tags is the default label.** It is what shows until a translation replaces it, and what stays when there is no `i18n` attribute or no `localization.js`. Removing the `i18n` attribute goes back to the default text.

## 4. How it behaves

- **Translation.** The component translates its own shadow root when it is built, and again on every language switch. The page's `localization.js` cannot reach inside a shadow root, so the component does it through `ComponentBase`.
- **Navigation.** A plain click calls `$.navigation.navigateTo`, with the splash, as a boosted link does. Ctrl, Cmd and Shift clicks, other origins and `target="_blank"` stay normal links.
- **Placement.** In the mobile layout the navbar puts it in the menu list under the bar. On desktop it goes in the bottom row.
- **Both links stay in the markup.** Only one is visible at a time, chosen by CSS media queries on the viewport width.
- **Events.** None. A click does not tell the navbar to close the menu. If the mobile menu ever stays open after a link, the fix is a click handler in `_activate` that calls `ComponentBase.emit(this, "navbar-action", {})`, which the navbar answers by closing the menu.

## 5. Styling

`navbar-button.scss` keeps all the original rules (colours, the slanted tap pill on mobile, the underline and lift on desktop hover). It adds two things at the top:

- `:host { display: contents; }` so the component takes no box of its own, and the button sits in the navbar's slot exactly as before.
- `:host([hidden]) { display: none; }` so the `hidden` attribute still works.

- **Typography** comes from CSS custom properties (`--tf-navigation-main-*`). They are inherited into the shadow root, so they must be defined on an ancestor of the component, normally `:root`. `<html lang>` also reaches it, so the `:lang()` typeface rules still work.
- **`type.for-script(...)` blocks** are empty today. If you put rules in them, check the selector the mixin produces: a selector that starts with `html` or `:root` cannot match inside a shadow root.

## 6. Replacing the old buttons

The old version was one template with three buttons, and an empty script. Now:

- Remove the old include. Add one `<navbar-button>` tag per button, as in section 2.
- `navbar-button.i18n.js` is unchanged, and the page no longer includes it.
- Recompile `navbar-button.scss` and replace the old css.

## 7. Gotchas

- **One element per button.** There is no element that holds three.
- **Do not style the host's box.** With `display: contents`, width, margin or padding on `<navbar-button>` have no effect. Style the labels in the scss.
- **The label is empty until something fills it.** With no text between the tags, no `i18n` and no `localization.js`, the link has no text.
- **Splash and htmx settings come from `<body>`.** The links live inside the shadow root, so attributes such as `data-splash="off"` or `hx-target` on the `<navbar-button>` tag do not reach them. Navigation uses the settings of `<body>`.
- **There is no ARIA yet.** This is planned for all the components together.