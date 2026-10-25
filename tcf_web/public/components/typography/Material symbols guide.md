# Developing with `_material-symbols.scss`

## 1. What you get

`_material-symbols.scss` is a Sass mixin that makes Google's Material Symbols icons work inside a Shadow DOM component. It supports all three styles: **sharp**, **outlined** and **rounded**.

Why it exists: an icon is a `<span class="material-symbols-sharp">menu</span>`. Two things make it an icon:

- **The font file.** Loaded once on the page by an `@font-face` rule. This works inside shadow roots.
- **The class rule.** It sets the font family, turns on ligatures and normalizes the text. It lives in page CSS, and page CSS does **not** reach inside a shadow root.

So every component that shows an icon needs its own copy of the class rule. The mixin writes it into the component's compiled CSS, so the HTML keeps the class it already has.

## 2. Files and setup

One partial, in the typography folder next to your other typography partials:

| File | Role |
|---|---|
| `_material-symbols.scss` | The mixin. |

Include it at the top of a component's scss:

```scss
@use "../typography/material-symbols" as icons;

@include icons.material-symbols;                // the default style (sharp)
@include icons.material-symbols(outlined);      // one style
@include icons.material-symbols(sharp rounded); // several styles, space-separated
@include icons.material-symbols(all);           // every style listed in $styles
```

Recompile the component after adding it. The compiled CSS then has the icon rule and the HTML needs no change.

## 3. The styles

| Style | Class in the HTML | Font family |
|---|---|---|
| `sharp` | `material-symbols-sharp` | Material Symbols Sharp |
| `outlined` | `material-symbols-outlined` | Material Symbols Outlined |
| `rounded` | `material-symbols-rounded` | Material Symbols Rounded |

The ligature names (`menu`, `close`, `translate`, ...) are the same in all three, so switching a style never means renaming icons. It only changes the class on the span.

Each style also needs its own font file on the page (the Google Fonts `<link>` or `@font-face` for that style). The mixin does not load fonts. A component can only show a style whose font the page loads.

## 4. What it outputs

For `@include icons.material-symbols(sharp rounded);`:

```css
.material-symbols-sharp, .material-symbols-rounded {
  font-variation-settings: var(--icon-font-variation-settings, inherit);
  font-weight: normal;
  font-style: normal;
  font-size: 24px;
  line-height: 1;
  letter-spacing: normal;
  text-transform: none;
  display: inline-block;
  white-space: nowrap;
  word-wrap: normal;
  direction: ltr;
  -webkit-font-feature-settings: "liga";
  -webkit-font-smoothing: antialiased;
}
.material-symbols-sharp   { font-family: "Material Symbols Sharp"; }
.material-symbols-rounded { font-family: "Material Symbols Rounded"; }
```

The mixin sets no variation axes of its own, so icons look exactly as they do on the page. Your component's `font-size` and `font-weight` still apply, for example `font-weight: 200` on an icon span. The class rule's `font-size: 24px` is only the default.

## 5. Configuring it

- **Change the default style for the whole site.** Edit `$default-style` in the partial (it is `"sharp"`), then recompile the components that use the bare `@include icons.material-symbols;`.
- **Change it for one component.** Pass the style: `@include icons.material-symbols(outlined);`.
- **Set the axes for every icon without recompiling.** In page CSS: `:root { --icon-font-variation-settings: "FILL" 1, "wght" 300; }`. Custom properties inherit into shadow roots, so every component follows. Axes set here take precedence over `font-weight`.
- **Add or replace styles.** `$styles` maps a name to a font family, and the class is always `.material-symbols-<name>`. Override it when you `@use` the partial: `@use "../typography/material-symbols" as icons with ($styles: (...));`.

## 6. Gotchas

- **Text instead of an icon.** If the span shows the word "menu", one of these is the cause: the component's scss does not include the mixin, the style in the HTML class was not requested in the include, or the page does not load that style's font file.
- **Every component repeats it.** That is intended: each shadow root needs its own copy. Compiled size is small and only has the styles you ask for.
- **Unknown styles stop the compile.** `@include icons.material-symbols(sharpp);` fails with a message that lists the known styles.
- **Material Symbols only.** The older Material Icons fonts use different class and family names (`material-icons`, `Material Icons Outlined`, ...). They are not covered, and adding them would mean a second map with its own class pattern.
- **A different icon font needs a rewrite.** Other icon fonts name their glyphs differently, so the glyph names in the components would change as well as this partial.