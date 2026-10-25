# Developing with `<navbar-toggle>`

## 1. What you get

`<navbar-toggle>` is the open / close icon of the navbar, built as a web component with Shadow DOM and jQuery. One element is one toggle: it shows an icon, and pressing it asks the navbar to open, close or toggle.

It is built on `component-base.js` and talks to the navbar only through standard events, so it has no dependency on `navbar.js`. Outside a navbar nobody answers the request and nothing happens.

## 2. Files and setup

One folder, which must be served over HTTP. Only `navbar-toggle.js` is included in pages:

| File | Role |
|---|---|
| `navbar-toggle.js` | Behaviour. The only file you include. |
| `navbar-toggle.html` | Markup placed inside the shadow root. |
| `navbar-toggle.scss` / `navbar-toggle.css` | Styles of the shadow root. You compile the scss. |

jQuery (3 or later) must load first, then `component-base.js`. Without them, `navbar-toggle.js` throws and registers nothing.

```html
<script src="/path/jquery.min.js"></script>
<script src="/path/component-base/component-base.js"></script>
<script src="/path/navbar/navbar.js"></script>
<script src="/path/navbar-toggle/navbar-toggle.js"></script>

<nav-bar>
  <navbar-toggle navbar-role="toggle-open"></navbar-toggle>
  <navbar-toggle navbar-role="toggle-close"></navbar-toggle>
  <!-- menu buttons, language switcher, ... -->
</nav-bar>
```

- **The tag name:** `<navbar-toggle>`. Add `data-tag="x-y"` to the script tag to rename it.
- **Cache busting:** `navbar-toggle.js?v=2` copies the version onto the html and css it fetches.
- **Icon font:** the page must load the Material Symbols Sharp font. The icon class rule is carried by the component itself (see section 5).

## 3. How it behaves

The toggle's `navbar-role` attribute decides what it is. Set it on the tag, in the HTML.

| `navbar-role` | Icon | A press asks the navbar to |
|---|---|---|
| `toggle-open` | `menu` | open |
| `toggle-close` | `close` | close |
| anything else, or none | `menu` | toggle |

- **The navbar places it.** The navbar reads `navbar-role` to put the toggle in its slot, and shows only one of the two at a time. This component only has to carry the attribute.
- **Changing the icon:** `icon="apps"` replaces the icon with any Material Symbols name. Removing the attribute goes back to the role's icon. Both attributes can change at any time.
- **A press** is a click, or Enter or Space while the icon has keyboard focus. Holding a key down does not repeat the press, and Space does not scroll the page.
- **Keyboard focus:** the icon is reachable with Tab. When one toggle is pressed and the other takes its place, the navbar moves focus to the other toggle, so keyboard users never lose their place.
- **No navbar around:** the request is sent and nothing answers. Nothing breaks.

## 4. Events

The toggle dispatches one event per press, from its own tag:

| Event | When |
|---|---|
| `navbar-request-open` | `toggle-open` pressed |
| `navbar-request-close` | `toggle-close` pressed |
| `navbar-request-toggle` | any other role pressed |

They bubble and are `composed`, so a navbar further up the page hears them. The navbar answers by putting a Promise on `event.detail.result`, which resolves with `{ expanded, changed, cancelled, reason }`. The toggle ignores the answer, because the navbar's own events tell everyone what happened.

## 5. Styling

`navbar-toggle.scss` keeps all the original rules (a 3rem icon, weight 200, palette colours, pointer cursor, no tap highlight). It adds three things at the top:

- `@include icons.material-symbols;` repeats the icon class rule inside the shadow root. Page CSS does not reach it. See `typography/material-symbols.md`.
- `:host { display: contents; }` so the component takes no box of its own, and the icon sits in the navbar's slot wrapper exactly as before.
- `:host([hidden]) { display: none; }` so the `hidden` attribute still works.

- **Size and colour** are edited in the scss, in the `.navbar-toggle-icon` rule, then recompiled.
- **Open and close animation** (fade, rotate, scale) belongs to the navbar. It animates the wrappers around the toggles, not the toggles.
- **Keyboard focus ring:** keyboard users see the browser's default outline on the icon. Mouse and touch users see nothing new.

## 6. Replacing the old toggles

The old version was one template with two `div`s, plus a script that listened for clicks on the whole `document`. Now:

- Remove the old include and the old script. Add the two `<navbar-toggle>` tags instead, one per role, as in section 2.
- The click handling moves into the component, bound on its own icon, so nothing is delegated from `document` any more.
- Recompile `navbar-toggle.scss`. The old css is replaced by the new compiled one.

## 7. Gotchas

- **One element per toggle.** There is no element that contains both. Use two tags, one for each role.
- **Do not style the host's box.** With `display: contents`, width, margin or padding on `<navbar-toggle>` have no effect. Style the icon in the scss.
- **The navbar controls visibility.** It hides the inactive toggle with `inert` and opacity on its wrappers. The toggle never hides itself.
- **There is no ARIA yet.** The icon has no `role="button"` or `aria-label`, so screen readers do not announce it as a button. This is planned for all the components together.
- **jQuery ignores shadow roots as event targets.** Events are bound on the icon container inside the shadow root, not on the `ShadowRoot` itself.
- **Focus handoff is browser-tested only.** The navbar calls `.focus()` on the other toggle's tag, and `delegatesFocus` forwards it to the icon. That forwarding does not exist in jsdom, so check Tab, Enter and the handoff once in a real browser.