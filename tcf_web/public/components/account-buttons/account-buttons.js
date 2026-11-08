/*!
 * <account-buttons>: the account buttons of the navbar (Login, or Desk and HR, or Account), as a self-contained web component
 * (Shadow DOM + jQuery)
 *
 * FILES (one folder; only account-buttons.js is included in pages)
 *   account-buttons.js        this file
 *   account-buttons.html      structure, placed inside the shadow root
 *   account-buttons.css       all styles of the shadow root (compiled from account-buttons.scss)
 *   account-buttons.i18n.js   the labels; loaded by this file, so it is never included by hand
 *
 * USAGE (jQuery >= 3, then component-base.js, must be loaded first; otherwise this script throws and registers nothing.
 *        localization.js is optional: without it the labels stay empty, as before)
 *   <script src="/path/to/jquery.min.js"></script>
 *   <script src="/path/to/component-base/component-base.js"></script>
 *   <script src="/path/to/account-buttons/account-buttons.js"></script>
 *   <nav-bar>
 *     <account-buttons navbar-role="utility"></account-buttons>
 *     ...
 *   </nav-bar>
 *
 * WHAT IT DOES
 *   It renders one button per entry in $.api.session.entries. The SERVER decides the list (tcf_web.api.session,
 *   built from the hook tcf_web_account_entries), so the navbar never invents access: an entry that is not in the
 *   list (for example Desk outside the company network) is simply not drawn.
 *     guest        one entry "login": link to the login page with the current page as return target
 *     logged in    whatever the server returns, e.g. Desk and HR for an employee, or Account (/me)
 *   Each entry is { key, href, icon, label, boost }. href must be a same-origin path, anything else is dropped.
 *   The entries are applied when frappe:ready or frappe:session-changed fires, after htmx page changes
 *   (htmx:afterSettle, htmx:historyRestore), and when the component connects. The login link's return target is
 *   refreshed on popstate / hashchange and just before the user interacts (pointer, focus, context menu).
 *   Desktop and mobile variants are kept in sync; CSS shows one of them.
 *   navbar-role="utility" is set on the tag so the navbar puts it in its top row / mobile footer.
 *
 * Links keep the boosted navigation (splash, page swap) through ComponentBase.bindLinks, because htmx cannot see
 * links inside a shadow root. Entries with boost=false (Desk, HR) have hx-boost="false", which bindLinks leaves to the browser.
 * The component fires no events of its own; every link carries data-account-entry (the entry key) for page CSS and scripts.
 */
(function () {
	"use strict";

	if (typeof window.ComponentBase !== "object") {
		throw new Error(
			"[account-buttons] ComponentBase was not found. Load jQuery and then component-base.js before account-buttons.js. " +
				"The account-buttons element was not registered."
		);
	}

	var $ = window.jQuery;
	var here = ComponentBase.locate("account-buttons"); // throws on an invalid data-tag
	var TAG = here.tag;

	/* ------------------------------------------------------------------ */
	/* Config                                                               */
	/* ------------------------------------------------------------------ */

	var MAIN_PAGE = "/"; // fallback when the current page can't be a return target
	var LOGIN_URL = "/login";
	var REDIRECT_PARAM = "redirect-to"; // Frappe's query parameter name
	// Desktop and mobile variants (only one is visible at a time, both are kept in sync)
	var DESKTOP_SELECTOR = ".account-buttons-desktop-container";
	var MOBILE_SELECTOR = ".account-buttons-mobile-container";
	// No space after the comma: jQuery's .find() inside a shadow tree does not return anything for selectors with
	// whitespace or combinators (seen under jsdom with jQuery 3.7.1 and 4.0.0); simple selectors and "a,b" lists work.
	var BUTTON_SELECTOR = DESKTOP_SELECTOR + "," + MOBILE_SELECTOR;

	var DESKTOP_LABEL_SELECTOR = ".account-buttons-desktop-label"; // desktop: inner label
	// mobile: the container itself carries data-i18n, so it is its own label
	var ICON_SELECTOR = ".account-buttons-desktop-icon"; // mobile has no icon

	/* ------------------------------------------------------------------ */
	/* Entries                                                              */
	/* ------------------------------------------------------------------ */

	var LOGIN_ENTRY = {
		key: "login",
		icon: "account_circle",
		label: "account-buttons:entries.login",
		boost: true,
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

	// Same-origin relative path only ("//host" and "https://..." are refused)
	function isSafeHref(href) {
		return typeof href === "string" && /^\/(?!\/)/.test(href);
	}

	// The entries to draw for a session, or null when the session is not known yet
	function getEntries(session) {
		if (!session) {
			return null;
		}
		if (session.isGuest) {
			return [LOGIN_ENTRY];
		}
		var list = Array.isArray(session.entries) ? session.entries : [];
		return list.filter(function (entry) {
			return (
				entry &&
				typeof entry.key === "string" &&
				typeof entry.label === "string" &&
				(entry.key === "login" || isSafeHref(entry.href))
			);
		});
	}

	function resolveHref(entry) {
		return entry.key === "login" ? getLoginUrl() : entry.href;
	}

	// The element that holds the translated text: the mobile button itself,
	// or the inner label of the desktop button
	function getLabel($button) {
		return $button.is(MOBILE_SELECTOR) ? $button : $button.find(DESKTOP_LABEL_SELECTOR);
	}

	/* ------------------------------------------------------------------ */
	/* Shared resources: fetched once for all instances                     */
	/* ------------------------------------------------------------------ */

	// "i18n" runs account-buttons.i18n.js (it registers the strings) before the first build
	var load = ComponentBase.bundleLoader(
		{
			html: here.sibling("account-buttons.html"),
			css: here.sibling("account-buttons.css"),
			i18n: here.sibling("account-buttons.i18n.js"),
		},
		[],
		null,
		"account-buttons"
	);

	/* ------------------------------------------------------------------ */
	/* The element                                                          */
	/* ------------------------------------------------------------------ */

	class AccountButtons extends HTMLElement {
		constructor() {
			super();
			this._ns = ComponentBase.namespace("account-buttons");
			this._built = false;
			this._loading = null;
			this._proto = null;
			this._signature = null;
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
			return $(this._root).find(".account-buttons-container").first();
		}

		_buttons() {
			return this._top().find(BUTTON_SELECTOR);
		}

		_build(res) {
			ComponentBase.applyStyle(this._root, res.css);
			$(this._root).append($.parseHTML(res.html));
			// The pair in the template is the prototype of one entry; _render clones it per entry
			var $top = this._top();
			this._proto = {
				desktop: $top.find(DESKTOP_SELECTOR).first().clone(),
				mobile: $top.find(MOBILE_SELECTOR).first().clone(),
			};
			ComponentBase.release(this._root); // reveal
			this._built = true;
			if (this.isConnected) {
				this._activate();
			}
		}

		_applyState(session) {
			var entries = getEntries(session);
			if (!entries) {
				return;
			}
			var signature = JSON.stringify(entries);
			if (signature === this._signature) {
				return; // htmx fires often; nothing to redraw
			}
			this._signature = signature;
			this._render(entries);
		}

		// Redraw one desktop + mobile pair per entry. Links are delegated on the top element, so new ones are covered.
		_render(entries) {
			var proto = this._proto;
			var $top = this._top();
			$top.empty();

			entries.forEach(function (entry) {
				[proto.desktop, proto.mobile].forEach(function (p) {
					var $button = p.clone();
					$button.attr("data-account-entry", entry.key);
					$button.attr("href", resolveHref(entry));
					if (entry.boost) {
						$button.removeAttr("hx-boost");
					} else {
						$button.attr("hx-boost", "false");
					}

					var $label = getLabel($button);
					$label.attr("data-i18n", entry.label);
					$button.find(ICON_SELECTOR).text(entry.icon || "");
					$top.append($button);
				});
			});

			ComponentBase.translate($top);
		}

		_applyCurrentSession() {
			this._applyState($.api && $.api.session);
		}

		// Only the guest href depends on the current page, so only refresh that one
		_refreshGuestHref() {
			this._buttons().filter('[data-account-entry="login"]').attr("href", getLoginUrl());
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

	ComponentBase.define(TAG, AccountButtons);
})();
