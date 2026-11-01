(function () {
	"use strict";

	if (typeof window.ComponentBase !== "object") {
		throw new Error(
			"[login-text-field] ComponentBase was not found. Load jQuery and then component-base.js first."
		);
	}

	var $ = window.jQuery;
	var here = ComponentBase.locate("login-text-field");
	var load = ComponentBase.bundleLoader(
		{
			html: here.sibling("login-text-field.html"),
			css: here.sibling("login-text-field.css"),
			i18n: here.sibling("login-text-field.i18n.js"),
		},
		[],
		null,
		"login-text-field"
	);

	// Error keys without a namespace ("errors.invalidEmail") are looked up in this component's own strings
	var I18N_NAMESPACE = "login-text-field";
	var inputCounter = 0;

	/*
	 * <login-text-field type="email|password">
	 *     <label>...</label>
	 *     <input name="..." autocomplete="...">
	 *     <button>...</button>        (password only, optional: forgot password)
	 * </login-text-field>
	 *
	 * Attributes (all can also be set as properties):
	 *   type    "password" adds the show/hide icon and allows the button; any other value is
	 *           copied to the input's type ("email", "text", ...).
	 *   status  "error" puts the field in the error state; anything else is the normal state.
	 *   error   i18n key of the message shown while status is "error",
	 *           e.g. "errors.invalidEmail" or "other-component:some.key".
	 *
	 * Methods:  setError(key), clearError(), focus()
	 * Props:    status, error, revealed, value, input (read only)
	 * Events:   login-text-field:statuschange    detail { status: "error" | "default", error }
	 *           login-text-field:visibilitychange detail { revealed }
	 */
	class LoginTextField extends HTMLElement {
		static get observedAttributes() {
			return ["type", "status", "error"];
		}

		constructor() {
			super();
			this._ns = ComponentBase.namespace("login-text-field");
			this._built = false;
			this._loading = null;
			this._input = null;
			this._revealed = false;
			this._renderedStatus = null;
			this._onFocusChange = this._scheduleActiveSync.bind(this);
			this._onSlotChange = this._sync.bind(this);
			this._root = this.attachShadow({ mode: "open" });
			ComponentBase.hold(this._root);
		}

		connectedCallback() {
			var self = this;
			if (this._built) {
				this._activate();
				return;
			}
			if (this._loading) {
				return;
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
			this._unbindNative();
			this._unbindInput();
		}

		attributeChangedCallback() {
			this._render();
		}

		// ---------------------------------------------------------------------
		// Public API
		// ---------------------------------------------------------------------

		get status() {
			return this._status();
		}

		set status(value) {
			if (value === "error") {
				this.setAttribute("status", "error");
			} else {
				this.removeAttribute("status");
			}
		}

		get error() {
			return this.getAttribute("error");
		}

		set error(key) {
			if (key === null || key === undefined || key === "") {
				this.removeAttribute("error");
			} else {
				this.setAttribute("error", key);
			}
		}

		get revealed() {
			return this._revealed;
		}

		set revealed(show) {
			show = !!show;
			var input = this._input;
			if (!input || this._fieldType() !== "password" || show === this._revealed) {
				return;
			}
			var start = null;
			var end = null;
			var direction = null;
			try {
				start = input.selectionStart;
				end = input.selectionEnd;
				direction = input.selectionDirection;
			} catch (e) {
				// some input types have no selection
			}
			this._revealed = show;
			this._applyInputType();
			try {
				if (start !== null) {
					input.setSelectionRange(start, end, direction);
				}
			} catch (e) {
				// ignore
			}
			this._top().toggleClass("is-revealed", show);
			ComponentBase.emit(this, "login-text-field:visibilitychange", { revealed: show });
		}

		get value() {
			return this._input ? this._input.value : "";
		}

		set value(text) {
			if (this._input) {
				this._input.value = text;
			}
		}

		get input() {
			return this._input;
		}

		// Puts the field in the error state. With a key, also chooses the message.
		// Calling it again while already in error swaps the message and replays the shake.
		setError(key) {
			var wasError = this._status() === "error";
			if (typeof key === "string" && key !== "") {
				this.setAttribute("error", key);
			}
			if (wasError) {
				this._shake();
			} else {
				this.setAttribute("status", "error");
			}
			return this;
		}

		clearError() {
			this.removeAttribute("status");
			this.removeAttribute("error");
			return this;
		}

		focus(options) {
			if (this._input) {
				this._input.focus(options);
			}
		}

		// ---------------------------------------------------------------------
		// Build and activate
		// ---------------------------------------------------------------------

		_top() {
			return $(this._root).find(".login-text-field-container").first();
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

		// Runs on every connect
		_activate() {
			var self = this;
			var ns = this._ns;
			var $top = this._top();

			this._prepare();

			$top.off(ns);
			// Keep the focus where it is when the icon button is pressed with a mouse or a finger
			$top.on("mousedown" + ns, ".toggle", function (e) {
				e.preventDefault();
			});
			$top.on("click" + ns, ".toggle", function () {
				self.revealed = !self._revealed;
			});
			$top.on("animationend" + ns, ".input", function () {
				$(this).removeClass("is-shaking");
			});
			this._bindNative();

			this._render();
			this._syncActive();
			ComponentBase.translate($top);
			ComponentBase.watchLanguage(ns, $top);
		}

		// jQuery 3 cannot see focusin inside a shadow root, so these two are native
		_bindNative() {
			this._unbindNative();
			this.addEventListener("focusin", this._onFocusChange);
			this.addEventListener("focusout", this._onFocusChange);
			var top = this._top().get(0);
			if (top) {
				top.addEventListener("slotchange", this._onSlotChange);
			}
		}

		_unbindNative() {
			this.removeEventListener("focusin", this._onFocusChange);
			this.removeEventListener("focusout", this._onFocusChange);
			var top = this._top().get(0);
			if (top) {
				top.removeEventListener("slotchange", this._onSlotChange);
			}
		}

		// ---------------------------------------------------------------------
		// Light DOM: slots, label link, input
		// ---------------------------------------------------------------------

		// Routes the page's children into slots and wires the input. Safe to run repeatedly.
		_prepare() {
			var $host = $(this);

			$host.children("label").not("[slot]").attr("slot", "label");
			$host.children().not("input, label, [slot]").attr("slot", "button");

			var input = $host.children("input").get(0) || null;
			if (input !== this._input) {
				this._unbindInput();
				this._input = input;
				this._bindInput();
			}

			if (input) {
				if (!input.hasAttribute("autocapitalize")) {
					input.setAttribute("autocapitalize", "off");
				}
				if (!input.hasAttribute("autocorrect")) {
					input.setAttribute("autocorrect", "off");
				}
				if (!input.hasAttribute("spellcheck")) {
					input.setAttribute("spellcheck", "false");
				}
				// Clicking the label focuses the input
				var $label = $host.children("label[slot=label]").first();
				if ($label.length && !$label.attr("for")) {
					if (!input.id) {
						inputCounter += 1;
						input.id = "login-text-field-input-" + inputCounter;
					}
					$label.attr("for", input.id);
				}
			}
		}

		_bindInput() {
			var self = this;
			if (!this._input) {
				return;
			}
			// Typing (or an autofill) ends the error state
			$(this._input).on("input" + this._ns + " change" + this._ns, function () {
				if (self._status() === "error") {
					self.clearError();
				}
			});
		}

		_unbindInput() {
			if (this._input) {
				$(this._input).off(this._ns);
			}
		}

		_fieldType() {
			return (this.getAttribute("type") || "").toLowerCase();
		}

		// The component decides the input's type, so the page never has to set it
		_applyInputType() {
			var type = this._fieldType();
			if (!this._input || !type) {
				return;
			}
			var wanted = type;
			if (type === "password" && this._revealed) {
				wanted = "text";
			}
			if (this._input.type !== wanted) {
				this._input.type = wanted;
			}
		}

		// ---------------------------------------------------------------------
		// State -> view
		// ---------------------------------------------------------------------

		_status() {
			return this.getAttribute("status") === "error" ? "error" : "default";
		}

		_sync() {
			this._prepare();
			this._render();
		}

		_render() {
			if (!this._built) {
				return;
			}
			var $top = this._top();
			var isPassword = this._fieldType() === "password";
			var status = this._status();

			if (!isPassword) {
				this._revealed = false;
			}
			this._applyInputType();

			$top.toggleClass("is-password", isPassword)
				.toggleClass("is-revealed", this._revealed)
				.toggleClass("has-button", $(this).children("[slot=button]").length > 0)
				.toggleClass("is-error", status === "error");

			this._renderMessage($top);
			this._renderStatusChange(status);
		}

		// The text is only replaced, never cleared, so it stays readable while it fades out
		_renderMessage($top) {
			var key = this.getAttribute("error");
			if (!key) {
				return;
			}
			var full = this._fullKey(key);
			var $text = $top.find(".error-text");
			if ($text.attr("data-i18n") === full) {
				return;
			}
			$text.attr("data-i18n", full);
			if ($.localization) {
				ComponentBase.translate($top);
			} else {
				$text.text(key);
			}
		}

		_fullKey(key) {
			key = String(key).trim();
			return key.indexOf(":") === -1 ? I18N_NAMESPACE + ":" + key : key;
		}

		_renderStatusChange(status) {
			var previous = this._renderedStatus;
			this._renderedStatus = status;
			if (previous === null || previous === status) {
				return;
			}
			if (status === "error") {
				this._shake();
			}
			ComponentBase.emit(this, "login-text-field:statuschange", {
				status: status,
				error: this.getAttribute("error"),
			});
		}

		_shake() {
			var row = this._top().find(".input").get(0);
			if (!row) {
				return;
			}
			var $row = $(row).removeClass("is-shaking");
			void row.offsetWidth; // restart the animation if it is already running
			$row.addClass("is-shaking");
		}

		// ---------------------------------------------------------------------
		// Active (focused) state
		// ---------------------------------------------------------------------

		// After a focusout the new focus target is not known yet, so look one tick later
		_scheduleActiveSync() {
			var self = this;
			window.setTimeout(function () {
				self._syncActive();
			}, 0);
		}

		_syncActive() {
			if (!this._built) {
				return;
			}
			var input = this._input;
			var toggle = this._top().find(".toggle").get(0);
			var inputFocused = !!input && input.getRootNode().activeElement === input;
			var toggleFocused = !!toggle && this._root.activeElement === toggle;
			this._top().toggleClass("is-active", inputFocused || toggleFocused);
		}
	}

	ComponentBase.define(here.tag, LoginTextField);
})();
