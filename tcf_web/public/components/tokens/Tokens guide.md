# Brand tokens

`tokens/tokens.css` publishes the brand values as plain CSS custom properties, so code that cannot `@use` the scss partials can still follow the brand. The first user is the tcf_hr Vue app.

```css
@import "/assets/tcf_web/components/tokens/tokens.css";
```

It is loaded the same way in `www/base.html`. The file stands alone: it does not include `base.css` and sets no element rules.

## What it holds

| Group | Names |
|---|---|
| Palette | `--tcf-light-*`, `--tcf-dark-*`, `--tcf-accent-*` (same names as `palette/_palette.scss`) |
| Roles | `--tcf-primary-deep/medium/light`, `--tcf-surface`, `--tcf-background`: switch with `prefers-color-scheme` |
| Shape | `--tcf-slant` (10deg, from `elements-defaults`), `--tcf-radius` (0: slants, no rounded corners) |
| Spacing | `--tcf-space-xs … xxl`, the distances login-card already uses |
| Breakpoint | `--tcf-desktop-min-width`: for scripts. CSS writes `768px` in `@media` itself |
| Motion | `--tcf-motion-fast/base/slow` (150/300/500 ms), `--tcf-ease-out`, `--tcf-ease-in-out` |
| Typefaces | The `--tf-*` set and the per-language `:lang()` overrides, copied from the typography engine |

## Rules

- `tokens.scss` is the source and `tokens.css` is its compiled output. Edit the partials, then recompile. The scss and css must stay in step.
- A new brand value goes into the partial first, then into `tokens.scss`.
- The typeface block is a copy of the start of `base.css`. After a typography change, recompile both.
- Slanted elements: skew by `var(--tcf-slant)` and counter-skew the content, so the Vue app matches the website.
