/*!
 * <navbar-button>: a text link of the navbar menu, as a self-contained web component (Shadow DOM + jQuery)
 *
 * FILES (one folder; only navbar-button.js is included in pages)
 *   navbar-button.js        this file
 *   navbar-button.html      structure, placed inside the shadow root
 *   navbar-button.css       all styles of the shadow root (compiled from navbar-button.scss)
 *   navbar-button.i18n.js   the labels; loaded by this file, so it is never included by hand
 *
 * USAGE (jQuery >= 3, then component-base.js, must be loaded first; otherwise this script throws and registers nothing.
 *        localization.js is optional: without it the labels keep their default text)
 *   <script src="/path/to/jquery.min.js"></script>
 *   <script src="/path/to/component-base/component-base.js"></script>
 *   <script src="/path/to/navbar-button/navbar-button.js"></script>
 *   <nav-bar>
 *     <navbar-button href="/" i18n="navbar-button:home.label">Home</navbar-button>
 *     <navbar-button href="/contacts" i18n="navbar-button:contacts.label">Contacts</navbar-button>
 *   </nav-bar>
 *
 * ATTRIBUTES
 *   href           where the link goes (both the desktop and the mobile link).
 *   i18n           the data-i18n key of the label, e.g. "navbar-button:home.label".
 *   navbar-role    optional. The navbar treats an element without a role as a menu button, which is what this is.
 *   All of them can change at any time.
 *   The text between the tags is the default label: it is what shows until a translation replaces it, or
 *   always when there is no i18n attribute or no $.localization.
 *
 * Links keep the boosted navigation (splash, page swap) through ComponentBase.bindLinks, because htmx cannot see
 * links inside a shadow root. The component fires no events of its own.
 */
(function () {
	"use strict";

	if (typeof window.ComponentBase !== "object") {
		throw new Error(
			"[navbar-button] ComponentBase was not found. Load jQuery and then component-base.js before navbar-button.js. " +
				"The navbar-button element was not registered."
		);
	}

	var $ = window.jQuery;
	var here = ComponentBase.locate("navbar-button"); // throws on an invalid data-tag
	var TAG = here.tag;

	/* ------------------------------------------------------------------ */
	/* Configuration                                                        */
	/* ------------------------------------------------------------------ */

	var HREF_ATTR = "href";
	var I18N_ATTR = "i18n";
	var LABEL_SELECTOR = ".navbar-button-label"; // the desktop link and the mobile link

	/* ------------------------------------------------------------------ */
	/* Shared resources: fetched once for all instances                     */
	/* ------------------------------------------------------------------ */

	// "i18n" runs navbar-button.i18n.js (it registers the strings) before the first build
	var load = ComponentBase.bundleLoader(
		{
			html: here.sibling("navbar-button.html"),
			css: here.sibling("navbar-button.css"),
			i18n: here.sibling("navbar-button.i18n.js"),
		},
		[],
		null,
		"navbar-button"
	);

	/* ------------------------------------------------------------------ */
	/* The element                                                          */
	/* ------------------------------------------------------------------ */

	class NavbarButton extends HTMLElement {
		static get observedAttributes() {
			return [HREF_ATTR, I18N_ATTR];
		}

		constructor() {
			super();
			this._ns = ComponentBase.namespace("navbar-button");
			this._built = false;
			this._loading = null;
			this._fallback = ""; // the default label: the text between the tags
			this._root = this.attachShadow({ mode: "open" });
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
			ComponentBase.unwatchLanguage(this._ns);
			this._top().off(this._ns);
		}

		attributeChangedCallback() {
			if (this._built) {
				this._sync();
			}
		}

		/* ---------------- internals ---------------- */

		// jQuery cannot bind events on the ShadowRoot itself, so everything binds on the element inside it
		_top() {
			return $(this._root).find(".navbar-button-container").first();
		}

		_build(res) {
			this._fallback = (this.textContent || "").trim();
			ComponentBase.applyStyle(this._root, res.css);
			$(this._root).append($.parseHTML(res.html));
			ComponentBase.release(this._root); // reveal
			this._built = true;
			this._sync();
			if (this.isConnected) {
				this._activate();
			}
		}

		// Copy href and the i18n key onto both links. Without a key the label is just the default text.
		_sync() {
			var $top = this._top();
			var $labels = $top.find(LABEL_SELECTOR);
			var href = this.getAttribute(HREF_ATTR);
			var key = this.getAttribute(I18N_ATTR);

			if (href !== null) {
				$labels.attr("href", href);
			}
			if (key) {
				$labels.attr("data-i18n", key);
			} else {
				$labels.removeAttr("data-i18n");
			}
			$labels.text(this._fallback); // default text first; a translation replaces it
			ComponentBase.translate($top);
		}

		// Runs on every connect: bind to the top element, never to document delegation
		_activate() {
			var $top = this._top();
			ComponentBase.bindLinks($top, this._ns); // links keep the boosted navigation
			ComponentBase.translate($top);
			ComponentBase.watchLanguage(this._ns, $top);
		}
	}

	ComponentBase.define(TAG, NavbarButton);
})();
