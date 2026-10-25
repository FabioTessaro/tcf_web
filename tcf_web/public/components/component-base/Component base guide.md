# Developing with `component-base.js`

## 1. What you get

`component-base.js` is the shared plumbing for the site's web components (Shadow DOM + jQuery). Each component (`<nav-bar>`, `<navbar-toggle>`, `<portal-button>`, ...) uses it instead of carrying its own copy of the same code. It gives you:

- **Path and tag detection:** where the component's files are, and which tag name it registers.
- **File loading:** html, css and svg fetched once for all instances, plus the component's `.i18n.js`.
- **Shadow root helpers:** stylesheet, boot style (hidden until built).
- **Events:** the standard event, with `waitUntil`.
- **Links:** boosted navigation for `<a>` tags inside a shadow root.
- **Localization:** translating a component's own shadow root.

It knows nothing about any particular component. A component built on it works anywhere, with or without a `<nav-bar>` around it.

## 2. Files and setup

One file, in its own folder, included once in the `<head>`:

| File | Role |
|---|---|
| `component-base.js` | All the helpers, exposed as `window.ComponentBase` (frozen). |

jQuery (3 or later) must load first, then `component-base.js`, then the components. Without jQuery, `component-base.js` throws and creates nothing. A component that finds no `ComponentBase` should throw too, with a message that says what to load.

```html
<script src="/path/jquery.min.js"></script>
<script src="/path/component-base/component-base.js"></script>
<script src="/path/navbar/navbar.js"></script>
<script src="/path/navbar-toggle/navbar-toggle.js"></script>
```

Including it twice is harmless: the second run does nothing.

## 3. Writing a component

A component is one folder with five files, and only its `.js` is included in pages:

| File | Role |
|---|---|
| `my-card.js` | Behaviour. |
| `my-card.html` | Markup placed inside the shadow root. |
| `my-card.scss` / `my-card.css` | Styles of the shadow root (you compile the scss). |
| `my-card.i18n.js` | Strings, if the component has any text. Optional. |

This skeleton is tested, and it is the shape every component follows. The component's top element in the HTML is `.my-card-container`.

```js
(function () {
	"use strict";

	if (typeof window.ComponentBase !== "object") {
		throw new Error("[my-card] ComponentBase was not found. Load jQuery and then component-base.js first.");
	}

	var $ = window.jQuery;
	var here = ComponentBase.locate("my-card"); // tag "my-card" (or data-tag), files next to my-card.js

	// Fetched once for all instances. "i18n" runs my-card.i18n.js before the first build.
	var load = ComponentBase.bundleLoader(
		{
			html: here.sibling("my-card.html"),
			css: here.sibling("my-card.css"),
			i18n: here.sibling("my-card.i18n.js"),
		},
		[],
		null,
		"my-card"
	);

	class MyCard extends HTMLElement {
		constructor() {
			super();
			this._ns = ComponentBase.namespace("my-card");
			this._built = false;
			this._loading = null;
			this._root = this.attachShadow({ mode: "open" });
			ComponentBase.hold(this._root); // invisible until html + css are in place
		}

		connectedCallback() {
			var self = this;
			if (this._built) {
				this._activate();
				return;
			}
			if (this._loading) {
				return; // still loading; the pending callback will activate
			}
			this._loading = load()
				.then(function (res) {
					self._build(res);
				})
				.catch(function (err) {
					console.error(err);
				})
				.then(function () {
					self._loading = null;
				});
		}

		disconnectedCallback() {
			ComponentBase.unwatchLanguage(this._ns);
			this._top().off(this._ns);
		}

		_top() {
			// jQuery cannot bind events on the ShadowRoot itself, so use the top element inside it
			return $(this._root).find(".my-card-container").first();
		}

		_build(res) {
			ComponentBase.applyStyle(this._root, res.css);
			$(this._root).append($.parseHTML(res.html));
			ComponentBase.release(this._root);
			this._built = true;
			if (this.isConnected) {
				this._activate();
			}
		}

		// Runs on every connect: bind to the top element, never to document delegation
		_activate() {
			var $top = this._top();
			ComponentBase.bindLinks($top, this._ns); // links keep the boosted navigation
			ComponentBase.translate($top);
			ComponentBase.watchLanguage(this._ns, $top);
		}
	}

	ComponentBase.define(here.tag, MyCard);
})();
```

What each part does:

- **`locate`** runs first, while the script's top level executes. The tag name is the first argument (or the `data-tag` of the script tag, so it can be renamed).
- **`bundleLoader`** returns a function. Calling it any number of times fetches the files once. A failed load is not cached, so the next call tries again.
- **`hold` and `release`** keep the host invisible while it loads, so users never see an unstyled flash.
- **`_built` and `_loading`** make `connectedCallback` safe to run many times: moving the element rebinds without rebuilding.
- **Binding in `_activate`, undoing in `disconnectedCallback`** means nothing leaks and nothing depends on delegation from `document`. Handlers survive htmx page swaps, because they live on the component itself.

A component that has no text skips the `i18n` key and the three localization calls. One that has no links skips `bindLinks`.

## 4. API reference

### Location and registration

| Call | Does |
|---|---|
| `ComponentBase.locate(name, defaultTag)` | Returns `{ name, tag, src, sibling(path) }`. `tag` is the script's `data-tag`, else `defaultTag`, else `name`. `sibling(path)` is the URL of a file next to the script and keeps `?v=...`. Throws if the tag is not a valid custom element name. Call it synchronously at the top of the component's js. |
| `ComponentBase.define(tag, Class)` | `customElements.define`, but it warns instead of throwing when the tag already exists. |

### Loading files

| Call | Does |
|---|---|
| `bundleLoader(urls, optional, transform, label)` | Returns `load()`, a function that returns a cached Promise of `{ html, css, ... }`. `urls` is `{ key: url }`. `optional` lists the keys that only warn when missing. `transform(bundle)` may clean up the result (for example an svg). `label` prefixes messages. |
| `loadBundle(urls, optional, label)` | The same, without the cache. |
| `fetchText(url, label)` | One text file, as a Promise. |
| `loadScript(url, label)` | One script, as a Promise. A script runs once per URL however many components ask for it. |
| `applyStyle(root, cssText)` | Puts a stylesheet into a shadow root (constructable sheet, `<style>` fallback). |
| `hold(root, css)`, `release(root)` | Hide the component while it loads (default css `:host{visibility:hidden}`), then show it. |

The `i18n` key in a bundle is special. It is the component's `.i18n.js`, which is run as a script instead of being fetched as text, so its strings are registered before the component first translates itself. A missing file, or a page without `$.localization`, only warns.

### Events

| Call | Does |
|---|---|
| `emit(source, name, detail, cancelable)` | Dispatches a standard event and returns `{ event, canceled, pending }`. It bubbles and is `composed`, so it crosses shadow roots and works with both `addEventListener` and jQuery. Every event gets `detail.waitUntil(promise)`, which only has an effect on cancelable events. |
| `detailOf(e)` | The detail of a native or jQuery event. |

### Links and localization

See sections 5 and 6.

### Small helpers

| Call | Does |
|---|---|
| `namespace(name)` | A unique jQuery event namespace per instance, like `.my-card3`. |
| `rafThrottle(fn)` | Runs `fn` at most once per animation frame. |
| `setAttrIfChanged(el, name, value)` | Sets an attribute only when the value differs, so observers are not woken for nothing. |

## 5. Links inside a shadow root

htmx cannot see `<a>` tags inside a shadow root. Without help, every link would reload the whole page, and the splash and partial page swap would be lost.

`ComponentBase.bindLinks($top, ns)` fixes that. For a plain left click on a same-origin link it calls `$.navigation.navigateTo(url)`, exactly like a boosted link.

Left to the browser, as normal links:

- modified clicks (Ctrl, Cmd, Shift, Alt) and non-left buttons
- `target="_blank"` and `download`
- links to another origin
- hash-only links on the current page
- anything with `hx-boost="false"` on the link or on an ancestor inside the shadow root (the Desk link, for example)

Without `$.navigation` it does nothing, so links stay normal links. Handlers are delegated on `$top`, so links added later are covered, and calling it again on every connect is safe.

## 6. Localization inside a shadow root

`$.localization` translates the document only and does not enter shadow roots. A component translates itself:

- `ComponentBase.translate(target)` translates an element once i18next is ready, or immediately if it already is.
- `ComponentBase.watchLanguage(ns, target)` translates it again on every language switch (`app:languagechange`).
- `ComponentBase.unwatchLanguage(ns)` stops that. Call it from `disconnectedCallback`.

Pass the component's top element inside the shadow root, not the `ShadowRoot` itself. All three do nothing when `$.localization` is missing, so labels keep their default text.

## 7. Rules that keep components reusable

- **Speak events directly.** A component can dispatch a standard event (for example `navbar-request-open`) with `ComponentBase.emit` or a plain `CustomEvent`. Outside a navbar nobody answers, and nothing breaks.
- **Treat everything except jQuery as optional.** No `$.navigation` means normal links. No `$.localization` means default text. A `navbar-role` attribute that nobody reads does nothing.
- **Keep component-specific code in the component.** `NavbarComponent.request` stays in `navbar.js`. The base only holds what two or more components share.

## 8. Gotchas

- **jQuery ignores shadow roots as event targets.** `.on()` on a `ShadowRoot` silently does nothing, and `.empty()` and `.html()` do nothing there too. Use `.find()` on it, build once, and bind on an element inside it (or on the host).
- **Call `locate` at the top level.** `document.currentScript` only exists while a script's top level runs. If it is missing, `locate` falls back to finding a script tag named `<name>.js`, so keep file names equal to the component name.
- **`.i18n.js` needs `$.localization` loaded first.** Otherwise it is skipped with a warning.
- **The bundle is cached per page load.** Changed files need a new `?v=` on the component's script tag.
- **Namespaces carry sub-namespaces.** `bindLinks` and `watchLanguage` add `.links` and `.i18n` to the instance namespace, so a plain `.off(ns)` removes them along with the component's own handlers. Their own removal calls only touch their own handlers.
- **The object is frozen.** To add a helper, edit `component-base.js`, not `window.ComponentBase`.
- **Use `.then`/`.catch`.** The whole code base uses promise chains rather than `async`/`await`. Keep that style.