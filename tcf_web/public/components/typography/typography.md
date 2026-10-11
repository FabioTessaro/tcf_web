# Typeface SCSS guide

How to use `scss/config/_typography.scss` and the files it loads. This is a
reference for day-to-day use, not an explanation of why it's built this way.

## Files

```
scss/
  config/
    _typography.scss        the engine: merges data, exposes mixins
    typefaces/
      _defaults.scss         font stacks + default property values
      _latin.scss             the typeface list (source of names) + Latin look
      _chinese.scss            overrides for zh-CN
      _japanese.scss           overrides for ja-JP
  components/
    _<component>.scss         your component partials, one per component
  main.scss                  includes the engine once, then every component
```

Supported languages: `en-GB`, `de-DE`, `it-IT`, `zh-CN`, `ja-JP`, in three
script groups:

| Script group | Languages |
|---|---|
| `latin` | en-GB, de-DE, it-IT |
| `chinese` | zh-CN |
| `japanese` | ja-JP |

## Setup (already done in `main.scss`)

```scss
@use 'config/typography' as type;

:root { @include type.tokens; }
@include type.language-tokens;   // must come AFTER tokens
@include type.utilities;          // optional: .tf-* classes
```

You never touch this. Everything below is for component partials.

## Using a typeface

Every component partial starts the same way:

```scss
@use '../config/typography' as type;   // path relative to the partial
```

Then apply a typeface to any selector:

```scss
.pricing-card {
  &__title { @include type.typeface(heading-2); }
  &__search { @include type.typeface(body); }
}
```

This sets `font-family`, `font-weight`, `font-stretch`, `font-style`,
`font-size`, `line-height`, `letter-spacing`, and `text-transform` all at
once, from CSS custom properties. The values automatically match the active
language — nothing else needs to change.

**Typo check:** an unknown name fails the build immediately:

```scss
@include type.typeface(headng-1);
// Error: "Unknown typeface 'headng-1'. Available: body, body-strong, heading-1, ..."
```

### Available typefaces (today)

`body`, `body-strong`, `heading-1`, `heading-2`, `caption`, `label`. The full
list and its values live in `typefaces/_latin.scss`.

### Overriding one property locally

Fine for a one-off. If you do it often for the same typeface, add a new
typeface instead (see below).

```scss
.pricing-card__search {
  @include type.typeface(body);
  font-size: 0.9rem;
}
```

### `.tf-*` utility classes

Every typeface also exists as a class, for use directly in HTML:

```html
<p class="tf-caption">Starting at $19/month</p>
```

## Adding a new typeface

Edit `typefaces/_latin.scss` only. Each entry overrides just what differs
from the defaults in `_defaults.scss` (weight 400, width 100, size 1rem,
line-height 1.5, letter-spacing normal, text-transform none):

```scss
// typefaces/_latin.scss
$typefaces: (
  // ...existing entries...
  quote: (weight: 300, style: italic, size: 1.25rem, line-height: 1.6),
);
```

It's now usable everywhere: `@include type.typeface(quote)`, `.tf-quote`.

Noto Sans SC and Noto Sans JP have no italic, so the browser would fake a
slant for CJK text. Turn it off in the script overrides:

```scss
// typefaces/_chinese.scss and typefaces/_japanese.scss
quote: (stack: defaults.$stack-chinese, style: normal, weight: 400),
// (use $stack-japanese in _japanese.scss)
```

### Fluid sizes

Put `clamp()` straight into the value:

```scss
heading-1: (weight: 800, size: clamp(2.25rem, 1.25rem + 3vw, 3.5rem), ...),
```

A script override replaces the whole `size`, so give Chinese/Japanese their
own `clamp()` too if you want them fluid as well.

## Adding a property to every typeface

Three edits, then use it in any typeface's map:

```scss
// typefaces/_defaults.scss, inside $typeface-defaults
numeric: normal,

// _typography.scss, in the -vars mixin
--tf-#{$name}-numeric: #{map.get($tf, numeric)};

// _typography.scss, in the typeface mixin
font-variant-numeric: var(--tf-#{$name}-numeric);
```

```scss
// typefaces/_latin.scss
price: (weight: 600, numeric: tabular-nums, letter-spacing: 0.01em),
```

## Per-language and per-script overrides for a typeface

Edit `typefaces/_chinese.scss` or `typefaces/_japanese.scss`. These are
**overrides only** — the name must already exist in `_latin.scss`:

```scss
// typefaces/_japanese.scss
@use 'defaults';

$typefaces: (
  body:      (stack: defaults.$stack-japanese, weight: 350, line-height: 1.8),
  heading-1: (stack: defaults.$stack-japanese, weight: 900, size: 2.75rem,
              line-height: 1.25, letter-spacing: 0),
);
```

Nothing in a component partial changes. The `:lang()` rule that applies
these lives in `main.scss`'s `language-tokens` include.

## Scoping plain CSS to a language

For properties that aren't part of the typeface system (text-align,
word-break, margins, icon direction, etc.), use `for-language` or
`for-script` **inside a selector**:

```scss
.pricing-card {
  &__price {
    font-size: 1.5rem;

    @include type.for-language('ja-JP') {
      font-size: 1.75rem;
      letter-spacing: 0;
    }
  }

  &__title {
    @include type.for-script('chinese')  { text-align: justify; }
    @include type.for-script('japanese') { word-break: keep-all; }
  }
}
```

Compiles to compound selectors that match the element itself:

```css
.pricing-card__price:lang(ja-JP) { font-size: 1.75rem; letter-spacing: 0; }
.pricing-card__title:lang(zh-CN) { text-align: justify; }
.pricing-card__title:lang(ja-JP) { word-break: keep-all; }
```

- **`for-language(code)`** — one specific language.
- **`for-script(group)`** — every language in that script group at once;
  automatically picks up a language added to the group later.
- Both must be nested inside a selector (they rely on `&`). Both fail the
  build on an unknown code or group name.
- If the same property ends up repeated across many components for one
  language, it's a sign to promote it into the typeface system instead (see
  "Adding a property to every typeface" above), so it's defined once.

### Works inside Shadow DOM components too

`:lang()` and CSS custom properties both cross the shadow boundary (language
is inherited into shadow trees), so `typeface()`, `for-language`, and
`for-script` all work unchanged inside a web component's Shadow DOM.

## Adding a language to an existing script group

```scss
// _typography.scss, $languages map
'fr-FR': latin,
```

That's the only SCSS change. Also update (outside this file): i18next's
`CONFIG.supported`, the language switcher's `<option>`, and every
component's `.i18n.js` strings.

## Adding a new script group

```html
<!-- base.html: add to the Google Fonts URL -->
&family=Noto+Sans+KR:wght@100..900
```

```scss
// typefaces/_defaults.scss
$stack-korean: 'Noto Sans KR', 'Noto Sans', system-ui, 'Malgun Gothic', sans-serif !default;
```

```scss
// typefaces/_korean.scss (new file)
@use 'defaults';
$typefaces: (
  body:      (stack: defaults.$stack-korean, line-height: 1.75),
  heading-1: (stack: defaults.$stack-korean, weight: 700, size: 2.75rem,
              line-height: 1.25, letter-spacing: 0),
);
```

```scss
// _typography.scss
@use 'typefaces/korean';
$script-overrides: ( ..., korean: korean.$typefaces );
$languages: ( ..., 'ko-KR': korean );
```

## Quick reference

| Want to... | Edit |
|---|---|
| Use a typeface in a component | `@include type.typeface(name)` |
| Add a new typeface | `typefaces/_latin.scss` |
| Add a property to every typeface | `_defaults.scss` + `_typography.scss` (`-vars`, `typeface`) |
| Change how a typeface looks in Chinese/Japanese | `typefaces/_chinese.scss` / `_japanese.scss` |
| Make a fluid size | `size: clamp(...)` in the typeface's map |
| Scope one plain CSS property to one language | `@include type.for-language('code') { ... }` |
| Scope one plain CSS property to a script group | `@include type.for-script('group') { ... }` |
| Add a language to an existing script | `$languages` map in `_typography.scss` (+ i18next, switcher, strings) |
| Add a new script group | new `typefaces/_<script>.scss` + `$script-overrides` + `$languages` |