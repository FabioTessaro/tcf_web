# Developing with `<language-switcher>`

## 1. What you get

`<language-switcher>` is the language picker of the navbar, built as a web component with Shadow DOM and jQuery. On desktop it is a translate icon with a dropdown on hover. On mobile it is an icon that opens a full-screen popup with a dimmed, blurred background and a card from the bottom.

The languages are passed in as `<option>` children, and the component checks that there is exactly one option for every language `localization.js` supports. `localization.js` is a hard dependency: it owns the language, and this component only asks it to switch.

## 2. Files and setup

One folder, which must be served over HTTP. Only `language-switcher.js` is included in pages:

| File | Role |
|---|---|
| `language-switcher.js` | Behaviour. The only file you include. |
| `language-switcher.html` | Markup placed inside the shadow root, plus one `<template>` row per variant. |
| `language-switcher.scss` / `language-switcher.css` | Styles of the shadow root. You compile the scss. |

jQuery (3 or later), `localization.js` (with i18next and jquery-i18next before it) and `component-base.js` must load first. Without any of them, `language-switcher.js` throws a message that says what to load, and registers nothing.

```html
<script src="/path/jquery.min.js"></script>
<script src="/path/i18next.min.js"></script>
<script src="/path/jquery-i18next.min.js"></script>
<script src="/path/localization/localization.js"></script>
<script src="/path/component-base/component-base.js"></script>
<script src="/path/navbar/navbar.js"></script>
<script src="/path/language-switcher/language-switcher.js"></script>

<nav-bar>
  <language-switcher navbar-role="utility">
    <option value="en-GB">English</option>
    <option value="de-DE">Deutsch</option>
    <option value="it-IT">Italiano</option>
    <option value="zh-CN">中文</option>
    <option value="ja-JP">日本語</option>
  </language-switcher>
</nav-bar>
```

- **`navbar-role="utility"` goes on the tag.** The navbar uses it to put the switcher in the top row on desktop and in the footer of the menu on mobile.
- **The tag name:** `<language-switcher>`. Add `data-tag="x-y"` to the script tag to rename it.
- **Cache busting:** `language-switcher.js?v=2` copies the version onto the html and css it fetches.
- **Hide it until it is defined.** Add `language-switcher:not(:defined) { display: none; }` to your page CSS, so the options never flash as plain text if the script is slow.

## 3. The options

Each `<option>` is one language: `value` is the language code, and the text is the name of the language in that language. The order of the children is the order of the list.

**The rule: exactly one option for every code in `$.localization.supported`, and no others.** The component compares codes ignoring letter case (`de-de` is accepted and shown as `de-DE`). `en-US` does not count as `en-GB`, because the codes must be exact.

It checks when it is built, and again whenever the children change (added, removed, relabelled, a different `value`). Problems it reports:

| Problem | Why it matters |
|---|---|
| Missing language | That language cannot be picked from the page. |
| Code not supported (or no `value`) | `setLanguage` would ignore it silently, so it would be a dead entry. |
| Code listed more than once | The first one is used. |
| Empty label | A row with no text cannot be shown. |

**When the check fails:**

- A clear message goes to the console, once per distinct problem. For example: `[language-switcher] The <option> children do not match $.localization.supported (en-GB, de-DE, ...). Missing: it-IT. It needs exactly one <option value="code">Label</option> for each supported language.`
- The tag gets an empty `invalid` attribute. You can style it, or a test can look for `language-switcher[invalid]`. It is removed as soon as the options are right.
- Only the valid options are shown, so users still get a working switcher.

**Adding a language** still touches the places in the `localization.js` guide (`CONFIG.supported`, a block in every `.i18n.js`, the typography `$languages` map), plus one `<option>` here. Forgetting the `<option>` is no longer silent: it gives an `invalid` switcher and a console error.

Each label keeps its own `lang` attribute, so every name is typeset in its own script, and `translate="no"` keeps browser translators away from it.

## 4. How it behaves

- **Picking a language** calls `$.localization.setLanguage(code)`. `localization.js` then updates `<html lang>`, translates the page and triggers `app:languagechange` on `document`.
- **On mobile**, picking a language also closes the popup. Tapping the icon opens it, and a click on the dimmed background closes it. A click on the card itself does not.
- **The desktop dropdown** is pure CSS: it opens on hover, with no JavaScript.
- **Events:** none. `app:languagechange` already tells the page about every switch.
- **Reading the options:** if the page is still being parsed when the component connects, it waits, so it never reports "missing" for options that have not been read yet.

## 5. Styling

`language-switcher.scss` keeps all the original rules and the `$mobile-popup-*` tweakables, unchanged. It adds three things at the top:

- `@include icons.material-symbols;` repeats the icon class rule inside the shadow root (see `typography/material-symbols.md`).
- `:host { display: contents; }` so the component takes no box of its own.
- `:host([hidden]) { display: none; }` so the `hidden` attribute still works.

- **The `navbar-toggle-icon` class** is still on both icons. The slanted indicator mixin uses it as a selector (`span.navbar-toggle-icon`). It has nothing to do with the `<navbar-toggle>` component.
- **The rows** are cloned from the two `<template>` elements in `language-switcher.html`, so their markup stays in the html file and has the classes the scss styles.
- **Card height:** `slantedcard.card($height-estimate: 8rem, ...)` is a number fixed at compile time. If the number of supported languages changes, check that the dropdown card still fits.

## 6. Replacing the old switcher

The old version was one template with five hard-coded rows per variant, and a script with four handlers on the whole `document`. Now:

- Remove the old include and script. Add `<language-switcher navbar-role="utility">` with its options, as in section 2.
- The handlers move into the component, so nothing is delegated from `document`, and each instance has its own popup.
- Recompile `language-switcher.scss` and replace the old css.

## 7. Gotchas

- **The check runs in the browser.** If the script does not load, nothing is checked.
- **Only direct `<option>` children count.** Options nested in another element are ignored.
- **`navbar-role="utility"` must be on the tag.** Without it the navbar treats the switcher as a menu item.
- **Do not style the host's box.** With `display: contents`, width, margin or padding on `<language-switcher>` have no effect.
- **There is no keyboard access or ARIA yet.** The dropdown opens on hover only, and the rows are not focusable. This is planned for all the components together.
- **The current language is not highlighted.** It was not before either. The rows are rendered from data now, so it would be a small addition.
- **jQuery cannot bind events on the `ShadowRoot`.** The component binds on the container inside it (see `component-base.md`).