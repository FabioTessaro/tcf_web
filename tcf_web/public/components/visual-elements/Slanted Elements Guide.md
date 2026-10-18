# Slanted elements guide

The brand is built on angled lines. The partials in `scss/visual-elements/` share one angle:

| File | Purpose |
| --- | --- |
| `_elements-defaults.scss` | Brand defaults for visual elements. Today: `$brand-slant` (10deg). New brand-wide defaults go here. |
| `_slanted-indicator.scss` | `indicator`: slanted line(s) next to hovered text. |
| `_slanted-pill.scss` | `pill`: tinted parallelogram behind text (replaces the rounded pill). |
| `_slanted-card.scss` | `card`: slanted card surface (dropdowns, popovers). |

All three mixins skew a **pseudo-element only**, so text and content are never transformed.

---

## 1. Importing

```scss
@use "../visual-elements/slanted-indicator" as slanted;
@use "../visual-elements/slanted-pill" as slantedpill;
@use "../visual-elements/slanted-card" as slantedcard;
```

The brand angle is available as `slanted.$brand-slant` (the indicator partial forwards it), or directly:

```scss
@use "../visual-elements/elements-defaults" as defaults;
// defaults.$brand-slant
```

## 2. Brand defaults (`_elements-defaults.scss`)

Edit `$brand-slant` here to change the angle everywhere. Every mixin default follows it. To override it for a single build, configure the module the first time it is loaded:

```scss
@use "../visual-elements/elements-defaults" with ($brand-slant: 8deg);
```

Configuration only works on the first load of a module, so put it in the entry stylesheet, before anything else `@use`s the partials.

To add a new brand default, add a variable to `_elements-defaults.scss` with `!default`, then read it in a mixin as `defaults.$your-variable`. If existing consumers should also see it through `slanted.`, extend the `@forward ... show` list in `_slanted-indicator.scss`.

---

## 3. `indicator`: slanted line next to text

Include it on the hoverable element.

```scss
.menu-link {
    @include slanted.indicator;                         // right edge, brand angle
}

.menu-link {
    @include slanted.indicator($side: left);
}

.menu-link {
    @include slanted.indicator($side: both);            // line on each side
}

.menu-link {
    @include slanted.indicator($label: ".menu-link-text", $shift: 0.5rem);
}
```

| Parameter | Default | Meaning |
| --- | --- | --- |
| `$slant` | `defaults.$brand-slant` | Lean angle, "/" direction. |
| `$side` | `right` | `right`, `left` or `both`. Anything else is a compile error. |
| `$width` | `1px` | Thickness of the line. |
| `$gap` | `0.2rem` | Padding reserved between the text and the line. |
| `$shift` | `0.4rem` | How far the label moves away from the line on hover (ignored with `both`). |
| `$label` | `null` | Selector of a descendant to shift on hover. `null` = no shift. |
| `$duration` | `0.25s` | Transition time. |

Notes:

- Sets `position: relative` and padding on the host.
- Uses `::after` for a single side, and both `::before` and `::after` for `both`.
- Respects `prefers-reduced-motion`.

---

## 4. `pill`: slanted tap/hover background

Include it on the element carrying the text (link, button, list item).

```scss
// Tap pill on mobile (default trigger is :active)
.navbar-button-label {
    @include slantedpill.pill;
}

// Hover + keyboard focus, backslash lean
.tag {
    @include slantedpill.pill(
        $lean: backslash,
        $trigger: (hover, focus-visible)
    );
}

// Stronger tint
.chip {
    @include slantedpill.pill($tint: 18%);
}
```

| Parameter | Default | Meaning |
| --- | --- | --- |
| `$slant` | `defaults.$brand-slant` | Lean angle off vertical. |
| `$lean` | `slash` | `slash` ("/") or `backslash` ("\\"). |
| `$inset` | `-0.05rem -0.1rem` | How far the pill extends past the host box (CSS `inset` syntax, negative grows it). |
| `$tint` | `12%` | Strength of the `currentColor` tint, so it adapts to light/dark automatically. |
| `$duration` | `0.15s` | Fade time. |
| `$trigger` | `active` | `active`, `hover`, `focus-visible` or `none`. A single value or a comma list. |
| `$pseudo` | `before` | `before` or `after`. |
| `$host` | `true` | Also sets `position: relative` and `isolation: isolate` on the host. |

### Triggers

- `active`: shows while pressed. This is the mobile tap behavior.
- `hover`: wrapped in `@media (hover: hover)`, so touch devices never get a sticky hover.
- `focus-visible`: keyboard focus only.
- `none`: emits no reveal rule. Use it to wire the reveal yourself, e.g. to a JS-toggled class:

```scss
.item {
    @include slantedpill.pill($trigger: none);
    &.is-selected::before { opacity: 1; }
}
```

### How the geometry works

- The pill is the host's box (plus `$inset`) skewed with `skewX`. The skew pivots around the center, so the pill keeps its height and center and the text stays centered on it.
- At the vertical midline the pill's edges sit where an unskewed box's edges would, so the visual padding around the text doesn't change.
- The top-right and bottom-left corners (for `slash`) stick out by about `tan(angle) × half the height`. For a 2.75rem tall target at 10deg that's roughly 0.25rem. Keep that in mind when choosing horizontal padding and `$inset`.

### Gotchas

- **Clipping:** an ancestor with `overflow: hidden` can clip the protruding corners. Increase the horizontal `$inset` (e.g. `-0.3rem`) or relax the overflow.
- **Host positioning:** the pill is absolutely positioned, so the host must be positioned. `$host: true` takes care of it. If the host is already `position: absolute/fixed/sticky`, pass `$host: false`, and make sure it still creates a stacking context (`isolation: isolate`), or the `z-index: -1` pill can fall behind the host's own background.
- **Host transforms:** a transform on the host (e.g. `transform: scale(1.06)` on `:active`) is independent of the pill's skew. They compose normally.

---

## 5. `card`: slanted card surface

Include it on the card element. The card box stays rectangular. Only the background layer is skewed, anchored at the top corner on the side that gets pulled inward.

```scss
.language-switcher-desktop-dropdown-card {
    @include slantedcard.card($height-estimate: 8rem);
}

// "\" lean, anchored top left, no shadow
.popover {
    @include slantedcard.card($lean: backslash, $shadow-light: none, $shadow-dark: none);
}
```

| Parameter | Default | Meaning |
| --- | --- | --- |
| `$slant` | `defaults.$brand-slant` | Lean angle off vertical. |
| `$lean` | `slash` | `slash` anchors the skew at the top right, `backslash` at the top left. |
| `$height-estimate` | `8rem` | Rough card height, used for the padding compensation (below). |
| `$padding-block` | `1rem` | Top and bottom padding. |
| `$padding-anchor` | `1rem` | Base padding on the anchored side, before compensation. |
| `$padding-free` | `1rem` | Padding on the opposite side. |
| `$background-light` / `$background-dark` | `palette.$light-background` / `palette.$dark-background` | Fill per color scheme. |
| `$shadow-light` / `$shadow-dark` | `0 0.25rem 0.3rem rgba(0,0,0,.1)` / `rgba(1,1,1,.1)` | Box shadow per color scheme. Use `none` to disable. |
| `$pseudo` | `before` | `before` or `after`. |
| `$host` | `true` | Also sets `position: relative` and `isolation: isolate`. |

### Padding compensation

For a `slash` card anchored at the top right, the right edge moves left by `tan(slant) × height` by the bottom of the card, so the anchored side's padding is `$padding-anchor + tan($slant) × $height-estimate`. At 10deg and 8rem that is about 2.41rem. The opposite side needs no compensation, because the slant already gives it more room toward the bottom.

Sass can't know the card's real height, so `$height-estimate` is an estimate. Update it when you add or remove items. If it's too small, content near the bottom can touch the slanted edge. If it's too large, there's extra empty space on the anchored side.

### Things to know

- The mixin sets `padding` on the card, so apply any padding overrides after the `@include`.
- Only the background layer uses `transform-origin`. Transforms on the card itself (e.g. the open/close `scale()` animation) keep their own `transform-origin`.
- Colors come from the palette partial, imported as `../palette/palette` relative to `visual-elements/`.

---

## 6. Combining effects on one element

`pill` defaults to `::before`. A single-sided `indicator` uses `::after`. They coexist:

```scss
.nav-link {
    @include slanted.indicator($side: right);
    @include slantedpill.pill($trigger: active);
}
```

Don't combine `pill` with `indicator($side: both)` on one element, because both want `::before`. Put them on different elements, or switch the pill to `$pseudo: after` and use a single-sided indicator.

The same applies to `card`: inside a card, the options can use `indicator` without any clash, since they're different elements. On the card element itself, `card` uses `::before` by default.

## 7. Error messages

The mixins validate keyword arguments at compile time:

```
pill: $lean must be slash or backslash, got `left`.
card: $pseudo must be before or after, got `inside`.
indicator: $side must be left, right or both, got `top`.
```