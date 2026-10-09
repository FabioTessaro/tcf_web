# Developing with `<nav-bar>`

## 1. What you get

`<nav-bar>` is a fixed top bar built as a web component with Shadow DOM and jQuery. It has three layers:

- **The navbar:** it owns the logo, the layout and the mobile menu.
- **Your components:** buttons, language switcher, toggle icons. The navbar contains none of these.
- **A contract between them:** a role attribute on each child, plus standard events and promises.

The navbar's own markup lives in a shadow root, so page CSS can't break it. Your components stay as normal children of `<nav-bar>` in the page, and the navbar projects them into its slots. It never moves them.

## 2. Files and setup

Four files in one folder, which must be served over HTTP:

| File | Role |
|---|---|
| `navbar.js` | Behaviour. The only file you include. |
| `navbar.html` | Markup placed inside the shadow root. |
| `navbar.css` | All the shadow root's styles. |
| `navbar-logo.svg` | The logo, inlined into the bar. |

jQuery (3 or later) must load first. Without it, `navbar.js` throws and registers nothing.

```html
<script src="/path/jquery.min.js"></script>
<script src="/path/navbar/navbar.js"></script>

<nav-bar>
  <my-open-icon  navbar-role="toggle-open"></my-open-icon>
  <my-close-icon navbar-role="toggle-close"></my-close-icon>
  <my-menu-link label="Docs"></my-menu-link>
  <my-language-switcher navbar-role="utility"></my-language-switcher>
  <my-portal-login      navbar-role="utility"></my-portal-login>
</nav-bar>
```

- **The tag name:** it's `<nav-bar>` because custom element names need a hyphen. Add `data-tag="x-y"` to the `navbar.js` script tag to rename it.
- **Cache busting:** `navbar.js?v=2` copies the version onto every file the navbar fetches.
- **Page offset:** the bar is `position: fixed`. Use `body { padding-top: var(--navbar-height); }`, since the component sets `--navbar-height` (top bar height) on `:root`.
- **Custom logo path:** edit the `svg: sibling('navbar-logo.svg')` line in `loadNavbarBundle()` in `navbar.js`.

## 3. Roles: where each child goes

Every child of `<nav-bar>` is placed by its `navbar-role` attribute.

| Role | Desktop | Mobile |
|---|---|---|
| `menu` (default) | bottom row | menu list, stacked vertically |
| `utility` | top row (language, portal login) | footer of the menu, at the bottom |
| `toggle-open` | hidden | top bar, right side, shown while closed |
| `toggle-close` | hidden | same spot, shown while open |

- There is no desktop underbar. On mobile, the top bar holds only the logo (left) and the toggle (right).
- Set `navbar-role` in the HTML. A component can also set it on itself in `connectedCallback`. The navbar reacts to later role changes, and to `hidden`, which removes a child.
- Use one component per toggle role. The console warns once if either toggle is missing on mobile. There is no built-in fallback.
- The breakpoint is 768px by default. Set the `breakpoint` attribute on `<nav-bar>` to match your SCSS.

The navbar writes two attributes on every child, which you can use in your component's own CSS:

- `navbar-placement`: `desktop-top`, `desktop-bottom`, `toggle-open`, `toggle-close`, `mobile-underbar`, `mobile-underbar-footer` or `hidden`.
- `navbar-layout`: `desktop` or `mobile`.

## 4. Writing a menu or utility component

A normal custom element. The one rule is to send events through `NavbarComponent.emit`, because that makes them cross the shadow DOM. Load your component scripts after `navbar.js`.

```js
(function ($) {
  class MyLink extends HTMLElement {
    constructor() { super(); this.attachShadow({ mode: 'open' }); }
    connectedCallback() {
      var self = this;
      $(this.shadowRoot).append($.parseHTML(
        '<style>:host([navbar-placement^="mobile"]) a { display:block; padding:1rem }</style><a></a>'));
      $(this.shadowRoot).find('a')
        .text(this.getAttribute('label'))
        .on('click', function () {
          NavbarComponent.emit(self, 'navbar-action', { id: self.id });
        });
    }
  }
  customElements.define('my-link', MyLink);
})(window.jQuery);
```

`navbar-action` closes an open mobile menu. To prevent that, pass `{ keepOpen: true }` or set `close-on-action="false"` on `<nav-bar>`.

## 5. Writing the toggles

The toggles are your components. On click they ask the navbar to open or close, and the request returns a Promise:

```js
NavbarComponent.request(this, 'open')            // in the toggle-open component
  .then(function (r) { /* { expanded, changed, cancelled, reason } */ })
  .catch(function (err) { console.error(err); });

NavbarComponent.request(this, 'close');          // in the toggle-close component
```

- The navbar shows only one toggle at a time, and its CSS does the swap.
- To have focus move to the other toggle when one is pressed, make both toggles focusable. Use `attachShadow({ mode: 'open', delegatesFocus: true })` or a `tabindex`.
- If no navbar answered the request, the Promise resolves with `null`.

## 6. Events

All events are native `CustomEvent`s with `bubbles` and `composed`, so they work with `addEventListener` and with jQuery. In jQuery the payload is `e.detail`.

**Your components send** (through `NavbarComponent.request` or `.emit`):

- `navbar-request-open`, `navbar-request-close`, `navbar-request-toggle`
- `navbar-action`

**The navbar sends:**

| Event | `detail` |
|---|---|
| `navbar-ready` | `{ layout }` |
| `navbar-opening` / `navbar-closing` | `{ reason, waitUntil }`, cancelable |
| `navbar-opened` / `navbar-closed` | `{ reason }` |
| `navbar-settled` | `{ expanded }`, sent when the animation has finished |
| `navbar-layout-changed` | `{ layout, previous }` |
| `navbar-scrolled-changed` | `{ scrolled }` |
| `navbar-language-changed` | `{ language, base, previous }` |
| `navbar-buttons-changed` | `{ layout, counts }` |
| `navbar-resize` | `{ height }` |

`reason` is `button`, `action`, `escape`, `layout`, `attribute`, `api`, or whatever string you pass to `open('x')`.

```js
$('nav-bar').on('navbar-opened', function (e) { console.log(e.detail.reason); });
```

Don't send requests with `$(el).trigger(...)`: jQuery's `trigger` doesn't create a native event for custom names.

## 7. Promises, veto and delay

```js
var nav = document.querySelector('nav-bar');

nav.whenReady().then(function () { console.log(nav.layout); });

nav.open('menu-click')
  .then(function (r) { /* { expanded, changed, cancelled, reason }, after the animation */ })
  .catch(function (err) { console.error(err); });

nav.when('opened').then(function (detail) { console.log(detail.reason); });   // next occurrence of any navbar event
```

`close()` and `toggle()` work the same way, and `open()` is ignored on desktop (`changed: false`).

`navbar-opening` and `navbar-closing` fire before anything changes, so a handler can stop them:

```js
$(nav).on('navbar-opening', function (e) { e.preventDefault(); });                   // veto now
$(nav).on('navbar-opening', function (e) { e.detail.waitUntil(checkSomething()); }); // wait; a rejected promise vetoes
```

A vetoed `open()` still resolves, with `{ cancelled: true, changed: false }`. Closing because the window became desktop can't be vetoed.

Getters: `nav.expanded`, `nav.layout`, `nav.scrolled`, `nav.language`, `nav.height`.

## 8. Host attributes

| Attribute | Meaning |
|---|---|
| `breakpoint` | px, default `768` |
| `scroll-threshold` | px scrolled before `scrolled` turns on, default `8` |
| `close-on-action="false"` | `navbar-action` no longer closes the menu |
| `expanded` | open state; setting it opens the menu (mobile only) |
| `layout`, `scrolled`, `ready` | written by the component; usable as hooks in page CSS |

## 9. Styling

Everything is in `navbar.css`. It is applied to the shadow root as a constructable stylesheet, falling back to a `<style>` tag in older browsers. Keep the rules marked `[REQUIRED]`, because the layout depends on them.

**Hooks** on `.navbar-container`:

- `data-layout`: `desktop` or `mobile`
- `data-expanded`: `true` or `false`
- `data-scrolled`: `true` or `false`
- `data-lang` and `data-lang-base`: for example `ja-JP` and `ja`. These follow the closest `lang` attribute, else `<html lang>`, and update when it changes.

They combine: `.navbar-container[data-lang-base="ja"][data-layout="mobile"][data-expanded="true"] { … }`.

**From the page:**

- Attributes: `nav-bar[layout]`, `nav-bar[expanded]`, `nav-bar[scrolled]`, `nav-bar[ready]`.
- `::part(...)`: `container`, `topbar`, `content`, `logo`, `separator`, `desktop-actions`, `desktop-top`, `desktop-bottom`, `toggle`, `toggle-open`, `toggle-close`, `underbar`, `underbar-content`, `underbar-main`, `underbar-footer`.
- Variables: `--navbar-background`, `--navbar-foreground`, `--navbar-font-family`, `--navbar-z-index`, `--navbar-max-width`, `--navbar-duration`, and `--navbar-logo-1` to `-7` (all except `-3`).

**Limits of the stylesheet approach:**

- `@import` isn't allowed in `navbar.css`.
- Relative `url(...)` values resolve against the page, not the CSS file.
- `@font-face` inside the shadow root doesn't work, so declare fonts in the page's CSS.
- The CSS must be same-origin, or served with CORS headers.

## 10. Gotchas

- **jQuery on shadow roots:** don't call `.empty()` or `.html()` directly on a shadow root. They do nothing there, so content piles up. Build once, then use `.find()` inside it.
- **Nothing shows and there's no error:** check the Network tab for `navbar.html` and `navbar.css`. A failure there keeps the bar hidden and logs an error. A missing logo only logs a warning.
- **Events don't arrive:** they need `composed: true`. `NavbarComponent.emit` and `.request` set it for you.
- **A child sits in the wrong place:** check its `navbar-role` spelling and that it's a direct child of `<nav-bar>`.
- **Verification:** the JavaScript was tested in jsdom with jQuery 3.7.1 and 4.0.0. jsdom doesn't apply the CSS, so the visual behaviour (icon swap, full-screen expansion, animation) has not been checked in a real browser.