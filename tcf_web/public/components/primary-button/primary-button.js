/*
 * <primary-button>: slanted action button, Shadow DOM, jQuery.
 *
 * Depends on: jQuery (3 or later), component-base.js (load them first).
 * Optional:   $.localization (labels are i18n keys; without it the key is shown as plain text).
 *
 *   <primary-button label="login:submit" loading-label="login:submitting"></primary-button>
 *
 * Attributes (all optional except label)
 *   label            i18n key of the label (data-i18n syntax, "namespace:key").
 *   loading-label    i18n key of the label while loading. Without it the loading state cannot be activated.
 *   icon             Material Symbols name shown next to the label.
 *   icon-position    "left" (default) or "right".
 *   icon-loading     Material Symbols name shown while loading (default: keep `icon`).
 *   disabled         Boolean. Not clickable, greyed out.
 *   loading          Boolean. Not clickable, shows loading-label / icon-loading. Ignored without loading-label.
 *   type             "button" (default), "submit" or "reset". Submit/reset act on the surrounding <form>.
 *   name, value, form, formnovalidate    Like a native <button>; used when type="submit".
 *   width            Fixed width (any CSS length, a bare number means px). Page CSS on the tag still wins.
 *   grow             Boolean. Takes the free space in a flex container.
 *
 * Precedence of states: loading (when allowed) > disabled > active.
 * The class "htmx-request" on the element counts as loading (hx-indicator, hx-post on the element itself).
 *
 * Properties: label, loadingLabel, icon, iconPosition, iconLoading, type, name, value, width (strings),
 *             disabled, loading (booleans), state (read only: "active" | "disabled" | "loading"), form (read only).
 * Methods:    startLoading(), stopLoading(), enable(), disable(), click(), focus().
 * Events:     "click" (standard, composed: addEventListener and jQuery both work; never fires while
 *             disabled or loading), "primary-button:state-change" (detail: { state, previous }).
 *
 * Files in this folder: primary-button.js, .html, .scss/.css, no .i18n.js (the strings belong to the page).
 */
(function () {
	"use strict";

	if (typeof window.ComponentBase !== "object") {
		throw new Error(
			"[primary-button] ComponentBase was not found. Load jQuery and then component-base.js first."
		);
	}

	var $ = window.jQuery;
	var here = ComponentBase.locate("primary-button");

	// Fetched once for all instances.
	var load = ComponentBase.bundleLoader(
		{
			html: here.sibling("primary-button.html"),
			css: here.sibling("primary-button.css"),
			i18n: here.sibling("primary-button.i18n.js"),
		},
		[],
		null,
		"primary-button"
	);

	var STATE_EVENT = "primary-button:state-change";
	var RIPPLE_FALLBACK_MS = 1500; // the ripple animation normally ends the effect itself
	var RIPPLE_ANIMATIONS = ["slanted-ripple-run", "slanted-ripple-fade"];

	// property name -> attribute name
	var STRING_PROPS = {
		label: "label",
		loadingLabel: "loading-label",
		icon: "icon",
		iconPosition: "icon-position",
		iconLoading: "icon-loading",
		type: "type",
		name: "name",
		value: "value",
		width: "width",
	};

	function clean(value) {
		return value === null || value === undefined ? "" : String(value).trim();
	}

	// Set an attribute only when it differs; null removes it.
	function setAttr(el, name, value) {
		if (value === null || value === undefined) {
			if (el.hasAttribute(name)) {
				el.removeAttribute(name);
			}
		} else if (el.getAttribute(name) !== String(value)) {
			el.setAttribute(name, String(value));
		}
	}

	function reducedMotion() {
		return !!(
			window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches
		);
	}

	// "0.35s" / "350ms" / "0.35s, 0.2s" -> milliseconds of the first value
	function toMs(cssTime) {
		var first = clean(String(cssTime).split(",")[0]);
		var n = parseFloat(first);
		if (isNaN(n)) {
			return 0;
		}
		return /ms$/.test(first) ? n : n * 1000;
	}

	class PrimaryButton extends HTMLElement {
		static get observedAttributes() {
			return [
				"label",
				"loading-label",
				"icon",
				"icon-position",
				"icon-loading",
				"disabled",
				"loading",
				"type",
				"name",
				"value",
				"form",
				"formnovalidate",
				"width",
				"class", // htmx-request
			];
		}

		constructor() {
			super();
			this._ns = ComponentBase.namespace("primary-button");
			this._built = false;
			this._loading = null; // the pending bundle load (see component-base guide)
			this._state = undefined; // last rendered state
			this._proxy = null; // hidden native button used for type="submit" / "reset"
			this._renderQueued = false;
			this._widthTimer = null;
			this._rippleTimer = null;
			this._warned = false;
			this._root = this.attachShadow({ mode: "open", delegatesFocus: true });
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
			this._finishWidth();
			window.clearTimeout(this._rippleTimer);
			this._top().removeAttr("data-ripple");
		}

		attributeChangedCallback(name, oldValue, newValue) {
			if (oldValue === newValue || !this._built) {
				return;
			}
			if (name === "width") {
				this._applyWidth();
				return;
			}
			this._queueRender();
		}

		// ---------------------------------------------------------------------
		// Public API
		// ---------------------------------------------------------------------

		get state() {
			return this._computeState();
		}

		get disabled() {
			return this.hasAttribute("disabled");
		}

		set disabled(value) {
			this.toggleAttribute("disabled", !!value);
		}

		get loading() {
			return this._computeState() === "loading";
		}

		set loading(value) {
			if (!value) {
				this.removeAttribute("loading");
				return;
			}
			if (!this._canLoad()) {
				this._warnNoLoadingLabel();
				return;
			}
			this.setAttribute("loading", "");
		}

		get form() {
			return this._proxy ? this._proxy.form : this.closest("form");
		}

		// Returns true when the button is now loading, false when it cannot (no loading-label).
		startLoading() {
			this.loading = true;
			return this._canLoad();
		}

		stopLoading() {
			this.loading = false;
		}

		disable() {
			this.disabled = true;
		}

		enable() {
			this.disabled = false;
		}

		// Goes through the same guard as a real click (no click while disabled or loading).
		click() {
			var inner = this._top()[0];
			if (inner) {
				inner.click();
			} else {
				HTMLElement.prototype.click.call(this);
			}
		}

		// ---------------------------------------------------------------------
		// Internals
		// ---------------------------------------------------------------------

		_top() {
			// jQuery cannot bind events on the ShadowRoot itself, so use the top element inside it
			return $(this._root).find(".primary-button-container").first();
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
			var self = this;
			var $top = this._top();

			$top.off(this._ns);
			$top.on("click" + this._ns, function (e) {
				self._onClick(e);
			});
			$top.on("pointerdown" + this._ns, function (e) {
				self._onPointerDown(e);
			});
			$top.on("animationend" + this._ns, function (e) {
				self._onAnimationEnd(e);
			});
			$top.on("transitionend" + this._ns, function (e) {
				self._onTransitionEnd(e);
			});

			this._applyWidth();
			this._render(false);
			ComponentBase.translate($top);
			ComponentBase.watchLanguage(this._ns, $top);

			// transitions stay off until the first frame is painted
			window.requestAnimationFrame(function () {
				$top.attr("data-ready", "");
			});
		}

		_canLoad() {
			return clean(this.getAttribute("loading-label")) !== "";
		}

		_warnNoLoadingLabel() {
			if (!this._warned) {
				this._warned = true;
				console.warn(
					"[primary-button] loading was requested but there is no loading-label, so the loading state stays off.",
					this
				);
			}
		}

		_computeState() {
			var wantsLoading =
				this.hasAttribute("loading") || this.classList.contains("htmx-request");
			if (wantsLoading) {
				if (this._canLoad()) {
					return "loading";
				}
				this._warnNoLoadingLabel();
			}
			return this.hasAttribute("disabled") ? "disabled" : "active";
		}

		_applyWidth() {
			var width = clean(this.getAttribute("width"));
			if (/^\d+(\.\d+)?$/.test(width)) {
				width += "px";
			}
			if (width) {
				this.style.setProperty("--primary-button-width", width);
			} else {
				this.style.removeProperty("--primary-button-width");
			}
		}

		// Several attribute changes in the same task become one render.
		_queueRender() {
			var self = this;
			if (this._renderQueued) {
				return;
			}
			this._renderQueued = true;
			Promise.resolve()
				.then(function () {
					self._renderQueued = false;
					if (self._built && self.isConnected) {
						self._render(true);
					}
				})
				.catch(function (err) {
					console.error(err);
				});
		}

		// Returns true when the key changed. The text is the key itself until i18next translates it.
		_setLabelText(el, key) {
			if (el._primaryButtonKey === key) {
				return false;
			}
			el._primaryButtonKey = key;
			if (key) {
				el.setAttribute("data-i18n", key);
				el.textContent = key;
			} else {
				el.removeAttribute("data-i18n");
				el.textContent = "";
			}
			return true;
		}

		_setGlyph(el, name) {
			if (el.textContent !== name) {
				el.textContent = name;
			}
		}

		// Puts everything on screen for the current attributes. animate = morph from the previous look.
		_render(animate) {
			var self = this;
			var $top = this._top();
			if (!$top.length) {
				return;
			}
			var top = $top[0];

			var label = clean(this.getAttribute("label"));
			var loadingLabel = clean(this.getAttribute("loading-label"));
			var icon = clean(this.getAttribute("icon"));
			var iconLoading = clean(this.getAttribute("icon-loading"));
			var position =
				clean(this.getAttribute("icon-position")).toLowerCase() === "right"
					? "right"
					: "left";
			var state = this._computeState();
			var previous = this._state;
			var isLoading = state === "loading";

			var $wrap = $top.find(".primary-button-label");
			var $labelRest = $top.find(".primary-button-label-rest");
			var $labelLoading = $top.find(".primary-button-label-loading");
			var $slot = $top.find(".primary-button-icon");
			var $glyphRest = $top.find(".primary-button-icon-rest");
			var $glyphLoading = $top.find(".primary-button-icon-loading");

			// the resting icon stays while loading unless icon-loading replaces it
			var restVisible = !!icon && !(isLoading && !!iconLoading);
			var loadingVisible = isLoading && !!iconLoading;

			var canAnimate = !!animate && top.hasAttribute("data-ready") && !reducedMotion();

			this._withWidthAnimation($wrap, canAnimate, function () {
				var changed = self._setLabelText($labelRest[0], label);
				changed = self._setLabelText($labelLoading[0], loadingLabel) || changed;

				self._setGlyph($glyphRest[0], icon);
				self._setGlyph($glyphLoading[0], iconLoading);
				$glyphRest.toggleClass("is-visible", restVisible);
				$glyphLoading.toggleClass("is-visible", loadingVisible);
				$slot.toggleClass("is-empty", !(restVisible || loadingVisible));

				setAttr(top, "data-state", state);
				setAttr(top, "data-icon-position", position);
				// a real disabled button never fires click; loading keeps focus and is guarded in _onClick
				top.disabled = state === "disabled";
				setAttr(top, "aria-disabled", isLoading ? "true" : null);
				setAttr(top, "aria-busy", isLoading ? "true" : null);

				if (changed) {
					ComponentBase.translate($top); // inside, so the width is measured with the final text
				}
			});

			this._syncProxy(state);
			this._state = state;

			if (previous !== undefined && previous !== state) {
				ComponentBase.emit(this, STATE_EVENT, { state: state, previous: previous });
			}
		}

		// Runs mutate() and, when the label wrapper ends up with another width, morphs the width.
		// The layers inside cross-fade through CSS; only the width needs measuring.
		_withWidthAnimation($wrap, animate, mutate) {
			var wrap = $wrap[0];
			if (!wrap || !animate) {
				mutate();
				this._finishWidth();
				return;
			}

			var from = wrap.getBoundingClientRect().width; // what is on screen now, also mid-animation
			wrap.style.transition = "none";
			wrap.style.width = "";
			wrap.removeAttribute("data-animating");
			mutate();
			var to = wrap.getBoundingClientRect().width; // forces layout with the final content

			if (Math.abs(from - to) < 0.5) {
				wrap.style.transition = "";
				this._finishWidth();
				return;
			}

			wrap.style.width = from + "px";
			wrap.setAttribute("data-animating", "");
			void wrap.offsetWidth; // commit the starting width
			wrap.style.transition = "";
			wrap.style.width = to + "px";

			window.clearTimeout(this._widthTimer);
			var wait = toMs(window.getComputedStyle(wrap).transitionDuration) + 100;
			this._widthTimer = window.setTimeout(this._finishWidth.bind(this), wait);
		}

		_finishWidth() {
			window.clearTimeout(this._widthTimer);
			var wrap = this._top().find(".primary-button-label")[0];
			if (wrap) {
				wrap.style.transition = "";
				wrap.style.width = "";
				wrap.removeAttribute("data-animating");
			}
		}

		_onTransitionEnd(e) {
			var oe = e.originalEvent || e;
			if (oe.propertyName === "width" && $(oe.target).hasClass("primary-button-label")) {
				this._finishWidth();
			}
		}

		// -------------------------------------------------------------------
		// Click, forms, ripple
		// -------------------------------------------------------------------

		_onClick(e) {
			if (this._computeState() !== "active") {
				// loading (a disabled native button never gets here): swallow, so no one downstream reacts
				e.preventDefault();
				e.stopImmediatePropagation();
				return;
			}
			if (this._proxy) {
				// Forms: let a real submit/reset button do it, so validation, the submit event,
				// htmx, the submitter name/value and preventDefault() in click handlers all behave natively.
				// The proxy lives in the light DOM, so its click bubbles through this element
				// for addEventListener and jQuery handlers; this one is stopped to avoid a double click.
				e.preventDefault();
				e.stopPropagation();
				this._proxy.click();
			}
			// type="button": the click leaves the shadow root as it is (composed) and reaches the page.
		}

		// A native submit/reset button in the light DOM. Needed because a button inside a shadow root
		// is not part of the form, and because Enter inside a text field only submits through a
		// real submit button ("implicit submission"). Disabled while the button is not active, which
		// also blocks Enter-to-submit while loading.
		_syncProxy(state) {
			var type = clean(this.getAttribute("type")).toLowerCase();
			if (type !== "submit" && type !== "reset") {
				if (this._proxy) {
					this._proxy.remove();
					this._proxy = null;
				}
				return;
			}

			var proxy = this._proxy;
			if (!proxy) {
				proxy = document.createElement("button");
				proxy.setAttribute("tabindex", "-1");
				proxy.setAttribute("aria-hidden", "true");
				proxy.setAttribute("data-primary-button-proxy", "");
				proxy.style.cssText =
					"position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;" +
					"clip:rect(0 0 0 0);clip-path:inset(50%);opacity:0;pointer-events:none;white-space:nowrap;";
				this.appendChild(proxy);
				this._proxy = proxy;
			}

			if (proxy.type !== type) {
				proxy.type = type;
			}
			setAttr(proxy, "name", this.hasAttribute("name") ? this.getAttribute("name") : null);
			setAttr(
				proxy,
				"value",
				this.hasAttribute("value") ? this.getAttribute("value") : null
			);
			setAttr(proxy, "form", this.hasAttribute("form") ? this.getAttribute("form") : null);
			if (this.hasAttribute("formnovalidate")) {
				proxy.setAttribute("formnovalidate", "");
			} else {
				proxy.removeAttribute("formnovalidate");
			}
			proxy.disabled = state !== "active";
		}

		// Touch and pen play the ripple; the mouse gets the hover highlight, the keyboard the focus highlight.
		_onPointerDown(e) {
			var oe = e.originalEvent || e;
			if (!oe.pointerType || oe.pointerType === "mouse") {
				return;
			}
			if (this._computeState() !== "active") {
				return;
			}
			var top = this._top()[0];
			var surface = $(top).find(".primary-button-surface")[0];
			var rect = top.getBoundingClientRect();
			// The ripple layer is the surface box (inset by the slant overhang), measured from its own corner.
			var x = oe.clientX - rect.left - (surface ? surface.offsetLeft : 0);
			var y = oe.clientY - rect.top;

			top.style.setProperty("--slanted-ripple-x", x + "px");
			top.style.setProperty("--slanted-ripple-y", y + "px");
			top.removeAttribute("data-ripple");
			void top.offsetWidth; // restart the animation on a quick second tap
			top.setAttribute("data-ripple", "");

			window.clearTimeout(this._rippleTimer);
			this._rippleTimer = window.setTimeout(function () {
				top.removeAttribute("data-ripple");
			}, RIPPLE_FALLBACK_MS);
		}

		_onAnimationEnd(e) {
			var oe = e.originalEvent || e;
			if (RIPPLE_ANIMATIONS.indexOf(oe.animationName) !== -1) {
				window.clearTimeout(this._rippleTimer);
				this._top().removeAttr("data-ripple");
			}
		}
	}

	// label, loading-label, icon, ... as string properties that reflect their attributes
	Object.keys(STRING_PROPS).forEach(function (prop) {
		var attribute = STRING_PROPS[prop];
		Object.defineProperty(PrimaryButton.prototype, prop, {
			configurable: true,
			get: function () {
				return this.getAttribute(attribute) || "";
			},
			set: function (value) {
				if (value === null || value === undefined || value === "") {
					this.removeAttribute(attribute);
				} else {
					this.setAttribute(attribute, String(value));
				}
			},
		});
	});

	ComponentBase.define(here.tag, PrimaryButton);
})();
