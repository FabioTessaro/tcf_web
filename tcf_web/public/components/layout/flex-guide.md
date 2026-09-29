# Flex Toolkit — User Guide

Documentation for `scss/config/_flex.scss`, a set of SCSS mixins that let you control flex layout and responsiveness from inside the stylesheet of the element you are styling. No utility classes and no extra markup: you `@include` a mixin and the CSS is generated for you.

**Requires Dart Sass.** The file uses the Sass module system (`@use`, `sass:map`, `sass:math`). It will not compile with libsass / node-sass.

---

## Contents

1. [Quick start](#1-quick-start)
2. [Setup](#2-setup)
3. [Core concepts](#3-core-concepts)
4. [Alignment in depth](#4-alignment-in-depth)
5. [Breakpoints: values, origin and configuration](#5-breakpoints-values-origin-and-configuration)
6. [Reference: every mixin](#6-reference-every-mixin)
   - [6.1 Media helpers](#61-media-helpers)
   - [6.2 Parent mixins: container, direction, wrap, gap, alignment](#62-parent-mixins-container-direction-wrap-gap-alignment)
   - [6.3 Columns and rows](#63-columns-and-rows)
   - [6.4 Relative sizes and child targeting](#64-relative-sizes-and-child-targeting)
   - [6.5 Item mixins](#65-item-mixins)
   - [6.6 Visibility](#66-visibility)
7. [Internals: the private functions](#7-internals-the-private-functions)
8. [Recipes](#8-recipes)
9. [Gotchas](#9-gotchas)
10. [Troubleshooting](#10-troubleshooting)
11. [Cheat sheet](#11-cheat-sheet)

---

## 1. Quick start

```scss
// _product-grid.scss
@use "../config/flex" as *;

.product-grid {
  // 1 column on mobile, 2 from md, 4 from lg, with a 1rem gap
  @include flex-columns-at((base: 1, md: 2, lg: 4), $gap: 1rem);
  // centre the columns horizontally, align items of a row to the top
  @include flex-align(center, start);
}

.page-layout {
  @include flex-direction(column, row);   // stacked on mobile, side by side on desktop
  @include flex-gap(2rem);

  @include flex-desktop {
    @include flex-ratios(280px, 1);       // fixed 280px sidebar + fluid content
  }
}

.page-layout__content { @include flex-fill; }   // takes the remaining space
```

You include mixins in the SCSS of the element you are styling, and the compiled CSS contains normal flexbox declarations.

---

## 2. Setup

### 2.1 File location

```
scss/
  config/
    _flex.scss        <- this toolkit
    _typography.scss
  components/
    _product-grid.scss
    ...
```

### 2.2 Loading it

In every SCSS file where you want to use the mixins:

```scss
@use "../config/flex" as *;
```

- The path is relative to the file that contains the `@use`. If your Sass compiler has a load path pointing at `scss/` (for example `sass --load-path=scss`), you can write `@use "config/flex" as *;` everywhere.
- `@use` rules must come **before** any other rule in the file. Only `@forward`, comments and variable declarations (used to configure modules) may precede them.
- `as *` puts the mixins in the global namespace of that file, so you write `@include flex-columns(3)`. Without `as *` you would write `@include flex.flex-columns(3)`. All names start with `flex-`, so collisions are unlikely.
- Each file that needs the mixins must `@use` the partial itself. Sass modules do not leak into files that did not load them.

### 2.3 If your project still uses `@import`

Dart Sass still supports `@import` (with a deprecation warning). The toolkit works that way too:

```scss
@import "config/flex";
```

Its mixins become global. Prefer `@use`; `@import` is being removed from Sass.

### 2.4 Browser support

The toolkit relies on `gap` for flexbox (Chrome 84+, Firefox 63+, Safari 14.1+, Edge 84+) and on `calc()`. All current browsers support both.

---

## 3. Core concepts

### 3.1 Parent mixins and item mixins

| Kind | Where to `@include` | What it does |
|---|---|---|
| **Parent mixins** | On the flex container | Set `display: flex`, direction, gap, alignment. Column/ratio mixins also generate `> *` rules that size the direct children |
| **Item mixins** | On the child itself | Set `flex`, `align-self`, `order`... for that one element |
| **Media helpers** | Anywhere | Wrap any rule in a media query |

Parent mixins: `flex-container`, `flex-direction`, `flex-wrap`, `flex-gap`, `flex-align`, `flex-align-lines`, `flex-center`, `flex-columns`, `flex-rows`, `flex-grid`, `flex-columns-at`, `flex-auto-columns`, `flex-ratios`, `flex-children-max`, `flex-child`, `flex-children`.

Item mixins: `flex-item`, `flex-fill`, `flex-full`, `flex-auto`, `flex-span`, `flex-self`, `flex-order`, `flex-hide-mobile`, `flex-hide-desktop`.

### 3.2 Mobile-first

Write the mobile (base) styles first, then override for larger screens:

```scss
.cards {
  @include flex-direction(column);         // base / mobile

  @include flex-desktop {                  // desktop override
    @include flex-direction(row);
  }
}
```

"Mobile" means below `$flex-desktop-breakpoint` (default `md` = 768px). "Desktop" means at or above it. See [section 5](#5-breakpoints-values-origin-and-configuration) for what these numbers are and where they come from.

Mixins with a `$mobile` and `$desktop` parameter (`flex-direction`, `flex-order`) apply `$mobile` at **all** sizes and add a desktop override on top, so `$mobile` is really the base value.

### 3.3 Gaps

Spacing between items uses the CSS `gap` properties (`column-gap`, `row-gap`), not margins. Mixins that compute widths (`flex-columns`, `flex-rows`, `flex-grid`, `flex-columns-at`, `flex-span`) subtract the gaps from the size of each column so columns always fit exactly.

For those size-computing mixins, `$gap` must be a **Sass length** (`1rem`, `16px`, `2%`). A CSS variable such as `var(--gap)` cannot be used there because Sass has to multiply it. `flex-gap`, `flex-container` and `flex-auto-columns` only pass the value through, so they accept anything.

---

## 4. Alignment in depth

### 4.1 Flexbox in one minute: the two axes

A flex container lays out its items along a **main axis**. The perpendicular direction is the **cross axis**. The container's `flex-direction` decides which one is horizontal:

| `flex-direction` | Main axis runs | Cross axis runs |
|---|---|---|
| `row` | left → right (horizontal) | top → bottom (vertical) |
| `row-reverse` | right → left (horizontal) | top → bottom (vertical) |
| `column` | top → bottom (vertical) | left → right (horizontal) |
| `column-reverse` | bottom → top (vertical) | left → right (horizontal) |

CSS alignment properties are defined in terms of these axes, **not** in terms of horizontal/vertical:

| CSS property | Works on | Effect |
|---|---|---|
| `justify-content` | **main** axis | Where the items sit, and how free space is distributed, along the main axis |
| `align-items` | **cross** axis | Where each item sits inside its line, along the cross axis |
| `align-content` | **cross** axis | How several wrapped lines are distributed in the container (only when wrapping) |
| `align-self` | **cross** axis | Overrides `align-items` for one item |

This is the source of most flexbox confusion: with `flex-direction: row`, `justify-content` is horizontal, but after switching to `column` the same property becomes vertical.

### 4.2 What the toolkit does

You think in horizontal/vertical terms. The toolkit translates them into the right CSS property using the direction:

```scss
@include flex-align($horizontal, $vertical, $direction);
```

Internally it does this:

```scss
@if $direction is column or column-reverse {
  justify-content: <$vertical>;      // main axis is vertical
  align-items:     <$horizontal>;    // cross axis is horizontal
} @else {                            // row or row-reverse
  justify-content: <$horizontal>;    // main axis is horizontal
  align-items:     <$vertical>;      // cross axis is vertical
}
```

Each keyword (`start`, `center`, `end`...) is converted to its CSS value (`flex-start`, `center`, `flex-end`...) on the way. The complete keyword list is in [4.4](#44-keywords-and-which-axis-accepts-them).

**Why you must pass `$direction`.** Sass runs at compile time and cannot read what direction you set somewhere else in the stylesheet. `flex-align` therefore assumes `row` unless you tell it otherwise. If the container is a column and you forget `$direction: column`, horizontal and vertical are swapped.

The all-in-one mixin `flex-container` removes this risk because it uses the same `$direction` for the direction and for the alignment in a single call:

```scss
.stack { @include flex-container(column, $horizontal: center, $vertical: start); }
```

### 4.3 The same call under every direction

Take `@include flex-align(center, end, $direction: …)`, meaning "centred horizontally, at the bottom":

| `$direction` | Generated CSS | Result |
|---|---|---|
| `row` | `justify-content: center; align-items: flex-end;` | Items grouped in the horizontal centre, aligned to the bottom edge |
| `row-reverse` | `justify-content: center; align-items: flex-end;` | Same (centred is symmetrical; only the item order is reversed) |
| `column` | `justify-content: flex-end; align-items: center;` | Items stacked against the bottom, each centred horizontally |
| `column-reverse` | `justify-content: flex-end; align-items: center;` | Same properties; see the note on reverse directions below |

Visual for `flex-align(center, start)` on a row and `flex-align(center, start, column)` on a column:

```
row                                 column
+---------------------------+       +-----------+
|        [A] [B] [C]        |       |    [A]    |
|                           |       |    [B]    |
|                           |       |    [C]    |
|                           |       |           |
+---------------------------+       +-----------+
```

### 4.4 Keywords and which axis accepts them

| Keyword | Generated value | Meaning |
|---|---|---|
| `start` (aliases `left`, `top`) | `flex-start` | At the beginning of the axis |
| `end` (aliases `right`, `bottom`) | `flex-end` | At the end of the axis |
| `center` | `center` | In the middle |
| `between` | `space-between` | First and last item at the edges, equal space between items |
| `around` | `space-around` | Equal space around each item (half-size space at the edges) |
| `evenly` | `space-evenly` | Equal space between items and at the edges |
| `stretch` | `stretch` | Items grow to fill the cross size |
| `baseline` | `baseline` | Items align on their first text baseline |

Not every keyword is valid on every axis. The toolkit does not stop you (any other value is passed straight through, so raw CSS values also work), but invalid combinations produce CSS the browser ignores:

| Axis | CSS property | Valid keywords |
|---|---|---|
| **Main** (horizontal in a row, vertical in a column) | `justify-content` | `start`, `end`, `center`, `between`, `around`, `evenly` (`stretch` has no effect in flexbox; `baseline` is invalid) |
| **Cross** (vertical in a row, horizontal in a column) | `align-items` | `start`, `end`, `center`, `stretch`, `baseline` (**not** `between`, `around`, `evenly`) |
| Lines (with wrapping) | `align-content` via `flex-align-lines` | `start`, `end`, `center`, `between`, `around`, `evenly`, `stretch` |
| One item | `align-self` via `flex-self` | `start`, `end`, `center`, `stretch`, `baseline` |

Rule of thumb: distribution keywords (`between`, `around`, `evenly`) go on the axis along which items are laid out.

`left`, `right`, `top` and `bottom` are only readable aliases of `start` and `end`. They do not mean the physical side of the screen in reverse or right-to-left layouts (see 4.8).

### 4.5 Omitting a value is not the same as `start`

A parameter left as `null` (the default) emits **no CSS property at all**, so the browser default applies:

- `justify-content` default: behaves like `start`.
- `align-items` default: behaves like **`stretch`** (items grow to the full cross size of the line).

```scss
.a { @include flex-align(center); }          // vertical omitted -> items stretch to full height
.b { @include flex-align(center, start); }   // items keep their own height, top-aligned
```
```css
.a { justify-content: center; }
.b { justify-content: center; align-items: flex-start; }
```

If you want to leave one axis alone while setting the other, pass `null` or use a named parameter: `flex-align(null, center)` or `flex-align($vertical: center)`.

Calling `flex-align` twice on the same element does not reset earlier values: a `null` in the second call emits nothing, so the first call's value stays.

### 4.6 Alignment when the direction changes with the breakpoint

This is the one case that needs care. `flex-direction(column, row)` switches direction with a media query, but `flex-align` is evaluated for **one** direction. If the meaning of horizontal/vertical should stay the same on both layouts, include `flex-align` once per direction:

```scss
.toolbar {
  @include flex-direction(column, row);

  // mobile (column): centred horizontally, items stacked from the top
  @include flex-mobile  { @include flex-align(center, start, column); }

  // desktop (row): items at the left, vertically centred
  @include flex-desktop { @include flex-align(start, center, row); }
}
```

If you do not need different alignments, remember that the same `flex-align` call means different things in the two directions: `flex-align(center, start)` without `$direction` treats the layout as a row on every screen size, so on the column layout the "horizontal" value acts vertically.

### 4.7 Alignment with the column and grid mixins

| Mixin | Layout it creates | `$horizontal` controls | `$vertical` controls |
|---|---|---|---|
| `flex-columns`, `flex-grid`, `flex-columns-at`, `flex-auto-columns` | `row` + wrap | Position of the columns inside a row when they do not fill it (for example the incomplete last row, or columns limited by `$max-width`) | How items of different heights sit inside the same row (`stretch` is the default) |
| `flex-rows` | `column` + wrap (pass `$direction: column`) | How each item sits inside its column (cross axis) | How items are placed inside a column (main axis) |
| `flex-ratios` | no direction set (row by default) | Where the group sits if the ratios do not fill the row | Vertical position of the children |

Notes:

- `between` on `$horizontal` with `flex-columns` spreads the items of an incomplete last row to the edges, which usually looks wrong. Use `start` or `center`.
- With `flex-grid($columns, $rows)` every child has a fixed height, so `$vertical` has no visible effect.
- To distribute whole rows of a wrapping container vertically (when the container is taller than its rows) use `flex-align-lines`.

### 4.8 Reverse directions and right-to-left text

- In `row-reverse` and `column-reverse` the **start** of the axis is at the opposite end. `flex-align(start, …)` in a `row-reverse` places items at the **right** edge.
- In right-to-left writing modes (Arabic, Hebrew) `start` of a row is the right edge. The site's supported languages (en, de, it, zh, ja) are all left-to-right, so `start` is the left there.

### 4.9 Per-item alignment

- `flex-self($value)` overrides the cross-axis alignment of a single child (`align-self`).
- `flex-align-lines($value)` handles the distribution of wrapped lines (`align-content`).

### 4.10 Worked examples

**Centred content (both axes)**

```scss
.hero { @include flex-center(column); min-height: 60vh; }
```

**Navigation bar: logo left, menu right, everything vertically centred**

```scss
.navbar { @include flex-container(row, $horizontal: between, $vertical: center); }
```
```css
.navbar { display: flex; flex-direction: row; justify-content: space-between; align-items: center; }
```

**Vertical stack, children centred horizontally, pushed to the top**

```scss
.stack { @include flex-container(column, $horizontal: center, $vertical: start); }
```
```css
.stack { display: flex; flex-direction: column; justify-content: flex-start; align-items: center; }
```

**One item pinned to the bottom-right of a row container**

```scss
.footer-bar { @include flex-container(row, $horizontal: end, $vertical: end); }
```

**One child aligned differently from its siblings**

```scss
.badge { @include flex-self(end); }
```

---

## 5. Breakpoints: values, origin and configuration

### 5.1 The two variables

```scss
$flex-breakpoints: (
  sm: 576px,
  md: 768px,
  lg: 1024px,
  xl: 1280px,
  xxl: 1536px,
) !default;

$flex-desktop-breakpoint: md !default;
```

Anywhere a breakpoint is expected you can pass a **name** (`md`), a **length** (`900px`) or a **unitless number** (`900`, treated as px).

### 5.2 Where the values come from

These numbers are **not** derived from measuring your site, from a browser standard or from an official specification. There is no standard list of breakpoints. I chose them by combining the defaults of the two most widely used CSS frameworks, so that they are familiar and reasonably close to real device widths:

| Name | Value in `_flex.scss` | Bootstrap 5 | Tailwind CSS |
|---|---|---|---|
| `sm` | 576px | 576px (same) | 640px |
| `md` | 768px | 768px (same) | 768px (same) |
| `lg` | 1024px | 992px | 1024px (same) |
| `xl` | 1280px | 1200px | 1280px (same) |
| `xxl` | 1536px | 1400px | 1536px (called `2xl`, same) |

In short: `sm` comes from Bootstrap, `lg`, `xl` and `xxl` from Tailwind, and `md` is the same in both. The toolkit is a hybrid and does not use any code from either framework, only these widths.

What the two frameworks say about their own values (checked against their documentation):

- Bootstrap 5 defines `sm` 576, `md` 768, `lg` 992, `xl` 1200 and `xxl` 1400 and says the values were chosen to comfortably hold containers whose widths are multiples of 12 and to represent a subset of common device sizes, without targeting every device (https://getbootstrap.com/docs/5.3/layout/breakpoints/).
- Tailwind's defaults are `sm` 640, `md` 768, `lg` 1024, `xl` 1280 and `2xl` 1536, described as inspired by common device resolutions (https://v2.tailwindcss.com/docs/breakpoints).

Two consequences you should know about:

1. **They are a starting point, not a truth.** If your design was drawn for other widths (for example a container that stops growing at 1200px), change the map to match it.
2. **Media queries use CSS pixels**, not physical screen pixels. A phone with a 1080-pixel-wide screen typically reports a viewport of roughly 360 to 430 CSS pixels, so it falls below `sm`.

### 5.3 Why "desktop" starts at 768px

`$flex-desktop-breakpoint` is set to `md` (768px) because that is where the two frameworks start treating screens as tablet-sized or larger, and it is the usual point at which side-by-side layouts become comfortable. In this toolkit "desktop" therefore really means "tablet and up". It is a judgement call, not a rule. If you want a phone/tablet split at 576px, or a real desktop split at 1024px, set:

```scss
$flex-desktop-breakpoint: lg !default;   // in _flex.scss
```

### 5.4 Why `flex-below` subtracts 0.02px

`flex-below(md)` generates `max-width: 767.98px`, not `767px` or `768px`.

- With `max-width: 768px` and `min-width: 768px` both true at exactly 768px, mobile and desktop rules would apply at the same time.
- With `max-width: 767px`, widths between 767 and 768 (which exist on zoomed or high-DPI displays) would match neither.

Subtracting 0.02px avoids both problems. Bootstrap's generated CSS uses the same technique (values such as `767.98px`).

### 5.5 Choosing your own breakpoints

1. List the widths your design was made for (design tool frames, container max-widths).
2. Resize the site in the browser and note the widths where the layout actually starts to look wrong. Put breakpoints there ("content-driven" breakpoints), not at device names.
3. Set `$flex-breakpoints` to those values, keeping the keys in ascending order (mobile-first).
4. Test one width just inside each boundary (for example 767 and 768).

### 5.6 Changing the values

The simplest and safest way is to **edit the two variables at the top of `_flex.scss`**.

You can also configure the module when you load it:

```scss
@use "../config/flex" as * with (
  $flex-breakpoints: (sm: 600px, md: 900px, lg: 1200px),
  $flex-desktop-breakpoint: md
);
```

Sass only allows this on the **first** load of the module in a compilation. If several files load `flex` and one of them tries to configure it after another already loaded it, Sass raises an error. If that happens, edit the defaults in the file.

Keep `$flex-desktop-breakpoint` pointing at a key that exists in `$flex-breakpoints`, or use a number.

---

## 6. Reference: every mixin

Every mixin below is documented the same way: what it does, where to include it, a table of **every parameter** (type, default, accepted values, effect), the CSS it generates, an example and notes. "Sass length" means a value like `1rem`, `16px` or `5%`.

### 6.1 Media helpers

These wrap the rules you put inside them in a media query. They take a content block (`{ ... }`) and can be used anywhere, including inside other mixins.

#### `flex-from($breakpoint)`

**What it does:** applies the enclosed styles from the given width **and up**.

| Parameter | Type | Default | Accepted values | Effect |
|---|---|---|---|---|
| `$breakpoint` | name, length or number | required | a key of `$flex-breakpoints` (`sm`, `md`…), a length (`900px`) or a unitless number (`900` = 900px) | Width at which the styles start to apply. An unknown name stops compilation with an error listing the valid names |

**Generates:** `@media (min-width: <breakpoint>) { … }`

```scss
.box { @include flex-from(lg) { padding: 3rem; } }
```
```css
@media (min-width: 1024px) { .box { padding: 3rem; } }
```

#### `flex-below($breakpoint)`

**What it does:** applies the enclosed styles **below** the given width.

| Parameter | Type | Default | Accepted values | Effect |
|---|---|---|---|---|
| `$breakpoint` | name, length or number | required | same as `flex-from` | Width under which the styles apply. The breakpoint itself is **excluded** |

**Generates:** `@media (max-width: <breakpoint − 0.02px>) { … }`, for example `767.98px` for `md` (see [5.4](#54-why-flex-below-subtracts-002px)).

#### `flex-between($from, $to)`

**What it does:** applies the enclosed styles in a width range, from `$from` (inclusive) up to `$to` (exclusive).

| Parameter | Type | Default | Accepted values | Effect |
|---|---|---|---|---|
| `$from` | name, length or number | required | as above | Lower limit, included |
| `$to` | name, length or number | required | as above | Upper limit, excluded (0.02px is subtracted) |

**Generates:** `@media (min-width: <from>) and (max-width: <to − 0.02px>) { … }`

```scss
.promo { @include flex-between(sm, lg) { display: none; } }   // hidden from 576px to 1023.98px
```

#### `flex-mobile`

**What it does:** shortcut for "below the desktop breakpoint". **No parameters.**

**Generates:** the same as `flex-below($flex-desktop-breakpoint)` (default: `max-width: 767.98px`).

#### `flex-desktop`

**What it does:** shortcut for "from the desktop breakpoint up". **No parameters.**

**Generates:** the same as `flex-from($flex-desktop-breakpoint)` (default: `min-width: 768px`).

```scss
.menu {
  @include flex-mobile  { display: none; }
  @include flex-desktop { display: flex; }
}
```

---

### 6.2 Parent mixins: container, direction, wrap, gap, alignment

#### `flex-container($direction: row, $wrap: null, $gap: null, $horizontal: null, $vertical: null, $inline: false)`

**What it does:** turns the element into a flex container in one call: display type, direction, and optionally wrapping, gap and alignment. Because it passes `$direction` to the alignment logic itself, `$horizontal` and `$vertical` are always interpreted correctly for that direction (see [4.2](#42-what-the-toolkit-does)).

**Where:** on the container.

| Parameter | Type | Default | Accepted values | Effect |
|---|---|---|---|---|
| `$direction` | keyword | `row` | `row`, `row-reverse`, `column`, `column-reverse` | Sets `flex-direction` and tells the alignment logic which axis is horizontal |
| `$wrap` | keyword or boolean | `null` | `true` (`wrap`), `false` (`nowrap`), `reverse` (`wrap-reverse`), or a raw CSS value; `null` = emit nothing | Whether items may move onto new lines |
| `$gap` | any CSS length | `null` | `1rem`, `16px`, `var(--gap)`… `null` = emit nothing | Space between items, in both directions (uses `flex-gap`) |
| `$horizontal` | alignment keyword | `null` | see [4.4](#44-keywords-and-which-axis-accepts-them); `null` = leave untouched | Horizontal alignment |
| `$vertical` | alignment keyword | `null` | as above | Vertical alignment |
| `$inline` | boolean | `false` | `true` / `false` | `true` uses `display: inline-flex` (container flows inline like text), `false` uses `display: flex` (block-level) |

```scss
.toolbar {
  @include flex-container(row, $wrap: true, $gap: 1rem, $horizontal: between, $vertical: center);
}
```
```css
.toolbar {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  column-gap: 1rem;
  row-gap: 1rem;
  justify-content: space-between;
  align-items: center;
}
```

**Notes:** not responsive by itself. For a direction that changes with the breakpoint use `flex-direction($mobile, $desktop)` plus the pattern in [4.6](#46-alignment-when-the-direction-changes-with-the-breakpoint).

#### `flex-direction($mobile: row, $desktop: null)`

**What it does:** makes the element a flex container with the given direction, and optionally switches to another direction from the desktop breakpoint.

| Parameter | Type | Default | Accepted values | Effect |
|---|---|---|---|---|
| `$mobile` | keyword | `row` | `row`, `row-reverse`, `column`, `column-reverse` | Direction at all sizes (the base value; on desktop only if `$desktop` is not given) |
| `$desktop` | keyword | `null` | same values, or `null` | Direction from the desktop breakpoint up. `null`, or a value equal to `$mobile`, generates no media query |

```scss
.layout { @include flex-direction(column, row); }
```
```css
.layout { display: flex; flex-direction: column; }
@media (min-width: 768px) { .layout { flex-direction: row; } }
```

**Notes:** it sets `display: flex` too. It does **not** adjust alignment: see [4.6](#46-alignment-when-the-direction-changes-with-the-breakpoint).

#### `flex-wrap($wrap: true)`

**What it does:** sets whether items wrap onto new lines. Does not set `display`.

| Parameter | Type | Default | Accepted values | Effect |
|---|---|---|---|---|
| `$wrap` | boolean or keyword | `true` | `true` → `wrap`, `false` → `nowrap`, `reverse` → `wrap-reverse`, or any raw CSS value | Value of `flex-wrap` |

#### `flex-gap($column-gap, $row-gap: $column-gap)`

**What it does:** sets the spacing between items.

| Parameter | Type | Default | Accepted values | Effect |
|---|---|---|---|---|
| `$column-gap` | any CSS length | required | `1rem`, `16px`, `2%`, `var(--gap)`, `0` | Space between items on the same line (horizontal in a row) |
| `$row-gap` | any CSS length | same as `$column-gap` | as above | Space between lines (vertical in a row) |

```scss
@include flex-gap(1rem);           // column-gap: 1rem; row-gap: 1rem
@include flex-gap(2rem, 0.5rem);   // column-gap: 2rem; row-gap: 0.5rem
```

**Notes:** `column-gap` is always the space *between columns* and `row-gap` the space *between rows*, regardless of the flex direction.

#### `flex-align($horizontal: null, $vertical: null, $direction: row)`

**What it does:** aligns the items horizontally and vertically, converting to `justify-content` / `align-items` according to the direction. Read [section 4](#4-alignment-in-depth) for the full explanation.

| Parameter | Type | Default | Accepted values | Effect |
|---|---|---|---|---|
| `$horizontal` | alignment keyword | `null` | `start`, `center`, `end`, `between`, `around`, `evenly`, `stretch`, `baseline` (aliases `left`, `right`), raw CSS values; `null` = emit nothing | Horizontal placement. In a row it becomes `justify-content` (main axis); in a column it becomes `align-items` (cross axis) |
| `$vertical` | alignment keyword | `null` | same keywords (aliases `top`, `bottom`) | Vertical placement. In a row it becomes `align-items`; in a column it becomes `justify-content` |
| `$direction` | keyword | `row` | `row`, `row-reverse`, `column`, `column-reverse` | The direction of the container. **Must match the container's actual direction**, otherwise horizontal and vertical are swapped |

```scss
.card-row   { @include flex-align(center, start); }                       // row
.card-stack { @include flex-align(center, between, $direction: column); } // column
```
```css
.card-row   { justify-content: center; align-items: flex-start; }
.card-stack { justify-content: space-between; align-items: center; }
```

**Notes:** it does not set `display` or `flex-direction`. `between`, `around`, `evenly` are valid only on the main axis ([4.4](#44-keywords-and-which-axis-accepts-them)).

#### `flex-align-lines($value)`

**What it does:** sets how several **wrapped lines** are distributed inside the container (`align-content`). It has no effect on a single line or a non-wrapping container, and needs free space in the cross axis (for example a container with a fixed height).

| Parameter | Type | Default | Accepted values | Effect |
|---|---|---|---|---|
| `$value` | alignment keyword | required | `start`, `end`, `center`, `between`, `around`, `evenly`, `stretch`, or raw CSS | Value of `align-content` |

```scss
.gallery { height: 30rem; @include flex-columns(3, $gap: 1rem); @include flex-align-lines(between); }
```

#### `flex-center($direction: row)`

**What it does:** makes the element a flex container that centres its items both horizontally and vertically.

| Parameter | Type | Default | Accepted values | Effect |
|---|---|---|---|---|
| `$direction` | keyword | `row` | `row`, `row-reverse`, `column`, `column-reverse` | The flow direction of the items. Because both axes are centred, it changes only how several items are stacked (side by side vs on top of each other), not where the group is placed |

**Generates:** `display: flex; flex-direction: <dir>; justify-content: center; align-items: center;`

```scss
.hero { @include flex-center(column); min-height: 60vh; }
```

---

### 6.3 Columns and rows

Each of these mixins sets `display: flex` on the parent and writes `> *` rules for the direct children. They compute exact widths, taking the gap into account.

#### `flex-columns($count, $gap: 0, $max-width: null)`

**What it does:** lays the children out in a fixed number of equal columns. When there are more children than columns, they wrap to a new row. All columns have the same width, including the ones in an incomplete last row.

| Parameter | Type | Default | Accepted values | Effect |
|---|---|---|---|---|
| `$count` | positive integer | required | `1`, `2`, `3`… | Number of columns per row |
| `$gap` | Sass length | `0` | `1rem`, `16px`, `2%`, `0` | Space between columns and between rows. Subtracted from the column width so the columns fit exactly |
| `$max-width` | length or `null` | `null` | `400px`, `30rem`, `null` = no maximum | Maximum width of each column (`max-width` on the children). When it applies, free space is distributed according to the container's horizontal alignment |

```scss
.gallery { @include flex-columns(3, $gap: 1rem, $max-width: 400px); }
```
```css
.gallery {
  display: flex; flex-direction: row; flex-wrap: wrap;
  column-gap: 1rem; row-gap: 1rem;
}
.gallery > * {
  flex: 0 0 calc((100% - 2rem) / 3);
  min-width: 0;
  max-width: 400px;
}
```

**Notes:** `flex-columns` is `flex-grid` without rows. Add `flex-align(center)` to centre columns that hit their maximum width.

#### `flex-rows($count, $gap: 0)`

**What it does:** lays the children out in a fixed number of rows, filling **top to bottom**; when a column is full, a new column starts to its right.

| Parameter | Type | Default | Accepted values | Effect |
|---|---|---|---|---|
| `$count` | positive integer | required | `1`, `2`, `3`… | Number of rows (items per column) |
| `$gap` | Sass length | `0` | `1rem`, `16px`, `2%`, `0` | Space between rows and between columns; subtracted from the row height |

```scss
.list { height: 300px; @include flex-rows(3); }
```
```css
.list { display: flex; flex-direction: column; flex-wrap: wrap; column-gap: 0; row-gap: 0; }
.list > * { flex: 0 0 33.3333333333%; min-height: 0; }
```

**Notes:** the container needs a **definite height**. Without it the items simply stack. The direction is `column`, so pass `$direction: column` to `flex-align` if you align this container.

#### `flex-grid($columns, $rows: null, $gap: 0, $row-gap: $gap, $max-width: null)`

**What it does:** columns and rows together. Each child gets a column width and, if `$rows` is given, a height equal to `1/$rows` of the container.

| Parameter | Type | Default | Accepted values | Effect |
|---|---|---|---|---|
| `$columns` | positive integer | required | `1`, `2`, `3`… | Number of columns |
| `$rows` | positive integer or `null` | `null` | `1`, `2`…; `null` = height determined by content | Number of rows. Sets `height` on every child. The container needs a definite height |
| `$gap` | Sass length | `0` | `1rem`, `0`… | Space between columns (and between rows unless `$row-gap` is given) |
| `$row-gap` | Sass length | same as `$gap` | as above | Space between rows. Also used in the row-height calculation |
| `$max-width` | length or `null` | `null` | `400px`, `null` = no maximum | Maximum width of each column |

```scss
.dashboard { height: 100vh; @include flex-grid(3, 2, $gap: 1rem); }
```
```css
.dashboard > * {
  flex: 0 0 calc((100% - 2rem) / 3);
  min-width: 0;
  height: calc((100% - 1rem) / 2);
}
```

#### `flex-columns-at($counts, $gap: 0, $max-width: null)`

**What it does:** a different number of columns at different breakpoints. It repeats `flex-columns` inside the appropriate media query for each entry.

| Parameter | Type | Default | Accepted values | Effect |
|---|---|---|---|---|
| `$counts` | map | required | keys: `base` (or `0`) for "no media query", breakpoint names (`sm`, `md`…), lengths or numbers; values: positive integers. **List keys in ascending order.** | Column count starting at each breakpoint |
| `$gap` | Sass length | `0` | as in `flex-columns` | Same gap at all breakpoints |
| `$max-width` | length or `null` | `null` | as in `flex-columns` | Same column maximum at all breakpoints |

```scss
.cards { @include flex-columns-at((base: 1, sm: 2, lg: 4), $gap: 1.5rem); }
```
```css
.cards { /* 1 column */ }
@media (min-width: 576px)  { .cards { /* 2 columns */ } }
@media (min-width: 1024px) { .cards { /* 4 columns */ } }
```

**Notes:** each breakpoint block is self-contained (the container declarations are repeated), at the price of slightly more CSS.

#### `flex-auto-columns($min-width, $gap: 0, $max-width: null)`

**What it does:** columns that adapt on their own without breakpoints: as many as fit in the row, each at least `$min-width` wide, growing to share the remaining space.

| Parameter | Type | Default | Accepted values | Effect |
|---|---|---|---|---|
| `$min-width` | length | required | `16rem`, `200px`… | Preferred/minimum column width (the `flex-basis`). When less than this fits, the item moves to a new row |
| `$gap` | any CSS length | `0` | `1rem`, `var(--gap)`… | Space between columns and rows (not used in any calculation, so any value works) |
| `$max-width` | length or `null` | `null` | `30rem`, `null` = no maximum | Maximum width of each column |

```scss
.tiles { @include flex-auto-columns(16rem, $gap: 1rem, $max-width: 30rem); }
```
```css
.tiles { display: flex; flex-wrap: wrap; column-gap: 1rem; row-gap: 1rem; }
.tiles > * { flex: 1 1 16rem; max-width: 30rem; }
```

**Notes:** you do not control the exact number of columns, only their minimum width. Use `flex-columns` / `flex-columns-at` when the count matters.

---

### 6.4 Relative sizes and child targeting

#### `flex-ratios($ratios...)`

**What it does:** sets the relative size of each direct child, in order: the first value applies to the first child, and so on. It sets `display: flex` on the parent but not a direction (combine it with `flex-direction` or `flex-container`).

| Parameter | Type | Default | Accepted values | Effect |
|---|---|---|---|---|
| `$ratios...` | list of values | required (at least one) | one value per child, of these kinds (see below) | Size of the corresponding child |

Each value can be:

| Value | Meaning | Generated CSS |
|---|---|---|
| A unitless number (`1`, `2`, `3.5`) | Share of the free space, relative to the other numbers | `flex: <n> 1 0%` |
| `auto` or `0` | Size to content, does not grow | `flex: 0 0 auto` |
| A length or percentage (`300px`, `25%`) | Fixed size | `flex: 0 0 <value>` |

```scss
.page  { @include flex-ratios(1, 2, 1); }      // 25% / 50% / 25%
.shell { @include flex-ratios(auto, 1); }      // content-sized sidebar + fluid main
.split { @include flex-ratios(300px, 1); }     // fixed 300px + fluid main
```
```css
.page > * { min-width: 0; }
.page > :nth-child(1) { flex: 1 1 0%; }
.page > :nth-child(2) { flex: 2 1 0%; }
.page > :nth-child(3) { flex: 1 1 0%; }
```

**Notes:**

- Ratios share the space left **after gaps**, so `flex-gap(1rem)` with `flex-ratios(1, 2, 1)` still gives exact 1:2:1 proportions.
- Children beyond the number of values are left untouched.
- `min-width: 0` is added to every child so long content cannot force a column wider than its share.
- In a **column** direction the sizes act on heights and need a definite container height. For layouts that stack on mobile, use it inside `flex-desktop`.

#### `flex-children-max($width, $height: null)`

**What it does:** sets a maximum size on every direct child.

| Parameter | Type | Default | Accepted values | Effect |
|---|---|---|---|---|
| `$width` | length, percentage or `none` | required | `28rem`, `400px`, `50%`, `none` | `max-width` of every child |
| `$height` | length or `null` | `null` | `20rem`, `null` = emit nothing | `max-height` of every child |

```scss
.cards { @include flex-children-max(28rem); }
```
```css
.cards > * { max-width: 28rem; }
```

For a maximum on a single column use `flex-child`.

#### `flex-child($n)`

**What it does:** styles one specific direct child, by position, from the parent's stylesheet. Takes a content block.

| Parameter | Type | Default | Accepted values | Effect |
|---|---|---|---|---|
| `$n` | positive integer | required | `1`, `2`, `3`… (1-based) | Position of the child; generates `> :nth-child($n)` |

```scss
.layout {
  @include flex-child(1) { @include flex-auto; }
  @include flex-child(2) { @include flex-fill; max-width: 50rem; }
}
```

**Notes:** `nth-child` counts every element child, including hidden ones.

#### `flex-children`

**What it does:** styles all direct children from the parent's stylesheet (`> * { … }`). Takes a content block. **No parameters.**

```scss
.cards { @include flex-children { padding: 1rem; border: 1px solid #ddd; } }
```

---

### 6.5 Item mixins

Include these in the stylesheet of the **child** element.

#### `flex-item($grow: 0, $shrink: 1, $basis: auto)`

**What it does:** the `flex` shorthand with named parameters.

| Parameter | Type | Default | Accepted values | Effect |
|---|---|---|---|---|
| `$grow` | number ≥ 0 | `0` | `0`, `1`, `2`… | How much of the free space the item takes, relative to its siblings. `0` = never grows |
| `$shrink` | number ≥ 0 | `1` | `0`, `1`… | How much the item shrinks when space is short. `0` = never shrinks |
| `$basis` | length, `%`, `auto`, `content`, `0` | `auto` | `20rem`, `30%`, `auto`… | Starting size along the main axis before growing/shrinking. `auto` = use the item's own width/height or its content |

```scss
.thing { @include flex-item(1, 0, 20rem); }   // flex: 1 0 20rem
```

#### `flex-fill`

**What it does:** the item takes **all the space left over** by its siblings along the main axis. **No parameters.**

**Generates:** `flex: 1 1 0%; min-width: 0; min-height: 0;` (the zero minimums let it shrink below its content size instead of overflowing).

#### `flex-full`

**What it does:** a "full" element: it takes the **whole line** along the main axis and stretches to the full cross size of its parent. In a wrapping row it sits alone on its line. **No parameters.**

**Generates:** `flex: 0 0 100%; align-self: stretch; min-width: 0; min-height: 0;`

**Difference from `flex-fill`:** `flex-fill` adapts to its siblings (they keep their size, it takes what remains). `flex-full` claims the entire line: siblings wrap below it, or get squeezed if the parent does not wrap.

#### `flex-auto`

**What it does:** the item is sized by its content and never grows or shrinks. **No parameters.**

**Generates:** `flex: 0 0 auto;`

#### `flex-span($span, $of: 12, $gap: 0)`

**What it does:** the item occupies `$span` of `$of` equal columns, like a 12-column grid, taking the gaps into account.

| Parameter | Type | Default | Accepted values | Effect |
|---|---|---|---|---|
| `$span` | positive integer | required | `1`…`$of` | Number of columns the item spans |
| `$of` | positive integer | `12` | any positive integer | Total number of columns in the virtual grid |
| `$gap` | Sass length | `0` | must equal the parent's gap, e.g. `1rem` | Gap used by the parent. The item width is `(100% − gaps) / $of * $span + gaps inside the span`, so that spans plus gaps add up to exactly 100% |

```scss
.article__main    { @include flex-span(8, 12, $gap: 1rem); }
.article__sidebar { @include flex-span(4, 12, $gap: 1rem); }
```

**Generates:** `flex: 0 0 <size>; max-width: <size>;` (with `$gap: 0` and `4 of 12`: `33.3333333333%`).

**Notes:** the parent should wrap (`flex-container(row, $wrap: true, $gap: 1rem)`) so spans that exceed the total move to the next line.

#### `flex-self($value)`

**What it does:** overrides the cross-axis alignment of this one item (`align-self`).

| Parameter | Type | Default | Accepted values | Effect |
|---|---|---|---|---|
| `$value` | alignment keyword | required | `start`, `end`, `center`, `stretch`, `baseline` (aliases `top`, `bottom`, `left`, `right`), or raw CSS such as `auto` | Value of `align-self`. In a row it controls the vertical position of this item; in a column, the horizontal one |

```scss
.badge { @include flex-self(end); }
```

#### `flex-order($mobile, $desktop: null)`

**What it does:** changes the visual position of the item among its siblings, optionally differently on desktop.

| Parameter | Type | Default | Accepted values | Effect |
|---|---|---|---|---|
| `$mobile` | integer | required | `-1`, `0`, `1`, `2`… | `order` value at all sizes (the base value). Lower values come first; the default of every item is `0` |
| `$desktop` | integer or `null` | `null` | as above; `null` = no override | `order` value from the desktop breakpoint up |

```scss
.sidebar { @include flex-order(-1, 0); }   // first on mobile, natural position on desktop
```
```css
.sidebar { order: -1; }
@media (min-width: 768px) { .sidebar { order: 0; } }
```

**Notes:** visual order does not change the DOM order or the keyboard/screen-reader order.

---

### 6.6 Visibility

#### `flex-hide-mobile`

**What it does:** hides the element below the desktop breakpoint. **No parameters.**

**Generates:** `@media (max-width: 767.98px) { display: none; }` (with the default breakpoint).

#### `flex-hide-desktop`

**What it does:** hides the element from the desktop breakpoint up. **No parameters.**

**Generates:** `@media (min-width: 768px) { display: none; }` (with the default breakpoint).

```scss
.nav__menu   { @include flex-hide-mobile; }
.nav__burger { @include flex-hide-desktop; }
```

**Notes:** if the element is itself a flex container, restrict its `display` to the visible breakpoint, otherwise a later `display: flex` overrides the `display: none`:

```scss
.nav__menu {
  @include flex-mobile  { display: none; }
  @include flex-desktop { @include flex-container(row, $gap: 1rem); }
}
```

---

## 7. Internals: the private functions

These are used by the mixins above. Their names start with `_`, which makes them **private** in Sass: you cannot call them from other files. They are documented so you can understand and safely modify the toolkit.

#### `_align($value)`

| Parameter | Type | Effect |
|---|---|---|
| `$value` | keyword, raw CSS value or `null` | Converts a toolkit keyword to its CSS value using the `$_align-keywords` map (`start` → `flex-start`, `between` → `space-between`…). `null` returns `null` (so the property is not emitted). A value not in the map is returned unchanged, which is why raw CSS values work |

#### `_wrap($value)`

| Parameter | Type | Effect |
|---|---|---|
| `$value` | boolean, keyword or CSS value | `true` → `wrap`, `false` → `nowrap`, `reverse` → `wrap-reverse`; anything else is returned unchanged |

#### `_is-vertical($direction)`

| Parameter | Type | Effect |
|---|---|---|
| `$direction` | keyword | Returns `true` for `column` and `column-reverse`, `false` otherwise. `flex-align` uses it to decide which CSS property receives `$horizontal` and which `$vertical` |

#### `_is-zero($value)`

| Parameter | Type | Effect |
|---|---|---|
| `$value` | number or `null` | Returns `true` for `null` and for zero with any unit (`0`, `0px`, `0rem`). It works because a number equals itself multiplied by zero only when it is zero. Used to skip gap arithmetic when there is no gap (`calc(100% - 0)` is invalid CSS) |

#### `_share($count, $gap: 0)`

| Parameter | Type | Default | Effect |
|---|---|---|---|
| `$count` | positive integer | required | Number of equal parts |
| `$gap` | Sass length | `0` | Gap between parts |

Returns the size of **one** of `$count` equal parts of 100%, gaps included. With no gap: `percentage(1 / count)`. With a gap: `calc((100% − gap × (count − 1)) / count)`. Used for column widths and row heights.

#### `_bp($value)`

| Parameter | Type | Effect |
|---|---|---|
| `$value` | breakpoint name, length or number | Returns a length. A name is looked up in `$flex-breakpoints` (unknown names stop compilation with an error that lists the valid ones). A unitless number is converted to px. A length is returned as is |

The map `$_align-keywords` (private) holds the keyword → CSS conversion table shown in [4.4](#44-keywords-and-which-axis-accepts-them).

---

## 8. Recipes

### 8.1 Responsive card grid

```html
<section class="product-grid">
  <article>...</article>
  <article>...</article>
</section>
```
```scss
.product-grid { @include flex-columns-at((base: 1, sm: 2, lg: 4), $gap: 1.5rem); }
```

### 8.2 Sidebar + content (stacked on mobile)

```scss
.layout {
  @include flex-direction(column, row);
  @include flex-gap(2rem);
  @include flex-desktop { @include flex-ratios(280px, 1); }   // fixed sidebar, fluid content
}
```

### 8.3 Three columns with relative sizes and a cap

```scss
.triptych {
  @include flex-gap(1.5rem);
  @include flex-ratios(1, 2, 1);
  @include flex-child(2) { max-width: 50rem; }
}
```

### 8.4 Navigation bar

```scss
.navbar { @include flex-container(row, $horizontal: between, $vertical: center, $gap: 1rem); }
.navbar__menu {
  @include flex-mobile  { display: none; }
  @include flex-desktop { @include flex-container(row, $gap: 1.5rem); }
}
.navbar__burger { @include flex-hide-desktop; }
```

### 8.5 Sticky footer page shell

```scss
.page { @include flex-container(column); min-height: 100vh; }
.page__main { @include flex-fill; }   // pushes the footer to the bottom
```

### 8.6 Card with a footer pinned to the bottom

```scss
.card { @include flex-container(column); }
.card__body { @include flex-fill; }
```

### 8.7 Dashboard filling the viewport (3 × 2), one column on mobile

```scss
.dashboard {
  @include flex-mobile  { @include flex-columns(1, $gap: 1rem); }
  @include flex-desktop { height: 100vh; @include flex-grid(3, 2, $gap: 1rem); }
}
```

### 8.8 12-column article layout

```scss
.article { @include flex-container(row, $wrap: true, $gap: 1rem); }

.article__main {
  @include flex-full;                                       // full width on mobile
  @include flex-desktop { @include flex-span(8, 12, $gap: 1rem); }
}
.article__sidebar {
  @include flex-full;
  @include flex-desktop { @include flex-span(4, 12, $gap: 1rem); }
}
```

### 8.9 Form row: label to content, input fills

```scss
.form-row {
  @include flex-container(row, $vertical: center, $gap: 1rem);
  label { @include flex-auto; }
  input { @include flex-fill; }
}
```

### 8.10 Different alignment per layout

```scss
.toolbar {
  @include flex-direction(column, row);
  @include flex-mobile  { @include flex-align(center, start, column); }
  @include flex-desktop { @include flex-align(start, center, row); }
}
```

### 8.11 Self-adapting tiles, no breakpoints

```scss
.tiles { @include flex-auto-columns(14rem, $gap: 1rem, $max-width: 24rem); }
```

---

## 9. Gotchas

**Pass `$direction` to `flex-align` for column containers.** Otherwise horizontal and vertical are swapped ([4.2](#42-what-the-toolkit-does)). `flex-container` does this for you.

**Alignment does not follow a responsive direction change automatically.** Include `flex-align` once per direction ([4.6](#46-alignment-when-the-direction-changes-with-the-breakpoint)).

**Omitted is not `start`.** An omitted axis keeps the browser default (`stretch` for items) ([4.5](#45-omitting-a-value-is-not-the-same-as-start)).

**`between`, `around`, `evenly` on the cross axis are invalid** ([4.4](#44-keywords-and-which-axis-accepts-them)).

**Percentage heights need a definite height.** `flex-rows`, `flex-grid` with `$rows`, `flex-full` in a column, and `flex-ratios` in a column all resolve sizes against the container's height. Give the container a `height`, or a `min-height` inside a parent with a set height.

**Parent-generated child rules have low specificity.** `.parent > *` has the same specificity as a single class. If the child's own stylesheet sets `flex`, `max-width` etc., the rule that comes **later in the compiled CSS** wins. To override a specific column reliably, use `flex-child(n)` in the parent or increase specificity in the child.

**`row-reverse` and `column-reverse` flip start and end.** `flex-align(start, …)` means "at the start of the flow", which is the right edge in `row-reverse`.

**`nth-child` counts everything.** `flex-ratios` and `flex-child` count all element children, including hidden ones.

**Sass lengths for gaps.** `flex-columns`, `flex-rows`, `flex-grid`, `flex-columns-at` and `flex-span` need `$gap` as a Sass length. CSS variables and `calc()` strings fail there. Only `flex-gap`, `flex-container` and `flex-auto-columns` accept arbitrary values.

**Ascending order in `flex-columns-at`.** Media blocks are emitted in the order of the map. Keep `base` first, then breakpoints from small to large.

**`flex-ratios` and `flex-columns` both size children.** Include only one of them on the same parent, or the later one overrides the earlier one.

**`@use` configuration is first-come.** `@use ... with (...)` only works the first time the module is loaded in a compilation. Edit the defaults in the file for a project-wide setting.

**The default breakpoints are conventions, not measurements** ([5.2](#52-where-the-values-come-from)). Adjust them to your design.

---

## 10. Troubleshooting

**`Undefined mixin` when compiling.**
The file did not `@use` the toolkit, or the path is wrong. Add `@use "../config/flex" as *;` at the top, before other rules.

**`Can't find stylesheet to import`.**
The path is relative to the current file. Fix it, or add the `scss/` folder to the compiler's load path and use `@use "config/flex" as *;`.

**`This module was already loaded, so it can't be configured using "with"`.**
Another file loaded the toolkit first. Remove `with (...)` and edit the defaults at the top of `_flex.scss`.

**`flex: unknown breakpoint`.**
The name is not a key in `$flex-breakpoints`. Check spelling, add the key, or pass a length (`flex-from(900px)`).

**Compiler error about `math.div`, `@use` or `sass:` modules.**
You are using libsass / node-sass. Switch to Dart Sass (the `sass` package on npm).

**Items are aligned on the wrong axis.**
The container is a column but `flex-align` was called without `$direction: column`, or the direction changes with the breakpoint ([4.6](#46-alignment-when-the-direction-changes-with-the-breakpoint)).

**Alignment has no visible effect.**
The items already fill the axis (no free space), the keyword is not valid on that axis ([4.4](#44-keywords-and-which-axis-accepts-them)), or another rule later in the CSS sets the same property.

**Columns overflow or wrap earlier than expected.**
The gap you gave to the mixin must equal the real gap. With `flex-span`, pass the same `$gap` the parent uses. Also check for `margin` on the children.

**Items ignore `flex-ratios` proportions.**
Long unbreakable content can widen a column; the toolkit adds `min-width: 0`, but the content may need `overflow-wrap: anywhere` or `overflow: hidden`. Also check for another rule setting `flex` or `width` on the children with equal or higher specificity.

**A `flex-rows` / `flex-grid` layout collapses.**
The container has no definite height. Add `height` (or `min-height` inside a sized parent).

**`display: none` from `flex-hide-*` is overridden.**
A later `display: flex` on the same element wins. Restrict `display` to the visible breakpoint, as in [6.6](#66-visibility).

---

## 11. Cheat sheet

### Media

| Mixin | Purpose |
|---|---|
| `flex-from($bp) { }` | `min-width` |
| `flex-below($bp) { }` | `max-width` (breakpoint excluded) |
| `flex-between($from, $to) { }` | range |
| `flex-mobile { }` / `flex-desktop { }` | below / from the desktop breakpoint |

### Parent

| Mixin | Purpose |
|---|---|
| `flex-container($direction, $wrap, $gap, $horizontal, $vertical, $inline)` | all-in-one container |
| `flex-direction($mobile, $desktop)` | direction, optionally different on desktop |
| `flex-wrap($wrap)` | wrapping |
| `flex-gap($column, $row)` | gaps |
| `flex-align($horizontal, $vertical, $direction)` | alignment on both axes |
| `flex-align-lines($value)` | `align-content` |
| `flex-center($direction)` | centre everything |
| `flex-columns($count, $gap, $max-width)` | N equal columns |
| `flex-rows($count, $gap)` | N rows, filled top to bottom |
| `flex-grid($columns, $rows, $gap, $row-gap, $max-width)` | columns and rows |
| `flex-columns-at($map, $gap, $max-width)` | columns per breakpoint |
| `flex-auto-columns($min, $gap, $max-width)` | self-adapting columns |
| `flex-ratios($r1, $r2, ...)` | relative / fixed / auto sizes |
| `flex-children-max($width, $height)` | max size of all children |
| `flex-child($n) { }` | style the n-th child |
| `flex-children { }` | style all children |

### Item

| Mixin | Purpose |
|---|---|
| `flex-item($grow, $shrink, $basis)` | `flex` shorthand |
| `flex-fill` | take the remaining space |
| `flex-full` | take the whole line and stretch |
| `flex-auto` | size to content |
| `flex-span($span, $of, $gap)` | N of 12 columns |
| `flex-self($value)` | `align-self` |
| `flex-order($mobile, $desktop)` | visual order |
| `flex-hide-mobile` / `flex-hide-desktop` | visibility |

### Alignment keywords

`start` · `center` · `end` · `between` · `around` · `evenly` · `stretch` · `baseline` (aliases: `left`/`top` = start, `right`/`bottom` = end)

### Horizontal / vertical mapping

| Direction | `$horizontal` → | `$vertical` → |
|---|---|---|
| `row`, `row-reverse` | `justify-content` | `align-items` |
| `column`, `column-reverse` | `align-items` | `justify-content` |

### Default breakpoints

`sm` 576px · `md` 768px (desktop starts here) · `lg` 1024px · `xl` 1280px · `xxl` 1536px
