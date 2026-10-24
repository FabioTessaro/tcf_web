# Slanted elements guide

The brand is built on angled lines. The partials in `scss/visual-elements/` share one angle:

| File | Purpose |
| --- | --- |
| `_elements-defaults.scss` | Brand defaults for visual elements. Today: `$brand-slant` (10deg). New brand-wide defaults go here. |
| `_slanted-indicator.scss` | `indicator`: slanted line(s) next to hovered text. |
| `_slanted-pill.scss` | `pill`: tinted parallelogram behind text (replaces the rounded pill). |
| `_slanted-card.scss` | `card`: slanted card surface (dropdowns, popovers). |
| `_slanted-corners.scss` | `corners`: two slanted corner brackets that close into a full frame (buttons, tiles). |
| `_slanted-highlight.scss` | `highlight`: slanted highlight band that sweeps across the element (buttons, tiles). |

All five mixins skew a **pseudo-element only**, so text and content are never transformed.

---

## 1. Importing

```scss
@use "../visual-elements/slanted-indicator" as slanted;
@use "../visual-elements/slanted-pill" as slantedpill;
@use "../visual-elements/slanted-card" as slantedcard;
@use "../visual-elements/slanted-corners" as slantedcorners;
@use "../visual-elements/slanted-highlight" as slantedhighlight;
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

## 6. `corners`: corner brackets that close into a frame

Include it on the element to frame (button, tile, card). Two opposite L-shaped brackets sit on the element's corners, slanted with the brand angle. On the trigger they extend until they meet and close into a full frame, or they stop short and leave the sides open.

```scss
// Small brackets at rest, closing into a full frame on hover
.portal-button {
    @include slantedcorners.corners;
}

// Hidden at rest, open sides on hover
.tile {
    @include slantedcorners.corners($rest-length: 0, $hover-length: 70%);
}

// Other corner pair, fixed-length arms, keyboard focus too
.tile {
    @include slantedcorners.corners(
        $pair: tr-bl,
        $rest-length: 0,
        $hover-length: 1.2rem,
        $trigger: (hover, focus-visible)
    );
}
```

| Parameter | Default | Meaning |
| --- | --- | --- |
| `$slant` | `defaults.$brand-slant` | Lean angle off vertical. |
| `$lean` | `slash` | `slash` ("/") or `backslash` ("\\"). |
| `$pair` | `tl-br` | `tl-br` (top-left + bottom-right) or `tr-bl` (top-right + bottom-left). |
| `$rest-length` | `0.4rem` | Length of each bracket arm at rest. `0` hides the brackets at rest. |
| `$hover-length` | `100%` | Length of each arm when triggered. `100%` closes the full frame, anything shorter leaves the sides open. |
| `$thickness` | `1px` | Thickness of the lines. |
| `$color` | `currentColor` | Line color, so it adapts to light/dark automatically. |
| `$rest-inset` | `-0.12rem -0.5rem` | How far the frame extends past the host box at rest (CSS `inset` syntax, negative grows it). |
| `$hover-inset` | `-0.15rem -0.7rem` | The same, when triggered. Set it equal to `$rest-inset` to stop the frame growing. |
| `$duration` | `0.3s` | Transition time. |
| `$easing` | `ease` | Transition easing. |
| `$trigger` | `hover` | `hover`, `active`, `focus-visible` or `none`. A single value or a comma list. |
| `$pseudo` | `before` | `before` or `after`. |
| `$host` | `true` | Also sets `position: relative` and `isolation: isolate` on the host. |
| `$z-index` | `-1` | Stacking of the frame. Use a lower value if you need another layer (e.g. a background sweep) behind it. |

### Triggers

They work like the pill triggers:

- `hover`: wrapped in `@media (hover: hover)`, so touch devices never get a sticky hover.
- `active`: shows while pressed.
- `focus-visible`: keyboard focus only.
- `none`: emits no reveal rule. Wire the reveal yourself with the `reveal` mixin, which accepts the same hover values:

```scss
.item {
    @include slantedcorners.corners($trigger: none, $hover-length: 70%);
    &.is-selected {
        @include slantedcorners.reveal($length: 70%);   // use the same values as $hover-length / $hover-inset
    }
}
```

`reveal($length: 100%, $inset: -0.15rem -0.7rem)` only sets the two custom properties the frame reads (`--slanted-corners-length` and `--slanted-corners-inset`), so it can be used under any selector.

### How the geometry works

- The frame is four 1px gradient lines painted on the pseudo-element's background: a horizontal and a vertical arm at one corner, and the same at the opposite corner. Animating `background-size` grows them.
- The two corners cover opposite sides, so at exactly `100%` the arms meet and close the rectangle. Below it they leave gaps, and at `50%` they just touch in the middle of each side.
- A percentage is measured per axis: against the width for the horizontal arms and against the height for the vertical ones. On a wide, short button, `60%` gives long horizontal arms and short vertical ones. Use a fixed length (`1rem`) for the same arm length in both directions.
- Because the pseudo-element is skewed, the frame leans like the rest of the brand elements: the sides follow `$lean`, and the corner pair decides which corners are obtuse. With `slash`, `tl-br` puts the brackets on the obtuse corners and `tr-bl` on the acute ones, which looks sharper.
- The frame reads its length and inset from custom properties set on the host, and the trigger only changes those. The properties are inherited, but every element that includes the mixin sets its own, so nested frames don't affect each other.

### Gotchas

- **Clipping:** like the pill, the frame protrudes past the host (`$rest-inset` / `$hover-inset`, plus the skew at the corners). An ancestor with `overflow: hidden` can clip it.
- **Closing at exactly `100%`:** above `100%` the lines are cut off by the element edge, so use `100%` for a full frame.
- **Soft edges:** 1px lines on a skewed element are antialiased, so the slanted sides can look slightly softer than a real border. `$thickness: 1.5px` helps.
- **Host positioning:** same as the pill. If the host is already `position: absolute/fixed/sticky`, pass `$host: false`, and make sure it creates a stacking context (`isolation: isolate`).
- **Other layers on the same element:** the frame uses `::before` by default with `z-index: -1`. A second layer on `::after`, such as `highlight` (which defaults to `z-index: -2`), stays behind it. Any other layer must use a lower `z-index`.
- **Respects `prefers-reduced-motion`.** The lines then snap to their state instead of animating.

---

## 7. `highlight`: sweeping highlight band

Include it on the element the band should run through (button, tile, link). On the trigger, a soft, slanted stripe of `currentColor` sweeps from left to right across a slanted background layer, like a reflection running over the surface. When the trigger ends, the band resets instantly, so it never sweeps backwards.

```scss
// Hover sweep behind a button
.portal-button {
    @include slantedhighlight.highlight;
}

// Faster, thinner, brighter stripe, keyboard focus too
.tile {
    @include slantedhighlight.highlight(
        $duration: 0.35s,
        $half-width: 6%,
        $intensity: 30%,
        $trigger: (hover, focus-visible)
    );
}

// Paired with corners (corners on ::before, highlight on ::after)
.portal-button {
    @include slantedcorners.corners;
    @include slantedhighlight.highlight($host: false);   // corners already sets the host
}
```

| Parameter | Default | Meaning |
| --- | --- | --- |
| `$slant` | `defaults.$brand-slant` | Lean angle off vertical. |
| `$lean` | `slash` | `slash` ("/") or `backslash` ("\\"). |
| `$color` | `currentColor` | Color of the band, so it adapts to light/dark automatically. |
| `$intensity` | `22%` | Brightness of the stripe (strength of the tint at its center). |
| `$half-width` | `10%` | Half the width of the stripe, measured against the gradient image, not the element. |
| `$image-size` | `250%` | Width of the gradient image. Raise it if you widen the stripe a lot, or the stripe can peek in at the resting position. |
| `$duration` | `0.5s` | Time the band takes to run across. Lower = faster. |
| `$easing` | `ease-in-out` | Easing of the run. `cubic-bezier(0.4, 0, 0.2, 1)` or `ease-out` feel snappier. |
| `$rest-inset` | `-0.12rem -0.5rem` | How far the layer extends past the host box at rest (CSS `inset` syntax, negative grows it). |
| `$hover-inset` | `-0.15rem -0.7rem` | The same, when triggered. |
| `$rest-radius` | `1.2rem` | Corner radius of the layer at rest. |
| `$hover-radius` | `0` | Corner radius when triggered. The layer morphs between the two. |
| `$shape-duration` | `0.3s` | Transition time of the inset and radius change. |
| `$shape-easing` | `ease` | Easing of the inset and radius change. |
| `$trigger` | `hover` | `hover`, `active`, `focus-visible` or `none`. A single value or a comma list. |
| `$pseudo` | `after` | `before` or `after`. |
| `$host` | `true` | Also sets `position: relative` and `isolation: isolate` on the host. |
| `$z-index` | `-2` | Stacking of the layer. The default keeps it behind a `corners` frame on `::before` (`-1`). |

### Triggers

They work like the pill and corners triggers:

- `hover`: wrapped in `@media (hover: hover)`, so touch devices never get a sticky hover.
- `active`: runs while pressed.
- `focus-visible`: keyboard focus only.
- `none`: emits no reveal rule. Wire the reveal yourself with the `reveal` mixin, which takes the triggered values:

```scss
.item {
    @include slantedhighlight.highlight($trigger: none);
    &.is-selected {
        @include slantedhighlight.reveal;   // pass the same $inset / $radius / $duration if you customized them
    }
}
```

`reveal($inset: -0.15rem -0.7rem, $radius: 0, $duration: 0.5s)` only sets the custom properties the layer reads (`--slanted-highlight-inset`, `--slanted-highlight-radius`, `--slanted-highlight-position` and `--slanted-highlight-duration`).

### How it works

- The band is a `linear-gradient` that is transparent everywhere except a soft stripe in the middle. The gradient image is wider than the layer (`$image-size`), and the sweep is a `background-position` transition from one end of the image to the other. At rest the stripe is parked past the left edge, and at the end it is parked past the right edge.
- The layer is skewed like the other slanted effects, so the stripe takes the brand angle.
- The "resets instantly" behavior comes from the transition time of the position, which is `0s` at rest and `$duration` while triggered. The browser uses the time of the state it is entering, so entering the trigger animates and leaving it snaps back.
- The inset and radius changes use `$shape-duration` in both directions.

### Gotchas

- **Reduced motion:** with `prefers-reduced-motion: reduce` the layer's transitions are turned off, so the band jumps straight to its end position outside the layer and no highlight is shown. The effect is skipped rather than replaced by a static tint.
- **Clipping:** like the pill, the layer protrudes past the host (`$rest-inset` / `$hover-inset`, plus the skew at the corners). An ancestor with `overflow: hidden` can clip it.
- **Host positioning:** same as the pill. If the host is already `position: absolute/fixed/sticky`, pass `$host: false`, and make sure it creates a stacking context (`isolation: isolate`).
- **Pseudo-element:** it defaults to `::after`, so it can't share an element with a single-sided `indicator`. See the combining section.

---

## 8. Combining effects on one element

An element has two pseudo-elements, so at most two of these effects can share it, one per pseudo-element.

`pill` defaults to `::before`. A single-sided `indicator` uses `::after`. They coexist:

```scss
.nav-link {
    @include slanted.indicator($side: right);
    @include slantedpill.pill($trigger: active);
}
```

`corners` also defaults to `::before`, so it pairs with a single-sided `indicator`:

```scss
.portal-button {
    @include slantedcorners.corners;
    @include slanted.indicator($side: right);
}
```

`highlight` defaults to `::after`, so it pairs with `corners` (or `pill`), which use `::before`. Pass `$host: false` to the second mixin, since the first already sets the host:

```scss
.portal-button {
    @include slantedcorners.corners;
    @include slantedhighlight.highlight($host: false);
}
```

`highlight` and a single-sided `indicator` both want `::after`, so don't combine them on one element.

Don't combine `pill` with `indicator($side: both)` on one element, because both want `::before`. The same goes for `pill` and `corners`: put them on different elements, or switch one of them to `$pseudo: after` and don't add an indicator to that element.

The same applies to `card`: inside a card, the options can use `indicator` without any clash, since they're different elements. On the card element itself, `card` uses `::before` by default, so a `corners` frame on the card needs `$pseudo: after`.

## 9. Error messages

The mixins validate keyword arguments at compile time:

```
pill: $lean must be slash or backslash, got `left`.
card: $pseudo must be before or after, got `inside`.
indicator: $side must be left, right or both, got `top`.
corners: $pair must be tl-br or tr-bl, got `top`.
corners: $lean must be slash or backslash, got `left`.
corners: $pseudo must be before or after, got `inside`.
corners: $trigger must be hover, active, focus-visible or none, got `click`.
highlight: $lean must be slash or backslash, got `left`.
highlight: $pseudo must be before or after, got `inside`.
highlight: $trigger must be hover, active, focus-visible or none, got `click`.
```