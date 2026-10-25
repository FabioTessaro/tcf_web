/*!
 * <portal-button>: the login / portal / desk button of the navbar, as a self-contained web component
 * (Shadow DOM + jQuery)
 *
 * FILES (one folder; only portal-button.js is included in pages)
 *   portal-button.js        this file
 *   portal-button.html      structure, placed inside the shadow root
 *   portal-button.css       all styles of the shadow root (compiled from portal-button.scss)
 *   portal-button.i18n.js   the labels; loaded by this file, so it is never included by hand
 *
 * USAGE (jQuery >= 3, then component-base.js, must be loaded first; otherwise this script throws and registers nothing.
 *        localization.js is optional: without it the labels stay empty, as before)
 *   <script src="/path/to/jquery.min.js"></script>
 *   <script src="/path/to/component-base/component-base.js"></script>
 *   <script src="/path/to/portal-button/portal-button.js"></script>
 *   <nav-bar>
 *     <portal-button navbar-role="utility"></portal-button>
 *     ...
 *   </nav-bar>
 *
 * WHAT IT DOES
 *   It follows the session ($.api.session):
 *     guest        icon account_circle, label "Login",  link to the login page with the current page as return target
 *     portalUser   icon globe,          label "Portal", link to /portal
 *     deskUser     icon apps,           label "Desk",   link to /desk, a full page load (hx-boost="false")
 *   The state is applied when frappe:ready or frappe:session-changed fires, after htmx page changes
 *   (htmx:afterSettle, htmx:historyRestore), and when the component connects. The login link's return target is
 *   refreshed on popstate / hashchange and just before the user interacts (pointer, focus, context menu).
 *   Desktop and mobile variants are kept in sync; CSS shows one of them.
 *   navbar-role="utility" is set on the tag so the navbar puts it in its top row / mobile footer.
 *
 * Links keep the boosted navigation (splash, page swap) through ComponentBase.bindLinks, because htmx cannot see
 * links inside a shadow root. The Desk link has hx-boost="false", which bindLinks leaves to the browser.
 * The component fires no events of its own; every link carries data-portal-state for page CSS and scripts.
 */
(function () {
	"use strict";

	if (typeof window.ComponentBase !== "object") {
		throw new Error(
			"[portal-button] ComponentBase was not found. Load jQuery and then component-base.js before portal-button.js. " +
				"The portal-button element was not registered."
		);
	}

	var $ = window.jQuery;
	var here = ComponentBase.locate("portal-button"); // throws on an invalid data-tag
	var TAG = here.tag;

	/* ------------------------------------------------------------------ */
	/* Config                                                               */
	/* ------------------------------------------------------------------ */

	var MAIN_PAGE = "/"; // fallback when the current page can't be a return target
	var LOGIN_URL = "/login";
	var REDIRECT_PARAM = "redirect-to"; // Frappe's query parameter name
	var PORTAL_URL = "/portal";
	var DESK_URL = "/desk";
	var DESK_ROLE = "Desk User";

	// Desktop and mobile variants (only one is visible at a time, both are kept in sync)
	var DESKTOP_SELECTOR = ".portal-button-desktop-container";
	var MOBILE_SELECTOR = ".portal-button-mobile-container";
	// No space after the comma: jQuery's .find() inside a shadow tree does not return anything for selectors with
	// whitespace or combinators (seen under jsdom with jQuery 3.7.1 and 4.0.0); simple selectors and "a,b" lists work.
	var BUTTON_SELECTOR = DESKTOP_SELECTOR + "," + MOBILE_SELECTOR;

	var DESKTOP_LABEL_SELECTOR = ".portal-button-desktop-label"; // desktop: inner label
	// mobile: the container itself carries data-i18n, so it is its own label
	var ICON_SELECTOR = ".portal-button-desktop-icon"; // mobile has no icon

	/* ------------------------------------------------------------------ */
	/* States                                                               */
	/* ------------------------------------------------------------------ */

	// href may be a function so it is evaluated when applied, not at load time
	var STATES = {
		guest: {
			i18n: "portal-button:guest",
			icon: "account_circle",
			href: getLoginUrl,
			boost: true,
		},
		portalUser: {
			i18n: "portal-button:loggedUser.portalUser",
			icon: "globe",
			href: PORTAL_URL,
			boost: true,
		},
		deskUser: {
			i18n: "portal-button:loggedUser.deskUser",
			icon: "apps",
			href: DESK_URL,
			boost: false, // Desk is a different app: full page load, not htmx
		},
	};

	/* ------------------------------------------------------------------ */
	/* Helpers (no DOM, shared by every instance)                           */
	/* ------------------------------------------------------------------ */

	function getReturnPath() {
		// Current page as a same-origin relative URL
		var path = window.location.pathname + window.location.search + window.location.hash;

		// Collapse leading slashes so "//host" can never be read as an external URL
		path = path.replace(/^\/+/, "/");

		// Never return to the login page itself (would loop)
		var pathname = window.location.pathname;
		if (pathname === LOGIN_URL || pathname.indexOf(LOGIN_URL + "/") === 0) {
			return MAIN_PAGE;
		}
		return path || MAIN_PAGE;
	}

	function getLoginUrl() {
		return LOGIN_URL + "?" + REDIRECT_PARAM + "=" + encodeURIComponent(getReturnPath());
	}

	function getStateName(session) {
		if (!session) {
			return null;
		} // session not known yet: leave the buttons alone
		if (session.isGuest) {
			return "guest";
		}
		var roles = Array.isArray(session.roles) ? session.roles : [];
		return roles.indexOf(DESK_ROLE) !== -1 ? "deskUser" : "portalUser";
	}

	function resolveHref(state) {
		return typeof state.href === "function" ? state.href() : state.href;
	}

	// The element that holds the translated text: the mobile button itself,
	// or the inner label of the desktop button
	function getLabel($button) {
		return $button.is(MOBILE_SELECTOR) ? $button : $button.find(DESKTOP_LABEL_SELECTOR);
	}

	/* ------------------------------------------------------------------ */
	/* Shared resources: fetched once for all instances                     */
	/* ------------------------------------------------------------------ */

	// "i18n" runs portal-button.i18n.js (it registers the strings) before the first build
	var load = ComponentBase.bundleLoader(
		{
			html: here.sibling("portal-button.html"),
			css: here.sibling("portal-button.css"),
			i18n: here.sibling("portal-button.i18n.js"),
		},
		[],
		null,
		"portal-button"
	);

	/* ------------------------------------------------------------------ */
	/* The element                                                          */
	/* ------------------------------------------------------------------ */

	class PortalButton extends HTMLElement {
		constructor() {
			super();
			this._ns = ComponentBase.namespace("portal-button");
			this._built = false;
			this._loading = null;
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
			var ns = this._ns;
			ComponentBase.unwatchLanguage(ns);
			$(document).off(ns);
			$(window).off(ns);
			this._top().off(ns);
			if (this._onFocusIn) {
				this._top()[0].removeEventListener("focusin", this._onFocusIn);
			}
		}

		/* ---------------- internals ---------------- */

		// jQuery cannot bind events on the ShadowRoot itself, so everything binds on the element inside it
		_top() {
			return $(this._root).find(".portal-button-container").first();
		}

		_buttons() {
			return this._top().find(BUTTON_SELECTOR);
		}

		_build(res) {
			ComponentBase.applyStyle(this._root, res.css);
			$(this._root).append($.parseHTML(res.html));
			ComponentBase.release(this._root); // reveal
			this._built = true;
			if (this.isConnected) {
				this._activate();
			}
		}

		_applyState(session) {
			var stateName = getStateName(session);
			if (!stateName) {
				return;
			}
			var state = STATES[stateName];

			this._buttons().each(function () {
				var $button = $(this);

				$button.attr("data-portal-state", stateName);
				$button.attr("href", resolveHref(state));
				if (state.boost) {
					$button.removeAttr("hx-boost");
				} else {
					$button.attr("hx-boost", "false");
				}

				var $label = getLabel($button);
				$label.attr("data-i18n", state.i18n);
				ComponentBase.translate($label);

				// No-op on the mobile button (no icon element)
				$button.find(ICON_SELECTOR).text(state.icon);
			});
		}

		_applyCurrentSession() {
			this._applyState($.api && $.api.session);
		}

		// Only the guest href depends on the current page, so only refresh that one
		_refreshGuestHref() {
			this._buttons().filter('[data-portal-state="guest"]').attr("href", getLoginUrl());
		}

		// Runs on every connect. Everything is bound on this instance (its own namespace) and removed again on
		// disconnect, so nothing leaks and nothing depends on document delegation.
		_activate() {
			var self = this;
			var ns = this._ns;
			var sn = ns + ".session"; // own handlers; the language watch and the links use sub-namespaces of ns
			var $top = this._top();

			ComponentBase.bindLinks($top, ns); // links keep the boosted navigation
			ComponentBase.translate($top);
			ComponentBase.watchLanguage(ns, $top);

			// 1. Session became available / changed (login, logout)
			// 2. The page changed or the buttons were re-rendered by htmx
			$(document)
				.off(sn)
				.on("frappe:ready" + sn, function (event, session) {
					self._applyState(session);
				})
				.on("frappe:session-changed" + sn, function (event, session) {
					self._applyState(session);
				})
				.on("htmx:afterSettle" + sn + " htmx:historyRestore" + sn, function () {
					self._applyCurrentSession();
				});
			$(window)
				.off(sn)
				.on("popstate" + sn + " hashchange" + sn, function () {
					self._refreshGuestHref();
				});

			// 3. Just before the user interacts (covers click, tap, middle-click, copy link)
			$top.off(sn).on(
				"pointerenter" + sn + " pointerdown" + sn + " contextmenu" + sn,
				BUTTON_SELECTOR,
				function () {
					self._refreshGuestHref();
				}
			);

			// ... and keyboard focus. This one is a native listener: jQuery 3 simulates a delegated focusin at the
			// document, where the event has been retargeted to the shadow host, so it never reaches handlers bound
			// inside the shadow root.
			var top = $top[0];
			if (!this._onFocusIn) {
				this._onFocusIn = function (e) {
					if ($(e.target).closest(BUTTON_SELECTOR).length) {
						self._refreshGuestHref();
					}
				};
			}
			top.removeEventListener("focusin", this._onFocusIn);
			top.addEventListener("focusin", this._onFocusIn);

			// 4. The session was already available before this instance connected
			this._applyCurrentSession();
		}
	}

	ComponentBase.define(TAG, PortalButton);
})();
