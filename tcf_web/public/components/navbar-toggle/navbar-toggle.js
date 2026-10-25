/*!
 * <navbar-toggle>: the open / close icon of the navbar, as a self-contained web component (Shadow DOM + jQuery)
 *
 * FILES (one folder; only navbar-toggle.js is included in pages)
 *   navbar-toggle.js    this file
 *   navbar-toggle.html  structure, placed inside the shadow root
 *   navbar-toggle.css   all styles of the shadow root (compiled from navbar-toggle.scss)
 *
 * USAGE (jQuery >= 3, then component-base.js, must be loaded first; otherwise this script throws and registers nothing)
 *   <script src="/path/to/jquery.min.js"></script>
 *   <script src="/path/to/component-base/component-base.js"></script>
 *   <script src="/path/to/navbar-toggle/navbar-toggle.js"></script>
 *   <nav-bar>
 *     <navbar-toggle navbar-role="toggle-open"></navbar-toggle>
 *     <navbar-toggle navbar-role="toggle-close"></navbar-toggle>
 *     ...
 *   </nav-bar>
 *
 * WHAT IT DOES
 *   One element is one toggle. Its navbar-role decides what it is:
 *     toggle-open   shows "menu"  and on press asks the navbar to open   (navbar-request-open)
 *     toggle-close  shows "close" and on press asks the navbar to close  (navbar-request-close)
 *     anything else shows "menu"  and asks the navbar to toggle          (navbar-request-toggle)
 *   Attribute icon="name" replaces the icon (any Material Symbols name). The navbar places the element
 *   by its navbar-role; this component only has to carry the attribute.
 *   Pressing = a click, or Enter / Space while the icon has keyboard focus.
 *
 * It talks to the navbar only through the standard events, so it needs no <nav-bar> to exist: outside a
 * navbar nobody answers and nothing happens. It needs the typography/material-symbols mixin in its scss for the
 * icon class (see typography/material-symbols.md).
 */
(function () {
	"use strict";

	if (typeof window.ComponentBase !== "object") {
		throw new Error(
			"[navbar-toggle] ComponentBase was not found. Load jQuery and then component-base.js before navbar-toggle.js. " +
				"The navbar-toggle element was not registered."
		);
	}

	var $ = window.jQuery;
	var here = ComponentBase.locate("navbar-toggle"); // throws on an invalid data-tag
	var TAG = here.tag;

	/* ------------------------------------------------------------------ */
	/* Configuration                                                        */
	/* ------------------------------------------------------------------ */

	var ROLE_ATTR = "navbar-role";
	var ICON_ATTR = "icon";

	// role -> what a press asks the navbar to do, and which icon it shows
	var ACTIONS = { "toggle-open": "open", "toggle-close": "close" };
	var ICONS = { "toggle-open": "menu", "toggle-close": "close" };
	var DEFAULT_ACTION = "toggle";
	var DEFAULT_ICON = "menu";

	/* ------------------------------------------------------------------ */
	/* Shared resources: fetched once for all instances                     */
	/* ------------------------------------------------------------------ */

	var load = ComponentBase.bundleLoader(
		{
			html: here.sibling("navbar-toggle.html"),
			css: here.sibling("navbar-toggle.css"),
		},
		[],
		null,
		"navbar-toggle"
	);

	/* ------------------------------------------------------------------ */
	/* The element                                                          */
	/* ------------------------------------------------------------------ */

	class NavbarToggle extends HTMLElement {
		static get observedAttributes() {
			return [ROLE_ATTR, ICON_ATTR];
		}

		constructor() {
			super();
			this._ns = ComponentBase.namespace("navbar-toggle");
			this._built = false;
			this._loading = null;

			// delegatesFocus: host.focus() (which the navbar calls to hand focus from one toggle to the other)
			// lands on the focusable icon inside the shadow root.
			this._root = this.attachShadow({ mode: "open", delegatesFocus: true });
			ComponentBase.hold(this._root, ":host{display:contents;visibility:hidden}");
		}

		/* ---------------- lifecycle ---------------- */

		connectedCallback() {
			var self = this;
			if (this._built) {
				this._activate();
				return;
			}
			if (this._loading) {
				return;
			} // still loading; the pending callback will activate

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
			this._top().off(this._ns);
		}

		attributeChangedCallback() {
			if (this._built) {
				this._syncIcon();
			}
		}

		/* ---------------- internals ---------------- */

		// jQuery cannot bind events on the ShadowRoot itself, so everything binds on the element inside it
		_top() {
			return $(this._root).find(".navbar-toggle-container").first();
		}

		_build(res) {
			ComponentBase.applyStyle(this._root, res.css);
			$(this._root).append($.parseHTML(res.html));
			ComponentBase.release(this._root); // reveal
			this._built = true;
			this._syncIcon();
			if (this.isConnected) {
				this._activate();
			}
		}

		// Runs on every connect. Bound on the component's own icon, so it survives page swaps.
		_activate() {
			var self = this;
			this._top()
				.off(this._ns)
				.on("click" + this._ns, function () {
					self._press();
				})
				.on("keydown" + this._ns, function (e) {
					if (e.key !== "Enter" && e.key !== " ") {
						return;
					}
					e.preventDefault(); // Space must not scroll the page
					if (!e.originalEvent.repeat) {
						self._press();
					}
				});
		}

		_role() {
			return this.getAttribute(ROLE_ATTR);
		}

		_syncIcon() {
			var name = this.getAttribute(ICON_ATTR) || ICONS[this._role()] || DEFAULT_ICON;
			var $icon = this._top().find(".navbar-toggle-icon");
			if ($icon.text() !== name) {
				$icon.text(name);
			}
		}

		// Ask whoever is listening (the navbar) to open / close / toggle. The answer is a Promise on detail.result,
		// or null if nobody answered.
		_press() {
			var action = ACTIONS[this._role()] || DEFAULT_ACTION;
			var sent = ComponentBase.emit(this, "navbar-request-" + action, {});
			Promise.resolve(sent.event.detail.result || null)
				.then(function (r) {
					/* { expanded, changed, cancelled, reason } */
				})
				.catch(function (err) {
					console.error(err);
				});
		}
	}

	ComponentBase.define(TAG, NavbarToggle);
})();
