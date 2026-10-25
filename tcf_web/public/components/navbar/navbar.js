/*!
 * <nav-bar>: self-contained navbar web component (Shadow DOM + jQuery)
 *
 * FILES (one folder; only navbar.js is included in pages, after jQuery and component-base.js)
 *   navbar.js        this file
 *   navbar.html      structure, placed inside the shadow root
 *   navbar.css       all styles of the shadow root
 *   navbar-logo.svg  the logo
 *   The plumbing it shares with the other components (file loading, stylesheet, events, tag/path detection)
 *   lives in component-base/component-base.js.
 *
 * USAGE (jQuery >= 3 and then component-base.js must be loaded first, otherwise this script throws and
 * registers nothing)
 *   <script src="/path/to/jquery.min.js"></script>
 *   <script src="/path/to/component-base/component-base.js"></script>
 *   <script src="/path/to/navbar/navbar.js"></script>
 *   <nav-bar>
 *     <your-open-icon  navbar-role="toggle-open"></your-open-icon>
 *     <your-close-icon navbar-role="toggle-close"></your-close-icon>
 *     <your-menu-button></your-menu-button>                            (role "menu" is the default)
 *     <your-language-switcher navbar-role="utility"></your-language-switcher>
 *   </nav-bar>
 * Everything inside <nav-bar> is yours: the navbar only places the children and talks to them through
 * attributes and events. Nothing is built in for buttons or icons.
 *
 * The element cannot literally be <navbar>: custom element names need a hyphen. To rename it:
 *   <script src="navbar.js" data-tag="my-navbar"></script>
 *
 * ROLES (attribute navbar-role on each child of <nav-bar>)
 *   menu          (default) desktop: bottom row.  mobile: menu list, stacked vertically
 *   utility       desktop: top row (language, portal login).  mobile: bottom of the menu
 *   toggle-open   mobile only: the component that opens the menu (console warning if missing)
 *   toggle-close  mobile only: the component that closes the menu (console warning if missing)
 *   Use `hidden` to remove a child. The navbar writes navbar-placement and navbar-layout on every child.
 *   A toggle that should receive focus when the other one is pressed needs to be focusable
 *   (attachShadow({delegatesFocus: true}) or tabindex).
 *
 * <nav-bar> attributes: breakpoint (px, default 768), scroll-threshold (px, default 8), close-on-action="false",
 *   expanded (open state). Written by the component: layout, scrolled, ready.
 *
 * EVENTS: native CustomEvents (bubbles, composed). With jQuery the payload is e.detail. Names: NavbarComponent.events
 *   your components -> navbar  (NavbarComponent.request(el, 'open'|'close'|'toggle') -> Promise,
 *                               NavbarComponent.emit(el, 'navbar-action', {keepOpen: true}))
 *     navbar-request-open | -close | -toggle, navbar-action
 *   navbar -> page:
 *     navbar-ready {layout}                     navbar-layout-changed {layout, previous}
 *     navbar-opening / navbar-closing {reason}  CANCELABLE: e.preventDefault(), or e.detail.waitUntil(promise) (reject = veto)
 *     navbar-opened / navbar-closed {reason}    navbar-scrolled-changed {scrolled}
 *     navbar-settled {expanded} (animation done) navbar-language-changed {language, base, previous}
 *     navbar-buttons-changed {layout, counts}   navbar-resize {height}
 *
 * API (promises): nav.whenReady(), nav.open(reason) / close() / toggle() -> {expanded, changed, cancelled, reason},
 *   nav.when('opened') -> detail of the next event. Getters: expanded, layout, scrolled, language, height.
 *
 * STYLING: navbar.css. State hooks on .navbar-container: data-layout, data-expanded, data-scrolled, data-lang,
 *   data-lang-base. Page-level: nav-bar[layout|expanded|scrolled|ready], ::part(...), --navbar-* variables,
 *   --navbar-height (top bar height) on :root.
 */
(function () {
	"use strict";

	if (window.NavbarComponent) {
		return;
	}

	/* ------------------------------------------------------------------ */
	/* Dependencies: jQuery (checked by component-base.js) + ComponentBase  */
	/* ------------------------------------------------------------------ */

	if (typeof window.ComponentBase !== "object") {
		throw new Error(
			"[navbar] ComponentBase was not found. Load jQuery and then component-base.js before navbar.js. " +
				"The navbar element was not registered."
		);
	}

	/* ------------------------------------------------------------------ */
	/* Where am I loaded from? (all sibling files are resolved from here)   */
	/* ------------------------------------------------------------------ */

	var here = ComponentBase.locate("navbar", "nav-bar"); // throws on an invalid data-tag
	var TAG = here.tag;
	var sibling = here.sibling;

	(function ($) {
		/* -------------------------------------------------------------- */
		/* The contract shared with every navbar component                  */
		/* -------------------------------------------------------------- */

		var EVENTS = {
			// requests: a component asks the navbar to do something (see NavbarComponent.request)
			REQUEST_OPEN: "navbar-request-open",
			REQUEST_CLOSE: "navbar-request-close",
			REQUEST_TOGGLE: "navbar-request-toggle",
			ACTION: "navbar-action", // "a button was used"; detail.keepOpen keeps the mobile menu open
			// notifications: the navbar tells the page what happened
			READY: "navbar-ready",
			OPENING: "navbar-opening", // cancelable + detail.waitUntil(promise)
			OPENED: "navbar-opened",
			CLOSING: "navbar-closing", // cancelable + detail.waitUntil(promise)
			CLOSED: "navbar-closed",
			SETTLED: "navbar-settled", // open/close animation finished
			LAYOUT_CHANGED: "navbar-layout-changed",
			SCROLLED_CHANGED: "navbar-scrolled-changed",
			LANGUAGE_CHANGED: "navbar-language-changed",
			BUTTONS_CHANGED: "navbar-buttons-changed",
			RESIZE: "navbar-resize",
		};

		var ROLES = {
			MENU: "menu", // default: desktop bottom row / mobile underbar (main)
			UTILITY: "utility", // language switcher, portal login: desktop top row / mobile underbar footer
			TOGGLE_OPEN: "toggle-open", // mobile: the icon that opens the menu (required by the user)
			TOGGLE_CLOSE: "toggle-close", // mobile: the icon that closes the menu (required by the user)
		};

		var ATTRS = {
			ROLE: "navbar-role", // written by the author on each child
			PLACEMENT: "navbar-placement", // written by the navbar on each child
			LAYOUT: "navbar-layout", // written by the navbar on each child
		};

		var DEFAULTS = { breakpoint: 768, scrollThreshold: 8 };

		// names must match the <slot name> values in navbar.html
		var SLOT_NAMES = [
			"desktop-top",
			"desktop-bottom",
			"toggle-open",
			"toggle-close",
			"mobile-underbar",
			"mobile-underbar-footer",
		];

		/* -------------------------------------------------------------- */
		/* Helpers: shared with every component through ComponentBase       */
		/* -------------------------------------------------------------- */

		var emit = ComponentBase.emit; // also exported below, as NavbarComponent.emit
		var detailOf = ComponentBase.detailOf;
		var applyStyle = ComponentBase.applyStyle;
		var rafThrottle = ComponentBase.rafThrottle;
		var setAttrIfChanged = ComponentBase.setAttrIfChanged;

		/**
		 * Ask the navbar to do something from any component inside it:
		 *     NavbarComponent.request(this, 'open').then(function (r) { r.expanded; r.changed; r.cancelled; });
		 * action: 'open' | 'close' | 'toggle'. Resolves with null if no navbar answered.
		 */
		function request(source, action, detail) {
			var d = $.extend({}, detail);
			source.dispatchEvent(
				new CustomEvent("navbar-request-" + action, {
					bubbles: true,
					composed: true,
					detail: d,
				})
			);
			return Promise.resolve(d.result || null);
		}

		var MANUAL_SLOTS =
			typeof HTMLSlotElement !== "undefined" &&
			typeof HTMLSlotElement.prototype.assign === "function";

		/* -------------------------------------------------------------- */
		/* Shared resources for <nav-bar>: fetched once for all instances    */
		/* -------------------------------------------------------------- */

		var loadNavbarBundle = ComponentBase.bundleLoader(
			{
				html: sibling("navbar.html"),
				css: sibling("navbar.css"),
				svg: sibling("./assets/navbar-logo.svg"),
			},
			["svg"],
			function (b) {
				b.svg = b.svg
					.replace(/<\?xml[\s\S]*?\?>/, "")
					.replace(/<!--[\s\S]*?-->/g, "")
					.trim();
				return b;
			},
			"navbar"
		);

		/* -------------------------------------------------------------- */
		/* The element                                                      */
		/* -------------------------------------------------------------- */

		class Navbar extends HTMLElement {
			static get observedAttributes() {
				return ["expanded", "breakpoint"];
			}

			constructor() {
				super();
				this._ns = ComponentBase.namespace("navbar");
				this._built = false;
				this._hydrating = null;
				this._ready = false;
				this._expanded = false;
				this._layout = null;
				this._scrolled = false;
				this._lang = null;
				this._height = -1;
				this._signature = "";
				this._hasToggle = { open: false, close: false };
				this._warnedToggles = false;

				// Attach the shadow root immediately: with no slots yet the light-DOM children render nothing,
				// and the boot style keeps the host invisible until html + css have been applied.
				var opts = { mode: "open" };
				if (MANUAL_SLOTS) {
					opts.slotAssignment = "manual";
				}
				this._root = this.attachShadow(opts);
				ComponentBase.hold(this._root, ":host{display:block;height:0;visibility:hidden}");
			}

			/* ---------------- lifecycle ---------------- */

			connectedCallback() {
				var self = this;
				if (this._built) {
					this._activate();
					return;
				}
				if (this._hydrating) {
					return;
				} // still loading; the pending callback will activate

				this._hydrating = loadNavbarBundle()
					.then(function (res) {
						self._build(res);
						if (self.isConnected) {
							self._activate();
						}
						self._ready = true;
						self.setAttribute("ready", "");
						self._emit(EVENTS.READY, { layout: self._layout });
						self._checkToggles();
					})
					.catch(function (err) {
						console.error(err); // stay hidden rather than show a broken bar
					});
			}

			disconnectedCallback() {
				var ns = this._ns;
				$(this).off(ns);
				$(document).off(ns);
				$(window).off(ns);
				if (this._mo) {
					this._mo.disconnect();
					this._mo = null;
				}
				if (this._ro) {
					this._ro.disconnect();
					this._ro = null;
				}
				if (this._lo) {
					this._lo.disconnect();
					this._lo = null;
				}
			}

			attributeChangedCallback(name, oldValue, newValue) {
				if (!this._built || oldValue === newValue) {
					return;
				}
				if (name === "expanded") {
					var want = this.hasAttribute("expanded");
					if (want !== this._expanded) {
						var self = this;
						this._transition(want, "attribute").then(function () {
							self._reflectExpanded();
						});
					}
				} else if (name === "breakpoint") {
					this._syncLayout();
				}
			}

			/* ---------------- public API (all promise based) ---------------- */

			get expanded() {
				return this._expanded;
			}
			get layout() {
				return this._layout;
			}
			get scrolled() {
				return this._scrolled;
			}
			get language() {
				return this._lang;
			}
			get height() {
				return this._height;
			}

			/** Resolves with the element once html/css are applied and the bar is visible. */
			whenReady() {
				var self = this;
				return this._hydrating
					? this._hydrating.then(function () {
							return self;
					  })
					: Promise.resolve(this);
			}

			/** Resolves with the detail of the next occurrence of an event: await nav.when('opened'). */
			when(name) {
				var self = this;
				if (name.indexOf("navbar-") !== 0) {
					name = "navbar-" + name;
				}
				return new Promise(function (resolve) {
					$(self).one(name, function (e) {
						resolve(detailOf(e));
					});
				});
			}

			/** Each resolves, after the animation, with { expanded, changed, cancelled, reason }. */
			open(reason) {
				return this._transition(true, reason);
			}
			close(reason) {
				return this._transition(false, reason);
			}
			toggle(reason) {
				return this._transition(!this._expanded, reason);
			}

			refresh() {
				this._distribute();
			}

			/* ---------------- build ---------------- */

			_build(res) {
				var root = this._root,
					$root = $(root);
				applyStyle(root, res.css);
				$root.append($($.parseHTML(res.html)));

				this.$nav = $root.find(".navbar-container");
				this.$topbar = $root.find(".navbar-topbar-container");
				this.$logo = $root.find(".navbar-logo-wrapper");
				this.$underbar = $root.find(".navbar-mobile-underbar-container");
				this.$toggleOpen = $root.find(".navbar-toggle-open");
				this.$toggleClose = $root.find(".navbar-toggle-close");
				if (res.svg) {
					this.$logo.html(res.svg);
				}

				this._slots = {};
				var slots = this._slots;
				SLOT_NAMES.forEach(function (n) {
					slots[n] = $root.find('slot[name="' + n + '"]')[0];
				});

				this.$nav.attr({ "data-expanded": "false", "data-scrolled": "false" });
				this._syncInert();

				ComponentBase.release(root); // reveal
				this._built = true;
			}

			/* ---------------- listeners (re-bound on every connect) ---------------- */

			_bind() {
				var self = this,
					ns = this._ns;

				// requests from components. The answer (a Promise) is put on detail.result.
				function answer(e, fn) {
					var d = detailOf(e);
					var p = fn(d.reason || "button");
					if (
						e.originalEvent &&
						e.originalEvent.detail &&
						typeof e.originalEvent.detail === "object"
					) {
						e.originalEvent.detail.result = p;
					}
				}
				$(this)
					.off(ns)
					.on(EVENTS.REQUEST_OPEN + ns, function (e) {
						answer(e, function (r) {
							return self.open(r);
						});
					})
					.on(EVENTS.REQUEST_CLOSE + ns, function (e) {
						answer(e, function (r) {
							return self.close(r);
						});
					})
					.on(EVENTS.REQUEST_TOGGLE + ns, function (e) {
						answer(e, function (r) {
							return self.toggle(r);
						});
					})
					.on(EVENTS.ACTION + ns, function (e) {
						if (!self._expanded) {
							return;
						}
						if (
							detailOf(e).keepOpen ||
							self.getAttribute("close-on-action") === "false"
						) {
							return;
						}
						self.close("action");
					});

				$(document)
					.off(ns)
					.on("keydown" + ns, function (e) {
						if (e.key === "Escape" && self._expanded) {
							self.close("escape");
						}
					});

				$(window)
					.off(ns)
					.on(
						"resize" + ns,
						rafThrottle(function () {
							self._syncLayout();
						})
					)
					.on(
						"scroll" + ns,
						rafThrottle(function () {
							self._syncScroll(true);
						})
					);

				// children added / removed / re-roled
				if (this._mo) {
					this._mo.disconnect();
				}
				var relayout = rafThrottle(function () {
					self._distribute();
				});
				this._mo = new MutationObserver(function (records) {
					for (var i = 0; i < records.length; i++) {
						var r = records[i];
						if (
							r.type === "childList"
								? r.target === self
								: r.target.parentNode === self
						) {
							relayout();
							return;
						}
					}
				});
				this._mo.observe(this, {
					childList: true,
					subtree: true,
					attributes: true,
					attributeFilter: [ATTRS.ROLE, "hidden"],
				});

				// page language changes (i18next etc. set <html lang>)
				if (this._lo) {
					this._lo.disconnect();
				}
				this._lo = new MutationObserver(function () {
					self._syncLang(true);
				});
				this._lo.observe(document.documentElement, {
					attributes: true,
					attributeFilter: ["lang"],
					subtree: true,
				});

				// the top bar's height (drives --navbar-topbar-height and --navbar-height)
				if (this._ro) {
					this._ro.disconnect();
				}
				if (window.ResizeObserver) {
					this._ro = new ResizeObserver(function () {
						self._syncHeight();
					});
					this._ro.observe(this.$topbar[0]);
				}
			}

			_activate() {
				this._bind();
				this._syncLayout();
				this._syncScroll(false);
				this._syncLang(false);
				if (this.hasAttribute("expanded")) {
					var self = this;
					this._transition(true, "attribute").then(function () {
						self._reflectExpanded();
					});
				}
				this._syncHeight();
			}

			/* ---------------- state ---------------- */

			_emit(name, detail) {
				return emit(this, name, detail, false).event;
			}

			_syncLayout() {
				var bp = parseInt(this.getAttribute("breakpoint"), 10);
				if (!(bp > 0)) {
					bp = DEFAULTS.breakpoint;
				}
				var layout = window.matchMedia("(min-width: " + bp + "px)").matches
					? "desktop"
					: "mobile";
				if (layout === this._layout) {
					return;
				}

				var previous = this._layout;
				this._layout = layout;
				this.$nav.attr("data-layout", layout);
				this.setAttribute("layout", layout);

				if (layout === "desktop" && this._expanded) {
					this._transition(false, "layout");
				}
				this._distribute();
				if (previous) {
					this._emit(EVENTS.LAYOUT_CHANGED, { layout: layout, previous: previous });
				}
			}

			_syncScroll(emitEvent) {
				var th = parseInt(this.getAttribute("scroll-threshold"), 10);
				if (isNaN(th)) {
					th = DEFAULTS.scrollThreshold;
				}
				var scrolled = $(window).scrollTop() > th;
				if (scrolled === this._scrolled) {
					return;
				}
				this._scrolled = scrolled;
				this.$nav.attr("data-scrolled", String(scrolled));
				if (scrolled) {
					this.setAttribute("scrolled", "");
				} else {
					this.removeAttribute("scrolled");
				}
				if (emitEvent !== false) {
					this._emit(EVENTS.SCROLLED_CHANGED, { scrolled: scrolled });
				}
			}

			_syncLang(emitEvent) {
				var $src = $(this).closest("[lang]");
				var lang = ($src.length ? $src.attr("lang") : document.documentElement.lang) || "";
				if (lang === this._lang) {
					return;
				}
				var previous = this._lang;
				this._lang = lang;
				var base = lang.split("-")[0].toLowerCase();
				this.$nav.attr({ "data-lang": lang, "data-lang-base": base });
				if (lang) {
					this.$nav.attr("lang", lang);
				} else {
					this.$nav.removeAttr("lang");
				}
				if (emitEvent !== false && previous !== null) {
					this._emit(EVENTS.LANGUAGE_CHANGED, {
						language: lang,
						base: base,
						previous: previous,
					});
				}
			}

			_syncHeight() {
				var h = Math.round(this.$topbar[0].getBoundingClientRect().height);
				if (h === this._height || h === 0) {
					return;
				}
				this._height = h;
				this.$nav[0].style.setProperty("--navbar-topbar-height", h + "px"); // used by navbar.css for the underbar height
				document.documentElement.style.setProperty("--navbar-height", h + "px"); // for the page (padding-top etc.)
				this._emit(EVENTS.RESIZE, { height: h });
			}

			_syncInert() {
				var ex = this._expanded;
				var set = function ($el, inert) {
					if (inert) {
						$el.attr("inert", "");
					} else {
						$el.removeAttr("inert");
					}
				};
				set(this.$underbar, !ex);
				set(this.$toggleOpen, ex); // only the icon that is currently visible can be focused / read out
				set(this.$toggleClose, !ex);
			}

			_reflectExpanded() {
				if (this._expanded !== this.hasAttribute("expanded")) {
					if (this._expanded) {
						this.setAttribute("expanded", "");
					} else {
						this.removeAttribute("expanded");
					}
				}
			}

			_result(changed, cancelled, reason) {
				return {
					expanded: this._expanded,
					changed: changed,
					cancelled: cancelled,
					reason: reason,
				};
			}

			/*
			 * open/close pipeline:
			 *   navbar-opening|closing (cancelable, waitUntil) -> state changes -> navbar-opened|closed
			 *   -> animation -> navbar-settled -> the returned Promise resolves.
			 * A handler can veto with preventDefault(), or delay/veto asynchronously with
			 * detail.waitUntil(promise) (a rejected promise vetoes). Closing because the layout
			 * switched to desktop cannot be vetoed.
			 */
			_transition(target, reason) {
				var self = this;
				reason = reason || "api";
				if (target === this._expanded) {
					return Promise.resolve(this._result(false, false, reason));
				}
				if (target && this._layout !== "mobile") {
					return Promise.resolve(this._result(false, false, reason));
				} // no menu on desktop

				var forced = reason === "layout";
				var ask = emit(
					this,
					target ? EVENTS.OPENING : EVENTS.CLOSING,
					{ reason: reason },
					!forced
				);
				if (ask.canceled) {
					return Promise.resolve(this._result(false, true, reason));
				}
				if (!forced && ask.pending.length) {
					return Promise.all(ask.pending).then(
						function () {
							return self._apply(target, reason);
						},
						function () {
							return self._result(false, true, reason);
						}
					);
				}
				return this._apply(target, reason);
			}

			_apply(target, reason) {
				if (target === this._expanded || (target && this._layout !== "mobile")) {
					return Promise.resolve(this._result(false, false, reason));
				}

				// if the user is on a toggle icon, focus follows to the icon that replaces it
				var focused = document.activeElement,
					focusRole = null;
				$(this)
					.children()
					.each(function () {
						if (this === focused) {
							focusRole = this.getAttribute(ATTRS.ROLE);
						}
					});

				this._expanded = target;
				this.$nav.attr("data-expanded", String(target));
				if (target) {
					this.setAttribute("expanded", "");
				} else {
					this.removeAttribute("expanded");
				}
				this._syncInert();

				var other =
					focusRole === ROLES.TOGGLE_OPEN
						? ROLES.TOGGLE_CLOSE
						: focusRole === ROLES.TOGGLE_CLOSE
						? ROLES.TOGGLE_OPEN
						: null;
				if (other) {
					var next = $(this).children("[" + ATTRS.ROLE + '="' + other + '"]')[0];
					if (next && typeof next.focus === "function") {
						next.focus();
					}
				}

				this._emit(target ? EVENTS.OPENED : EVENTS.CLOSED, { reason: reason });
				return this._settle(reason);
			}

			_settle(reason) {
				var self = this;
				var ms = this._animationMs();
				var done = function () {
					self._emit(EVENTS.SETTLED, { expanded: self._expanded });
					return self._result(true, false, reason);
				};
				return ms > 0
					? new Promise(function (resolve) {
							setTimeout(resolve, ms + 30);
					  }).then(done)
					: Promise.resolve().then(done);
			}

			_animationMs() {
				if (this._layout !== "mobile") {
					return 0;
				}
				var cs = window.getComputedStyle(this.$underbar[0]);
				var toMs = function (s) {
					s = (s || "").trim();
					return !s ? 0 : parseFloat(s) * (/ms$/.test(s) ? 1 : 1000) || 0;
				};
				var durations = (cs.transitionDuration || "").split(","),
					delays = (cs.transitionDelay || "").split(",");
				var max = 0;
				durations.forEach(function (d, i) {
					max = Math.max(max, toMs(d) + toMs(delays[i % delays.length]));
				});
				return max;
			}

			/* ---------------- automatic button placement ---------------- */

			_distribute() {
				if (!this._built || !this._layout) {
					return;
				}
				var self = this,
					mobile = this._layout === "mobile";

				var kids = $(this)
					.children()
					.filter(function () {
						return !/^(SCRIPT|STYLE|TEMPLATE|LINK)$/.test(this.tagName);
					})
					.toArray();

				var buckets = {},
					sig = [],
					hasOpen = false,
					hasClose = false;
				SLOT_NAMES.forEach(function (n) {
					buckets[n] = [];
				});

				kids.forEach(function (el) {
					var role = el.getAttribute(ATTRS.ROLE) || ROLES.MENU,
						p;
					if (role === ROLES.TOGGLE_OPEN) {
						hasOpen = true;
					}
					if (role === ROLES.TOGGLE_CLOSE) {
						hasClose = true;
					}

					if (el.hasAttribute("hidden")) {
						p = "hidden";
					} else if (role === ROLES.TOGGLE_OPEN) {
						p = mobile ? "toggle-open" : "hidden";
					} else if (role === ROLES.TOGGLE_CLOSE) {
						p = mobile ? "toggle-close" : "hidden";
					} else if (role === ROLES.UTILITY) {
						p = mobile ? "mobile-underbar-footer" : "desktop-top";
					} else {
						p = mobile ? "mobile-underbar" : "desktop-bottom";
					} // menu (and any unknown role)

					if (p !== "hidden") {
						buckets[p].push(el);
					}
					setAttrIfChanged(el, ATTRS.PLACEMENT, p);
					setAttrIfChanged(el, ATTRS.LAYOUT, self._layout);
					el._navbarPlacement = p;
					sig.push(p);
				});

				SLOT_NAMES.forEach(function (n) {
					var slot = self._slots[n];
					if (MANUAL_SLOTS) {
						slot.assign.apply(slot, buckets[n]);
					} else {
						buckets[n].forEach(function (el) {
							el.setAttribute("slot", n);
						});
					}
				});
				if (!MANUAL_SLOTS) {
					kids.forEach(function (el) {
						if (el._navbarPlacement === "hidden") {
							el.setAttribute("slot", "navbar-hidden");
						}
					});
				}

				this._hasToggle = { open: hasOpen, close: hasClose };
				if (this._ready) {
					this._checkToggles();
				}

				var signature = this._layout + "|" + sig.join(",");
				if (this._ready && signature !== this._signature) {
					var counts = {};
					SLOT_NAMES.forEach(function (n) {
						counts[n] = buckets[n].length;
					});
					this._emit(EVENTS.BUTTONS_CHANGED, { layout: this._layout, counts: counts });
				}
				this._signature = signature;
				this._syncHeight();
			}

			// the user must supply both toggle icons; say so (once) instead of silently having no way to open/close the menu
			_checkToggles() {
				if (this._warnedToggles || this._layout !== "mobile") {
					return;
				}
				this._warnedToggles = true;
				if (!this._hasToggle.open) {
					console.warn(
						'[navbar] mobile layout has no open-menu toggle. Add a component with navbar-role="toggle-open" inside <' +
							TAG +
							">."
					);
				}
				if (!this._hasToggle.close) {
					console.warn(
						'[navbar] mobile layout has no close-menu toggle. Add a component with navbar-role="toggle-close" inside <' +
							TAG +
							">."
					);
				}
			}
		}

		ComponentBase.define(TAG, Navbar);

		/* -------------------------------------------------------------- */
		/* Public, frozen contract for components that live in the navbar    */
		/* -------------------------------------------------------------- */

		window.NavbarComponent = Object.freeze({
			tag: TAG,
			events: Object.freeze(EVENTS),
			roles: Object.freeze(ROLES),
			attrs: Object.freeze(ATTRS),
			defaults: Object.freeze(DEFAULTS),
			emit: emit,
			request: request,
		});
	})(window.jQuery);
})();
