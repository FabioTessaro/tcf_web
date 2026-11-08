(function () {
	"use strict";

	if (typeof window.ComponentBase !== "object") {
		throw new Error(
			"[password-card] ComponentBase was not found. Load jQuery and then component-base.js first."
		);
	}

	var $ = window.jQuery;
	var here = ComponentBase.locate("password-card"); // tag "password-card" (or data-tag), files next to password-card.js

	// Fetched once for all instances. "i18n" runs password-card.i18n.js before the first build.
	var load = ComponentBase.bundleLoader(
		{
			html: here.sibling("password-card.html"),
			css: here.sibling("password-card.css"),
			i18n: here.sibling("password-card.i18n.js"),
		},
		[],
		null,
		"password-card"
	);

	/* ==========================================================================
	   EDIT HERE (1/3): validation
	   Mirrors what the user can fix without a round trip. The server stays the
	   authority (password policy, wrong current password, expired link).
	   Return an error key or null. Keys carry the namespace, so text-field
	   finds them in this component's strings.
	   ========================================================================== */

	var KEY = {
		required: "password-card:errors.required",
		mismatch: "password-card:errors.mismatch",
		sameAsCurrent: "password-card:errors.sameAsCurrent",
		wrongCurrent: "password-card:errors.wrongCurrent",
	};

	function validate(values, mode) {
		var fields = {};
		if (mode === "change" && !values.current) {
			fields.current = KEY.required;
		}
		if (!values.new) {
			fields.new = KEY.required;
		} else if (mode === "change" && values.current && values.new === values.current) {
			fields.new = KEY.sameAsCurrent;
		}
		if (!values.confirm) {
			fields.confirm = KEY.required;
		} else if (values.new && values.confirm !== values.new) {
			fields.confirm = KEY.mismatch;
		}
		return fields;
	}

	/* ==========================================================================
	   EDIT HERE (2/3): how errors from the API are read and shown

	   Returns a descriptor:
	     {
	       fields: { current: "key", new: "key", confirm: "key" },  // fields set to error
	       dialog: "text",                                          // $.errorDialog text
	       mode:   "invalid"                                        // switch to this screen
	     }
	   ========================================================================== */

	function mapError(err, mode) {
		err = err || {};
		if (err.status === 410) {
			return { mode: "invalid" }; // reset link used before, or expired
		}
		if (mode === "change" && (err.status === 401 || err.status === 403)) {
			return { fields: { current: KEY.wrongCurrent } };
		}
		// Password policy failures and everything else: Frappe's own message
		return { dialog: err.message || String(err) };
	}

	function showErrorDialog(message) {
		if ($.errorDialog && typeof $.errorDialog.show === "function") {
			$.errorDialog.show(message);
		} else {
			console.error("[password-card]", message);
		}
	}

	/* ==========================================================================
	   EDIT HERE (3/3): API and navigation
	   ========================================================================== */

	function apiChange(current, next) {
		return $.api.auth.changePassword(current, next);
	}

	function apiReset(key, next) {
		return $.api.auth.resetPassword(key, next);
	}

	// Only same-origin targets are accepted, so ?redirect-to= cannot send users elsewhere
	function localUrl(value) {
		if (typeof value !== "string" || !value) {
			return null;
		}
		try {
			var url = new URL(value, window.location.origin);
			if (url.origin !== window.location.origin) {
				return null;
			}
			return url.pathname + url.search + url.hash;
		} catch (e) {
			return null;
		}
	}

	function param(name) {
		try {
			return new URLSearchParams(window.location.search).get(name);
		} catch (e) {
			return null;
		}
	}

	// Frappe answers with its own "next" URL (the desk for desk users), which is not wanted here
	function redirectTarget() {
		return localUrl(param("redirect-to")) || "/";
	}

	function navigate(url) {
		if ($.navigation && typeof $.navigation.navigateTo === "function") {
			return $.navigation.navigateTo(url);
		}
		window.location.assign(url);
	}

	/* ==========================================================================
	   Internals
	   ========================================================================== */

	var MODES = ["change", "reset", "done", "invalid"];
	var FIELDS = ["current", "new", "confirm"]; // field key = slot name

	function call(fn) {
		try {
			return Promise.resolve(fn());
		} catch (err) {
			return Promise.reject(err);
		}
	}

	// Attributes work before and after primary-button is upgraded
	function setLoading(btn, on) {
		if (!btn) {
			return;
		}
		if (on) {
			if (typeof btn.startLoading === "function") {
				btn.startLoading();
			} else {
				btn.setAttribute("loading", "");
			}
		} else if (typeof btn.stopLoading === "function") {
			btn.stopLoading();
		} else {
			btn.removeAttribute("loading");
		}
	}

	class PasswordCard extends HTMLElement {
		constructor() {
			super();
			this._ns = ComponentBase.namespace("password-card");
			this._built = false;
			this._loading = null;
			this._mode = param("key") ? "reset" : "change";
			this._busy = false;
			this._el = null;
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
			$(this).off(this._ns);
		}

		/* ---------- public API ---------- */

		// "change" | "reset" | "done" | "invalid"
		get mode() {
			return this._mode;
		}

		get busy() {
			return this._busy;
		}

		/* ---------- build and activate ---------- */

		_top() {
			return $(this._root).find(".password-card-container").first();
		}

		_field(key) {
			return $(this).children('[slot="' + key + '"]')[0] || null;
		}

		_build(res) {
			ComponentBase.applyStyle(this._root, res.css);
			$(this._root).append($.parseHTML(res.html));

			var $top = this._top();
			this._el = {
				top: $top[0],
				saveButton: $top.find(".save-submit")[0],
				doneButton: $top.find(".done-submit")[0],
				invalidButton: $top.find(".invalid-submit")[0],
			};
			this._applyMode();

			ComponentBase.release(this._root);
			ComponentBase.translate($(this)); // slotted labels and placeholders live in the page
			this._built = true;
			if (this.isConnected) {
				this._activate();
			}
		}

		_activate() {
			var self = this;
			var ns = this._ns;
			var $top = this._top();
			var $host = $(this);

			ComponentBase.translate($top);
			ComponentBase.watchLanguage(ns, $top);

			// primary-button delivers no clicks while it is disabled or loading
			$top.on("click" + ns, ".save-submit", function () {
				self._submit();
			});
			$top.on("click" + ns, ".done-submit", function () {
				navigate(redirectTarget());
			});
			$top.on("click" + ns, ".invalid-submit", function () {
				navigate("/login");
			});
			$top.on("submit" + ns, ".password-card-form", function (e) {
				e.preventDefault();
				self._submit();
			});

			// Enter moves to the next empty field, then submits (not while an IME is composing)
			$host.on("keydown" + ns, "input", function (e) {
				var oe = e.originalEvent || e;
				if (oe.key !== "Enter" || oe.isComposing || oe.keyCode === 229) {
					return;
				}
				e.preventDefault();
				var next = self._nextEmpty(this);
				if (next) {
					next.focus();
				} else {
					self._submit();
				}
			});

			$host.on("text-field:statuschange" + ns, function () {
				self._syncButtons();
			});

			this._guardGuest();
			this._syncButtons();
		}

		// Changing the password needs a session: guests go to the login and come back
		_guardGuest() {
			if (this._mode !== "change" || !$.api || !$.api.ready) {
				return;
			}
			$.api.ready.then(function () {
				if ($.api.session && $.api.session.isGuest) {
					var back = window.location.pathname + window.location.search;
					navigate("/login?redirect-to=" + encodeURIComponent(back));
				}
			});
		}

		_nextEmpty(input) {
			var keys = this._mode === "change" ? FIELDS : ["new", "confirm"];
			for (var i = 0; i < keys.length; i++) {
				var field = this._field(keys[i]);
				if (field && field.input === input) {
					var later = keys.slice(i + 1);
					for (var j = 0; j < later.length; j++) {
						var f = this._field(later[j]);
						if (f && !f.value) {
							return f;
						}
					}
					return null;
				}
			}
			return null;
		}

		/* ---------- modes ---------- */

		_setMode(mode) {
			if (MODES.indexOf(mode) < 0 || mode === this._mode) {
				return;
			}
			var previous = this._mode;
			this._mode = mode;
			this._applyMode();
			this._syncButtons();
			ComponentBase.emit(this, "password-card:modechange", {
				mode: mode,
				previous: previous,
			});
		}

		// Elements say in data-modes where they are visible
		_applyMode() {
			var mode = this._mode;
			function visibleIn(el) {
				return (el.getAttribute("data-modes") || "").split(/\s+/).indexOf(mode) > -1;
			}
			$(this._el.top)
				.find("[data-modes]")
				.each(function () {
					var visible = visibleIn(this);
					this.hidden = !visible && !this.classList.contains("swap");
					this.classList.toggle(
						"is-hidden",
						!visible && this.classList.contains("swap")
					);
					this.inert = !visible;
				});
		}

		/* ---------- errors and buttons ---------- */

		_activeFields() {
			var keys = this._mode === "change" ? FIELDS : ["new", "confirm"];
			var self = this;
			return keys
				.map(function (key) {
					return self._field(key);
				})
				.filter(Boolean);
		}

		_hasError() {
			return this._activeFields().some(function (field) {
				return field.status === "error";
			});
		}

		_syncButtons() {
			if (this._el) {
				this._el.saveButton.toggleAttribute("disabled", this._hasError());
			}
		}

		_setBusy(on) {
			this._busy = on;
			setLoading(this._el.saveButton, on);
			// readOnly keeps focus (and the mobile keyboard), unlike disabled
			this._activeFields().forEach(function (field) {
				if (field.input) {
					field.input.readOnly = on;
				}
			});
		}

		// Applies a descriptor (see "EDIT HERE (2/3)"). Returns true if a field was set to error.
		_applyDescriptor(d) {
			var self = this;
			d = d || {};
			var fields = d.fields || {};
			var first = null;
			FIELDS.forEach(function (key) {
				if (!(key in fields)) {
					return;
				}
				var field = self._field(key);
				if (field && typeof field.setError === "function") {
					field.setError(fields[key]);
					first = first || field;
				}
			});
			if (first) {
				first.focus();
			}
			if (d.dialog) {
				showErrorDialog(d.dialog);
			}
			if (d.mode) {
				this._setMode(d.mode);
			}
			this._syncButtons();
			return !!first;
		}

		/* ---------- submitting ---------- */

		_values() {
			var self = this;
			var values = {};
			FIELDS.forEach(function (key) {
				var field = self._field(key);
				values[key] = field ? String(field.value || "") : "";
			});
			return values;
		}

		_submit() {
			var self = this;
			if (
				this._busy ||
				this._hasError() ||
				(this._mode !== "change" && this._mode !== "reset")
			) {
				return;
			}
			var mode = this._mode;
			var values = this._values();
			if (this._applyDescriptor({ fields: validate(values, mode) })) {
				return;
			}

			this._setBusy(true);
			call(function () {
				return mode === "reset"
					? apiReset(param("key"), values.new)
					: apiChange(values.current, values.new);
			})
				.then(function () {
					self._setBusy(false);
					self._setMode("done");
					ComponentBase.emit(self, "password-card:success", {
						target: redirectTarget(),
					});
				})
				.catch(function (err) {
					self._setBusy(false);
					self._applyDescriptor(mapError(readError(err), mode));
				});
		}
	}

	function readError(err) {
		err = err || {};
		return { status: err.status, message: err.message || "" };
	}

	ComponentBase.define(here.tag, PasswordCard);
})();
