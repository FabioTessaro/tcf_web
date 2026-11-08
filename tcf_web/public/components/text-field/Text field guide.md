# Developing with `<text-field>`

## 1. What you get

`<text-field>` is a labelled, underlined text field for forms such as login, password change and search. The page supplies only a label, an input and (for password fields) a forgot-password button. Everything else lives inside the component:

- **Label on top**, slotted from the page, linked to the input (clicking it focuses the field).
- **Underline** under the input and the icon button, with a highlight that wipes in while the field is focused.
- **Show/hide password** icon button (Material Symbols Sharp `visibility` / `visibility_off`), only for `type="password"`.
- **Error state** that can be set from outside, with an animated message chosen by an i18n key.
- **Forgot-password button** slot at the bottom right, wrapping below the error message on narrow screens.
- **Light and dark** colours from the palette, following `prefers-color-scheme`.
- **Desktop and mobile typefaces** for Latin, Chinese and Japanese.

The real `<input>` stays in the page's light DOM, so browser autofill, password managers and form submission keep working.

## 2. Files and setup

| File | Role |
|---|---|
| `text-field.js` | Behaviour: attributes, API, events, state. Only this file is included in pages. |
| `text-field.html` | Shadow DOM markup. |
| `text-field.scss` / `.css` | Shadow DOM styles (you compile the scss). |
| `text-field.i18n.js` | The component's own strings: labels, placeholders, error messages. |
| `login-field-typefaces.scss` | The four new typefaces, to paste into `_latin.scss`, `_chinese.scss` and `_japanese.scss`. Not part of the component folder. |

The scss `@use`s the `palette`, `typography`, `material-symbols`, `layout` and `visual-elements/slanted-pill` partials. The page must load the Material Symbols Sharp font, jQuery, `$.localization` and `component-base.js` before the component:

```html
<script src="/path/jquery.min.js"></script>
<script src="/path/component-base/component-base.js"></script>
<script src="/path/text-field/text-field.js"></script>
```

## 3. Using it in a page

```html
<text-field type="email">
    <label data-i18n="text-field:email.label"></label>
    <input name="usr" autocomplete="username" data-i18n="[placeholder]text-field:email.placeholder">
</text-field>

<text-field type="password">
    <label data-i18n="text-field:password.label"></label>
    <input name="pwd" autocomplete="current-password" data-i18n="[placeholder]text-field:password.placeholder">
    <button type="button" data-i18n="login-form:forgotPassword"></button>
</text-field>
```

What the component does with the children:

- A `<label>` without a `slot` gets `slot="label"`.
- An `<input>` goes in the default slot. The component sets its `type` from the host's `type` attribute, so the page never writes it. It also adds `autocapitalize="off"`, `autocorrect="off"` and `spellcheck="false"` when the page did not set them, and gives the input an id if the label needs one.
- Any other child element gets `slot="button"`. It only shows when the field is `type="password"`. For other types it is hidden.

The label and the button are normal page elements, so the page translates them with `data-i18n`. Their keys live in the component's `.i18n.js` (label, placeholder) or in the page's own namespace (the button).

## 4. API reference

### Attributes

All three can also be set as properties of the same name.

| Attribute | Values | Effect |
|---|---|---|
| `type` | `password`, or anything an input accepts (`email`, `text`, `tel`, ...) | `password` adds the icon button and enables the button slot. Any other value is copied to the input's `type`. Without it, the input keeps the type the page gave it. |
| `status` | `error`, or absent | `error` turns on the error state. Anything else is the normal state. |
| `error` | an i18n key | The message shown while `status` is `error`. Without a key the field still turns red, with no message. |

### Error keys

A key without a namespace is looked up in this component's strings: `errors.invalidEmail` means `text-field:errors.invalidEmail`. A key with a `:` is used as it is, so another component's strings work too: `login-form:errors.serverDown`.

Keys that exist today: `errors.invalidCredentials`, `errors.invalidEmail`, `errors.required`.

### Methods and properties

| Call | Does |
|---|---|
| `setError(key)` | Sets the key (if given) and the error state. Returns the element. If the field is already in error, it swaps the message and replays the shake. |
| `clearError()` | Removes `status` and `error`. The text stays in the DOM while it fades out. |
| `focus(options)` | Focuses the input. |
| `status` | `"error"` or `"default"`. Setting `"error"` turns the state on, anything else turns it off. |
| `error` | The current key. Setting `null` or `""` removes it. |
| `revealed` | Whether the password is shown. Settable, and ignored unless the type is `password`. |
| `value` | The input's value (read and write). |
| `input` | The slotted `<input>` (read only). |

### Events

They bubble and are composed, so they work with `addEventListener` and jQuery. Names keep the tag prefix.

| Event | Detail | When |
|---|---|---|
| `text-field:statuschange` | `{ status: "error" \| "default", error }` | Every change of the state, but not the first render. |
| `text-field:visibilitychange` | `{ revealed }` | The password was shown or hidden. |

### Built-in behaviour

- Typing in the input, or an autofill (`input` and `change` events), clears the error by itself.
- The error shake plays each time the state turns on, and each time `setError` is called while the field is already in error.
- The highlight is on while the input or the icon button has focus. The forgot-password button does not count.

## 5. Recipes

### A login form that uses the fields

```js
var $user = $("text-field[type=email]");
var $pass = $("text-field[type=password]");

function showFieldError(field, key) {
    field.setError(key);
    field.focus();
}

$("#login-continue").on("click", function () {
    var user = $user[0];
    var pass = $pass[0];

    if (!user.value.trim()) {
        showFieldError(user, "errors.required");
        return;
    }
    if (!pass.value) {
        showFieldError(pass, "errors.required");
        return;
    }

    $.api.auth.login(user.value.trim(), pass.value)
        .then(function () {
            $.navigation.navigateTo("/portal");
        })
        .catch(function (err) {
            if (err && err.status === 401) {
                showFieldError(pass, "errors.invalidCredentials");
            } else {
                $.errorDialog.show(err.message);
            }
        });
});
```

(`$.api.auth.login` and `$.errorDialog` stand for your own framework calls. Use the real names.)

### Listening for changes

```js
$("text-field").on("text-field:statuschange", function (e) {
    var detail = ComponentBase.detailOf(e);
    console.log(detail.status, detail.error);
});
```

### Setting the error from markup

The state is attribute-driven, so a server-rendered error works too:

```html
<text-field type="password" status="error" error="errors.invalidCredentials">
    ...
</text-field>
```

### Showing an error that belongs to both fields

```js
$("text-field").each(function () { this.setError(); });          // red, no text
$("text-field[type=password]")[0].setError("errors.invalidCredentials"); // text on one of them
```

## 6. Structure, for styling and extending

The shadow root has one top element, `.text-field-container`. The component only toggles classes on it, and the scss reads them:

| Class | On | Meaning |
|---|---|---|
| `is-password` | container | The type is `password`: icon button and button slot are allowed. |
| `is-revealed` | container | The password is shown. Cross-fades the two icons. |
| `is-active` | container | The input or the icon button has focus. |
| `is-error` | container | Error state. Opens the message row and turns the line red. |
| `has-button` | container | The page supplied a forgot-password button. |
| `is-shaking` | `.input` | The shake animation is running. Removed on `animationend`. |

Markup:

```
.text-field-container
  .label          <slot name="label">
  .input          <slot>  (the input)  + .action > .toggle > .icon-show, .icon-hide
                  ::before = resting underline, ::after = highlight
  .footer
    .error > .error-clip > .error-text
    .extra        <slot name="button">
```

### Where to change what

| Want to change | Edit |
|---|---|
| Typefaces used | The five `$...-typeface` variables at the top of the scss. |
| Sizes (row height, line widths, icon size, offsets) | The size variables at the top of the scss. |
| Speed and easing | `$duration`, `$duration-fast`, `$easing`, `$shake-duration`. |
| Shake strength | `$shake-distance`. |
| Colours | `theme-light` and `theme-dark` mixins. They set `--ltf-*` custom properties on the container. |
| Highlight colour | `--ltf-line-active` (and `--ltf-caret` for the cursor). |
| Texts | `text-field.i18n.js`. |
| Sizes and weights of the label and input text | `login-field-typefaces.scss` entries (per script). |
| Tap pill on the icon button | The `slantedpill.pill` include inside `.toggle`. It is wrapped in `layout.flex-mobile`, so it only exists on mobile. Desktop feedback is the icon colour change on hover and focus. |
| Icon style or glyphs | The two `<span>` icons in the `.html`. The ligature names are the same in every style (see the material-symbols guide). |

The custom properties are `--ltf-text`, `--ltf-label`, `--ltf-label-active`, `--ltf-placeholder`, `--ltf-line`, `--ltf-line-hover`, `--ltf-line-active`, `--ltf-caret`, `--ltf-icon`, `--ltf-icon-active`, `--ltf-error` and `--ltf-error-text`. They are set on the container inside the shadow root, so a page cannot override them from outside. Change them in the two theme mixins and recompile.

## 7. Extending it

### A new error message

1. Add the key to every language in `text-field.i18n.js`, under `errors`.
2. Call `field.setError("errors.yourKey")`.

No scss or js change.

### A new field type

Any value the input understands already works: `<text-field type="tel">` sets the input's `type` to `tel`. Only add code if the type needs more than that, for example a trailing icon. For the trailing icon, see the next recipe.

### A second trailing icon button (for example "clear")

1. In the `.html`, add the button next to `.toggle` inside `.action`.
2. In the scss, give it the same rules as `.toggle` (extract the shared block into a placeholder or mixin rather than copying it).
3. In `_activate`, add a delegated handler next to the toggle ones:

```js
$top.on("click" + ns, ".clear", function () {
    self.value = "";
    self.focus();
});
```

4. Decide when it shows. Add a class in `_render` (for example `has-value`, from `this.value.length > 0`), and call `_render` from the input's `input` handler in `_bindInput`.
5. `.action` is `display: none` unless `.is-password`. Change that rule if the new button should show for other types.

### A new state (for example `success`)

The error state is the pattern to copy:

1. Allow the value. In `_status()`, accept `"success"` too, and in `_render` toggle `is-success`.
2. Add a colour pair to `theme-light` and `theme-dark` (`--ltf-success`).
3. In the scss, repeat the `.is-error` blocks as `.is-success` (line, label colour). Leave out the message row and the shake.
4. Emit works unchanged: `_renderStatusChange` already sends `status` in the event.

### Helper text under the field

Add a second slot to the `.html` (`<slot name="hint"></slot>` inside `.footer`), route it in `_prepare` (children with a marker, for example `[data-hint]`), and style it in the scss. Decide whether it hides while the error shows. If the error and the hint share the row, set `$footer-column-gap` for the side-by-side case.

### A caps-lock warning

Listen for `keydown` and `keyup` on the input, and read `e.originalEvent.getModifierState("CapsLock")`. Bind in `_bindInput` with the instance namespace so `_unbindInput` removes it. Show the result as a class on the container and a small element in `.footer`, or reuse the error row with its own key.

### Changing the animations

- **Error entry or exit:** the `.error` grid-row transition and the `.error-text` opacity and transform rules. The entry has a small delay (`0.08s`) so the row opens before the text slides in.
- **Highlight:** `clip-path` on `.input::after`. To wipe from the centre, use `inset(0 50% 0 50%)` as the closed state.
- **Icon swap:** the `.icon-show` and `.icon-hide` transforms. Anime.js is not needed here, CSS transitions are enough. If you move it to anime.js later, keep it a soft dependency as in the other components.

## 8. Gotchas

- **Page CSS beats `::slotted`.** A global `input { ... }` or `label { ... }` rule in the page overrides the component's styling of the input and label. Keep such rules off these elements, or raise the specificity inside the scss.
- **The compiled `.css` is yours to produce.** Recompile after any scss change, and bump the `?v=` on the component's script tag, because the bundle is cached per page load.
- **`type` decides the input's type.** Do not set `type` on the input in the page. If you change the host's `type` later, the input follows and the revealed state resets for non-password types.
- **The error row keeps its text after clearing.** That is on purpose: the text fades out instead of vanishing. Do not read the text to find out whether the field is in error. Use `status`.
- **`statuschange` does not fire on first render.** A field that starts with `status="error"` in the markup does not emit it.
- **Without `$.localization`** the label and placeholder keep their default text, and the error row shows the key itself.
- **Focus events are native.** jQuery 3 does not see `focusin` inside a shadow root, so the component binds `focusin`, `focusout` and `slotchange` with `addEventListener` and removes them in `disconnectedCallback`.
- **Edge** draws its own reveal icon in password inputs. The scss hides it (`::-ms-reveal`) so only the component's icon shows.
- **Autofill:** the scss keeps the browser tint off the field with a long transition delay. The text colour is forced with `-webkit-text-fill-color`.
- **Mobile zoom:** keep `login-field-input-mobile` at `1rem` or more. iOS zooms the page when a focused input is smaller.
- **Use `.then`/`.catch`.** Promise chains, not `async`/`await`, as in the rest of the code base.
- **No aria attributes yet.** They are planned for all components together. The icon button is a real `<button>`, so keyboard use already works.