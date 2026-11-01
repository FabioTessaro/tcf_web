# `<primary-button>` guide

## 1. What you get

A slanted action button as a web component (Shadow DOM, jQuery, built on `component-base.js`).

- Three states: **active**, **disabled** and an optional **loading**.
- Works inside forms (`type="submit"` / `"reset"`) and with jQuery or `addEventListener` click handlers.
- Desktop: a highlight sweeps across the button on hover (`slanted-highlight`). Touch: a ripple grows from the finger (`slanted-ripple`, new, documented in the Slanted Elements Guide section 8).
- Optional Material Symbols icon on the left or right, with its own loading icon.
- Label, icon and button width all animate when the state changes.
- Grows, shrinks or stays fixed inside flex layouts.

## 2. Files and setup

| File | Role |
|---|---|
| `primary-button.js` | Behaviour. The only file included in pages. |
| `primary-button.html` | Markup placed in the shadow root. |
| `primary-button.scss` / `.css` | Styles. You compile the scss. |

There is no `.i18n.js`: the label keys belong to the page (or to whichever component's namespace they name).

```html
<script src="/path/jquery.min.js"></script>
<script src="/path/component-base/component-base.js"></script>
<script src="/path/primary-button/primary-button.js"></script>
```

The scss expects these partials (paths relative to `primary-button/`):

| Import | Used for |
|---|---|
| `../palette/palette` | Colours (`$light-*`, `$dark-*`) |
| `../typography/typography` | `type.typeface()` |
| `../typography/material-symbols` | Icon font rule inside the shadow root |
| `../layout/flex` | `layout.flex-container`, `flex-item`, `flex-mobile` |
| `../visual-elements/elements-defaults` | `$brand-slant` |
| `../visual-elements/slanted-highlight` | Hover highlight |
| `../visual-elements/slanted-ripple` | Touch ripple (new file) |

If your flex partial lives elsewhere (the flex guide shows `config/flex`), change the one `@use "../layout/flex" as layout;` line.

### Typefaces to add

The component uses `interactive-element-1` (desktop) and `interactive-element-1-mobile` (width below the flex desktop breakpoint). Add them to the three typeface files. The values are a starting point: a bit heavier than the navigation typefaces, because this is the primary action.

```scss
// typefaces/_latin.scss, inside $typefaces
interactive-element-1:        (weight: 500, size: 0.875rem,  line-height: 1.2, letter-spacing: 0.12em, text-transform: uppercase),
interactive-element-1-mobile: (weight: 500, size: 0.9375rem, line-height: 1.2, letter-spacing: 0.1em,  text-transform: uppercase),

// typefaces/_chinese.scss
interactive-element-1:        (stack: defaults.$stack-chinese, style: normal, weight: 500, size: 0.9375rem, line-height: 1.2, letter-spacing: 0.08em, text-transform: none),
interactive-element-1-mobile: (stack: defaults.$stack-chinese, style: normal, weight: 500, size: 1rem,      line-height: 1.2, letter-spacing: 0.06em, text-transform: none),

// typefaces/_japanese.scss
interactive-element-1:        (stack: defaults.$stack-japanese, style: normal, weight: 500, size: 0.9375rem, line-height: 1.2, letter-spacing: 0.08em, text-transform: none),
interactive-element-1-mobile: (stack: defaults.$stack-japanese, style: normal, weight: 500, size: 1rem,      line-height: 1.2, letter-spacing: 0.06em, text-transform: none),
```

## 3. Using it

```html
<primary-button label="login:submit" loading-label="login:submitting"></primary-button>
```

| Attribute | Default | Meaning |
|---|---|---|
| `label` | none | i18n key, `data-i18n` syntax (`namespace:key`). Until translated, the key itself is shown. |
| `loading-label` | none | i18n key for the loading state. **Without it the loading state cannot be turned on.** |
| `icon` | none | Material Symbols name. |
| `icon-position` | `left` | `left` or `right`. |
| `icon-loading` | none | Icon shown while loading. Without it, `icon` stays. |
| `disabled` | off | Boolean. |
| `loading` | off | Boolean. Ignored (with one console warning) when there is no `loading-label`. |
| `type` | `button` | `button`, `submit` or `reset`. |
| `name`, `value`, `form`, `formnovalidate` | none | Like a native `<button>`. |
| `width` | none | Fixed width: any CSS length, a bare number means px. |
| `grow` | off | Boolean. Takes the free space in a flex container. |

```html
<primary-button label="nav:next" icon="arrow_forward" icon-position="right"
                loading-label="nav:loading" icon-loading="progress_activity"></primary-button>
```

`progress_activity` spins while loading (`$loading-icon-spin` in the scss; set it to `false` for an icon that should not turn).

### States

| State | How | Look |
|---|---|---|
| active | default | Fill, hover highlight, press feedback |
| disabled | `disabled` | Grey surface, faded content, not clickable |
| loading | `loading`, or class `htmx-request` on the element | Dimmer fill, `loading-label`, `icon-loading`, not clickable, keeps focus |

Precedence: **loading** (when a `loading-label` exists) beats **disabled** beats **active**. So `hx-disabled-elt` on the element, which sets `disabled` during a request, still shows the loading look.

Starting and stopping loading:

```js
var btn = document.querySelector("#save");

btn.startLoading();                       // returns false when there is no loading-label
fetch("/save").then(function () {
	btn.stopLoading();
}).catch(function () {
	btn.stopLoading();
});

btn.loading = true;                       // same as startLoading()
btn.disabled = true;
console.log(btn.state);                   // "active" | "disabled" | "loading"
```

With htmx, point the indicator at the button and the class does the rest:

```html
<form hx-post="/login" hx-indicator="#login-button">
	<primary-button id="login-button" type="submit" label="login:submit" loading-label="login:submitting"></primary-button>
</form>
```

Nothing turns loading on by itself when the button is pressed. That is deliberate: a validation error would leave it spinning forever.

### Click events

It is a normal element for events. A click is a real, composed `click` event on `<primary-button>`, so all of these work:

```js
$("#save").on("click", function (e) { /* ... */ });
$(document).on("click", "primary-button.save", function () { /* delegated */ });
document.querySelector("#save").addEventListener("click", function () { /* ... */ });
```

No click is delivered while the button is disabled or loading. `btn.click()` goes through the same guard.

It also fires `primary-button:state-change` (`e.detail.state`, `e.detail.previous`).

### Forms

```html
<form id="login">
	<input name="user"> <input name="password" type="password">
	<primary-button type="submit" name="action" value="login" label="login:submit" loading-label="login:submitting"></primary-button>
</form>
```

A button inside a shadow root is not part of a form. So with `type="submit"` or `"reset"` the component adds one hidden native `<button>` to its light DOM and clicks it for you. Result:

- validation, the `submit` event, `event.submitter` (`name`/`value`), htmx and `preventDefault()` in a click handler behave exactly as with a native button;
- **Enter in a text field submits the form** (implicit submission, which a custom element alone cannot do);
- while loading or disabled, the hidden button is disabled, so Enter cannot submit either;
- `form="other-form-id"` and `formnovalidate` work.

The hidden button is a child of `<primary-button>`; leave it alone. A `type="button"` component has no hidden button.

### Flex layouts

The host is `inline-flex`, `min-width: 0`, `max-width: 100%`, flex `0 1 auto`. The host box is exactly the slanted body, so nothing sticks out and a fixed width means what it says.

```html
<primary-button grow label="..."></primary-button>          <!-- takes free space -->
<primary-button width="12rem" label="..."></primary-button>  <!-- fixed, does not shrink -->
```

Page CSS on the tag wins over both attributes, so the layout toolkit works on it directly:

```scss
primary-button.wide { @include layout.flex-fill; }
primary-button.cta  { width: 100%; }
```

When squeezed below its content, the label ends in an ellipsis. Defaults for grow/shrink/basis are in the scss variables.

## 4. Styling: the variables at the top of `primary-button.scss`

| Group | Variables |
|---|---|
| Typefaces | `$typeface-desktop`, `$typeface-mobile` |
| Shape | `$slant`, `$height`, `$padding-inline`, `$pressed-scale` |
| Icon | `$icon-style` (sharp, outlined, rounded: also change the class in the html), `$icon-size`, `$icon-gap`, `$loading-icon-spin`, `$loading-icon-spin-duration` |
| Colours | `$light-fill`, `-hover`, `-pressed`, `-loading`, `-disabled`, `$light-label`, `$light-label-disabled`, `$light-focus-ring`, and the same set with `$dark-` |
| Focus ring | `$focus-ring-width`, `$focus-ring-offset` |
| State motion | `$color-duration`, `$press-duration`, `$label-duration`, `$label-easing`, `$label-shift`, `$width-duration`, `$icon-duration`, `$icon-easing` |
| Highlight | `$highlight-duration`, `-easing`, `-intensity`, `-half-width` |
| Ripple | `$ripple-duration`, `-intensity`, `-spread` |
| Flex defaults | `$default-flex-grow`, `-shrink`, `-basis` |

Light/dark follows `prefers-color-scheme`. The colours are custom properties on `:host` (`--primary-button-fill` and friends), so a page can also override them on the tag without recompiling.

### How the slant is built

The body is the box of the button skewed by the brand angle. A skewed box pokes out at two corners by `tan(slant) × height / 2`, so the component reserves that much on both sides (`$overhang`). Raise `$height` or the angle and the reserve follows.

Layers, from the back: body fill (`-3`), hover highlight on `::after` (`-2`), press ripple on `::before` (`-1`), then the content. The focus ring is an outline on the body, so it leans with it.

## 5. Which effect plays when

| Input | Effect |
|---|---|
| Mouse hover | Highlight sweep (only where the device can hover) |
| Keyboard focus (`:focus-visible`) | Highlight sweep + slanted focus ring |
| Touch or pen press | Ripple from the touch point |
| Mouse or keyboard press | Press scale and the pressed fill |

Ripple versus highlight follows the input device (pointer type), not the screen width. The mobile typeface follows the width (the flex desktop breakpoint).

## 6. How the animation works

- **Icon:** a fixed-size slot. It appears or disappears by animating width and margin, and the two glyphs (`icon`, `icon-loading`) cross-fade, scale and turn.
- **Label:** two layers. The active one is in the flow. The old one slides up and fades, the new one comes from below. Reverse when loading ends.
- **Width:** a label change makes the button wider or narrower. CSS cannot animate `auto`, so the JS measures the wrapper before and after, animates between the two pixel widths, then releases it to `auto` again. If the width is the same, nothing runs.
- Nothing animates before the first paint. With `prefers-reduced-motion: reduce` all transitions are off and the ripple becomes a short fade.

## 7. Gotchas

- **Compile the scss.** The component loads `primary-button.css`; the bundle is cached per page load, so use a new `?v=` on the script tag after a change.
- **Label is a key.** With no translation (no `$.localization`, or an unregistered namespace) the key itself is displayed.
- **Keys with several words** in `label` are fine. Dynamic text should be translated before it is set.
- **`overflow: hidden` on an ancestor** is harmless: the host box already contains the whole body. The focus ring (offset 0.22rem) can still be cut.
- **Icons show as words** if the page does not load the Material Symbols font for the style in `$icon-style`.
- **Fieldsets:** `<fieldset disabled>` blocks form submission through the hidden button, but the component does not turn grey. Use the `disabled` attribute on the button.
- **jQuery `.trigger("click")`** runs jQuery-bound handlers directly, so they run even while disabled. `btn.click()` and real clicks are guarded.
- **Ripple origin** is approximate by at most about 0.24rem because the layer is skewed (see the Slanted Elements Guide).