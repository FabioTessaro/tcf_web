(function () {
	"use strict";

	if (typeof window.ComponentBase !== "object") {
		throw new Error(
			"[login-card] ComponentBase was not found. Load jQuery and then component-base.js first."
		);
	}

	var $ = window.jQuery;
	var here = ComponentBase.locate("login-card"); // tag "login-card" (or data-tag), files next to login-card.js

	// Fetched once for all instances. "i18n" runs login-card.i18n.js before the first build.
	var load = ComponentBase.bundleLoader(
		{
			html: here.sibling("login-card.html"),
			css: here.sibling("login-card.css"),
			i18n: here.sibling("login-card.i18n.js"),
		},
		[],
		null,
		"login-card"
	);

	/* ==========================================================================
	   EDIT HERE (1/3): validation
	   Return an error key (see login-text-field) or null when the value is fine.
	   ========================================================================== */

	var ADMIN_USER = "Administrator"; // the only user that may log in without an email
	var EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	var CREDENTIALS_KEY = "errors.invalidCredentials";

	function validateUsr(value) {
		if (!value) {
			return "errors.required";
		}
		if (value !== ADMIN_USER && !EMAIL_PATTERN.test(value)) {
			return "errors.invalidEmail";
		}
		return null;
	}

	function validatePwd(value) {
		return value ? null : "errors.required";
	}

	/* ==========================================================================
	   EDIT HERE (2/3): how errors from the API are read and shown

	   readError() is the only place that looks inside the rejected Error object.
	   Change it if you want other fields (error.code, error.exc_type, ...).

	   The two mappers return a "descriptor":
	     {
	       fields: { usr: "errors.key", pwd: "errors.key" },  // set these fields to error
	                                                          // (use true for red without a message)
	       dialog: "text",                                    // show $.errorDialog with this text
	       sent:   true                                       // forgot only: show the "sent" screen
	     }
	   All three parts are optional. Return null to do nothing.
	   ========================================================================== */

	function readError(err) {
		err = err || {};
		return {
			status: err.status,
			message: err.message || "",
			raw: err,
		};
	}

	function mapLoginError(err) {
		var e = readError(err);
		if (e.status === 401) {
			return { fields: { pwd: CREDENTIALS_KEY } };
		}
		return { dialog: e.message || String(err) };
	}

	function mapForgotError(err) {
		var e = readError(err);
		if (e.status === 404) {
			// Unknown user: show the same "sent" screen, so nobody can probe which accounts exist
			return { sent: true };
		}
		if (e.status === 400 || e.status === 422) {
			return { fields: { usr: "errors.invalidEmail" } };
		}
		return { dialog: e.message || String(err) };
	}

	function showErrorDialog(message) {
		if ($.errorDialog && typeof $.errorDialog.show === "function") {
			$.errorDialog.show(message);
		} else {
			console.error("[login-card]", message);
		}
	}

	/* ==========================================================================
	   EDIT HERE (3/3): API and navigation
	   ========================================================================== */

	// Resolves on success (and then $.api.session is refreshed), rejects with an Error
	function apiLogin(usr, pwd) {
		return $.api.auth.login(usr, pwd);
	}

	// Contract (modelled on Frappe's reset_password): resolves when the reset email was
	// sent (or the user is unknown), rejects with an Error that has .status and .message
	// otherwise (400/422 invalid, 429 too many requests, ...).
	function apiForgot(usr) {
		return $.api.auth.forgot(usr);
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

	function redirectTarget() {
		var fromUrl = null;
		try {
			fromUrl = new URLSearchParams(window.location.search).get("redirect-to");
		} catch (e) {
			fromUrl = null;
		}
		var session = $.api && $.api.session;
		return localUrl(fromUrl) || localUrl(session && session.homePage) || "/";
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

	var MODES = ["login", "forgot", "sent"];
	var KEYBOARD_MIN_SHRINK = 150; // px the visible area must shrink to count as "keyboard open"

	// Field keys used in descriptors, and the slot each one is supplied in
	var FIELD_SLOT = { usr: "email", pwd: "password" };

	// Runs fn and always returns a promise, even if fn throws or returns a plain value
	function call(fn) {
		try {
			return Promise.resolve(fn());
		} catch (err) {
			return Promise.reject(err);
		}
	}

	// Reads a time custom property ("0.45s" or "450ms") as milliseconds
	function cssTime(el, name, fallback) {
		var raw = window.getComputedStyle(el).getPropertyValue(name).trim();
		var n = parseFloat(raw);
		if (isNaN(n)) {
			return fallback;
		}
		return /ms$/.test(raw) ? n : n * 1000;
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

	class LoginCard extends HTMLElement {
		static get observedAttributes() {
			return ["mode"];
		}

		constructor() {
			super();
			this._ns = ComponentBase.namespace("login-card");
			this._built = false;
			this._loading = null;
			this._mode = "login";
			this._busy = false;
			this._keyboard = false;
			this._baseline = 0;
			this._lastWidth = 0;
			this._switchTimer = null;
			this._flipTimer = null;
			this._el = null;
			this._onViewport = ComponentBase.rafThrottle(this._syncViewport.bind(this));
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
			$(this).off(this._ns);
			var vv = window.visualViewport;
			if (vv) {
				vv.removeEventListener("resize", this._onViewport);
				vv.removeEventListener("scroll", this._onViewport);
			}
			window.removeEventListener("resize", this._onViewport);
			clearTimeout(this._switchTimer);
			clearTimeout(this._flipTimer);
		}

		attributeChangedCallback(name, oldValue, value) {
			if (name === "mode" && this._built) {
				this.mode = value;
			}
		}

		/* ---------- public API ---------- */

		// "login" | "forgot" | "sent"
		get mode() {
			return this._mode;
		}

		set mode(value) {
			this._setMode(value);
		}

		get busy() {
			return this._busy;
		}

		/* ---------- build and activate ---------- */

		_top() {
			// jQuery cannot bind events on the ShadowRoot itself, so use the top element inside it
			return $(this._root).find(".login-card-container").first();
		}

		// The two fields are supplied by the page (<login-text-field slot="email|password">).
		// They are looked up each time, because the parser may still be adding them when the card builds.
		_field(slot) {
			return $(this).children('[slot="' + slot + '"]')[0] || null;
		}

		_fieldFor(key) {
			return this._field(FIELD_SLOT[key]);
		}

		_build(res) {
			ComponentBase.applyStyle(this._root, res.css);
			$(this._root).append($.parseHTML(res.html));

			var $top = this._top();
			this._el = {
				top: $top[0],
				body: $top.find(".login-card-body")[0],
				loginButton: $top.find(".login-submit")[0],
				forgotButton: $top.find(".forgot-submit")[0],
				backButton: $top.find(".back-submit")[0],
			};

			var initial = this.getAttribute("mode");
			this._mode = MODES.indexOf(initial) > -1 ? initial : "login";
			this._applyMode();

			ComponentBase.release(this._root);
			// The slotted texts and fields live in the page: translate them as well
			ComponentBase.translate($(this));
			this._translateWhenFieldsReady();

			this._built = true;
			if (this.isConnected) {
				this._activate();
			}
		}

		// The fields' labels, placeholders and forgot button are page elements. If they use
		// login-text-field's keys, those strings are only registered when each login-text-field
		// builds itself. Translate the page elements again once all of them have built.
		_translateWhenFieldsReady() {
			var self = this;

			function built(field) {
				return !!(
					field.shadowRoot &&
					field.shadowRoot.querySelector(".login-text-field-container")
				);
			}

			function ready(field) {
				return customElements.whenDefined("login-text-field").then(function () {
					return new Promise(function (resolve) {
						if (built(field)) {
							resolve();
							return;
						}
						var observer = new MutationObserver(function () {
							if (built(field)) {
								observer.disconnect();
								resolve();
							}
						});
						observer.observe(field.shadowRoot, { childList: true, subtree: true });
					});
				});
			}

			function run() {
				if (!self._field("email") || !self._field("password")) {
					console.error(
						'[login-card] Missing <login-text-field slot="email"> and/or <login-text-field slot="password">.'
					);
				}
				var pending = [];
				$(self)
					.children("login-text-field")
					.each(function () {
						pending.push(ready(this));
					});
				Promise.all(pending)
					.then(function () {
						ComponentBase.translate($(self));
					})
					.catch(function (err) {
						console.error(err);
					});
			}

			if (document.readyState === "loading") {
				document.addEventListener("DOMContentLoaded", run, { once: true });
			} else {
				run();
			}
		}

		// Runs on every connect: bind to the top element or the host, never to document delegation
		_activate() {
			var self = this;
			var ns = this._ns;
			var $top = this._top();
			var $host = $(this);

			ComponentBase.translate($top);
			ComponentBase.watchLanguage(ns, $top);

			/* Inside the shadow root: the card's own buttons */

			$top.on("click" + ns, ".back-link", function (e) {
				e.preventDefault();
				if (!self._busy) {
					self._setMode("login");
				}
			});
			$top.on("click" + ns, ".back-submit", function () {
				self._setMode("login");
			});

			// primary-button delivers no clicks while it is disabled or loading
			$top.on("click" + ns, ".login-submit", function () {
				self._submit();
			});
			$top.on("click" + ns, ".forgot-submit", function () {
				self._submit();
			});
			$top.on("submit" + ns, ".login-card-form", function (e) {
				e.preventDefault();
				self._submit();
			});

			/* On the host: the page's fields, which events bubble up to */

			$host.on("click" + ns, ".forgot-button", function (e) {
				e.preventDefault();
				if (!self._busy) {
					self._setMode("forgot");
				}
			});

			// Enter in a field (not while an IME is composing, which matters for zh and ja)
			$host.on("keydown" + ns, "input", function (e) {
				var oe = e.originalEvent || e;
				if (oe.key !== "Enter" || oe.isComposing || oe.keyCode === 229) {
					return;
				}
				e.preventDefault();
				var usr = self._fieldFor("usr");
				var pwd = self._fieldFor("pwd");
				if (self._mode === "login" && usr && pwd && this === usr.input && !pwd.value) {
					pwd.focus(); // email done, on to the password
					return;
				}
				self._submit();
			});

			// Editing the email frees the button after "wrong credentials" on the password field
			$host.on("input" + ns, "input", function () {
				var pwd = self._fieldFor("pwd");
				if (
					pwd &&
					this !== pwd.input &&
					pwd.status === "error" &&
					pwd.error === CREDENTIALS_KEY
				) {
					pwd.clearError();
				}
			});

			// Button is disabled exactly while a field shows an error
			$host.on("login-text-field:statuschange" + ns, function () {
				self._syncButtons();
			});

			/* Visible area (on-screen keyboard) */

			var vv = window.visualViewport;
			this._lastWidth = 0;
			this._baseline = 0;
			this._syncViewport();
			if (vv) {
				vv.addEventListener("resize", this._onViewport);
				vv.addEventListener("scroll", this._onViewport);
			}
			window.addEventListener("resize", this._onViewport);

			this._syncButtons();
		}

		/* ---------- modes ---------- */

		_setMode(mode) {
			if (MODES.indexOf(mode) < 0 || mode === this._mode) {
				return this;
			}
			if (!this._built) {
				this._mode = mode;
				return this;
			}

			var previous = this._mode;
			this._mode = mode;
			this._clearErrors();
			this._startSwitching();
			this._applyMode();
			this._syncButtons();
			ComponentBase.emit(this, "login-card:modechange", { mode: mode, previous: previous });

			var usr = this._fieldFor("usr");
			var pwd = this._fieldFor("pwd");
			if (mode === "forgot" && usr) {
				usr.focus();
			} else if (mode === "login" && !this._isMobile()) {
				var next = usr && usr.value ? pwd : usr;
				if (next) {
					next.focus();
				}
			}
			return this;
		}

		// Rows and buttons say in data-modes where they are visible
		_applyMode() {
			var mode = this._mode;
			var $top = $(this._el.top);

			function visibleIn(el) {
				return (el.getAttribute("data-modes") || "").split(/\s+/).indexOf(mode) > -1;
			}

			this._el.top.classList.toggle("is-forgot", mode === "forgot");
			this._el.top.classList.toggle("is-sent", mode === "sent");

			$top.find(".collapse").each(function () {
				var visible = visibleIn(this);
				this.classList.toggle("is-collapsed", !visible);
				this.inert = !visible; // not focusable, not read out while collapsed
			});
			$top.find(".swap").each(function () {
				var visible = visibleIn(this);
				this.classList.toggle("is-hidden", !visible);
				this.inert = !visible;
			});
		}

		// While rows animate they are clipped; afterwards they are released again
		_startSwitching() {
			var self = this;
			var top = this._el.top;
			top.classList.add("is-switching");
			clearTimeout(this._switchTimer);
			var ms = cssTime(top, "--login-card-switch-duration", 450);
			this._switchTimer = setTimeout(function () {
				top.classList.remove("is-switching");
				self._switchTimer = null;
			}, ms + 60);
		}

		/* ---------- errors and buttons ---------- */

		_fieldsInMode() {
			var usr = this._fieldFor("usr");
			var pwd = this._fieldFor("pwd");
			return (this._mode === "login" ? [usr, pwd] : [usr]).filter(Boolean);
		}

		_hasError() {
			return this._fieldsInMode().some(function (field) {
				return field.status === "error";
			});
		}

		_clearErrors() {
			[this._fieldFor("usr"), this._fieldFor("pwd")].forEach(function (field) {
				if (field && field.status === "error" && typeof field.clearError === "function") {
					field.clearError();
				}
			});
		}

		_syncButtons() {
			if (!this._el) {
				return;
			}
			var disabled = this._hasError();
			this._el.loginButton.toggleAttribute("disabled", disabled);
			this._el.forgotButton.toggleAttribute("disabled", disabled);
		}

		_activeButton() {
			if (this._mode === "login") {
				return this._el.loginButton;
			}
			if (this._mode === "forgot") {
				return this._el.forgotButton;
			}
			return null;
		}

		_setBusy(on) {
			this._busy = on;
			setLoading(this._activeButton(), on);
			// readOnly keeps focus (and the mobile keyboard), unlike disabled
			[this._fieldFor("usr"), this._fieldFor("pwd")].forEach(function (field) {
				var input = field && field.input;
				if (input) {
					input.readOnly = on;
				}
			});
			this._el.top.classList.toggle("is-busy", on);
		}

		// Applies a descriptor (see "EDIT HERE (2/3)"). Returns true if a field was set to error.
		_applyDescriptor(descriptor) {
			var self = this;
			var d = descriptor || {};
			var fields = d.fields || {};
			var first = null;

			["usr", "pwd"].forEach(function (key) {
				if (!(key in fields)) {
					return;
				}
				var field = self._fieldFor(key);
				if (!field || typeof field.setError !== "function") {
					return;
				}
				field.setError(fields[key] === true ? undefined : fields[key]);
				if (!first) {
					first = field;
				}
			});

			if (first) {
				first.focus();
			}
			if (d.dialog) {
				showErrorDialog(d.dialog);
			}
			this._syncButtons();
			return !!first;
		}

		/* ---------- submitting ---------- */

		_submit() {
			if (this._busy || this._hasError()) {
				return;
			}
			if (this._mode === "login") {
				this._submitLogin();
			} else if (this._mode === "forgot") {
				this._submitForgot();
			}
		}

		_submitLogin() {
			var self = this;
			var usr = this._fieldFor("usr");
			var pwd = this._fieldFor("pwd");
			var user = String((usr && usr.value) || "").trim();
			var pass = String((pwd && pwd.value) || "");

			var fields = {};
			var usrKey = validateUsr(user);
			var pwdKey = validatePwd(pass);
			if (usrKey) {
				fields.usr = usrKey;
			}
			if (pwdKey) {
				fields.pwd = pwdKey;
			}
			if (this._applyDescriptor({ fields: fields })) {
				return;
			}

			this._setBusy(true);
			call(function () {
				return apiLogin(user, pass);
			})
				.then(function () {
					self._loginSucceeded();
				})
				.catch(function (err) {
					self._setBusy(false);
					self._applyDescriptor(mapLoginError(err));
				});
		}

		// The button stays in its loading state: the page is about to change
		_loginSucceeded() {
			var self = this;
			var target = redirectTarget();
			ComponentBase.emit(this, "login-card:success", { target: target });
			call(function () {
				return navigate(target);
			}).catch(function (err) {
				self._setBusy(false);
				showErrorDialog(readError(err).message || String(err));
			});
		}

		_submitForgot() {
			var self = this;
			var usr = this._fieldFor("usr");
			var user = String((usr && usr.value) || "").trim();

			var usrKey = validateUsr(user);
			if (usrKey && this._applyDescriptor({ fields: { usr: usrKey } })) {
				return;
			}

			this._setBusy(true);
			call(function () {
				return apiForgot(user);
			})
				.then(function () {
					self._setBusy(false);
					self._setMode("sent");
				})
				.catch(function (err) {
					var descriptor = mapForgotError(err);
					self._setBusy(false);
					if (descriptor && descriptor.sent) {
						self._setMode("sent");
					} else {
						self._applyDescriptor(descriptor);
					}
				});
		}

		/* ---------- mobile: visible area and keyboard ---------- */

		// The breakpoint is defined once, in the scss (--login-card-mobile)
		_isMobile() {
			return (
				window
					.getComputedStyle(this._el.top)
					.getPropertyValue("--login-card-mobile")
					.trim() === "1"
			);
		}

		// The focused element, if it is inside the card: a page field (light DOM) or one of
		// the card's own buttons (shadow DOM, where document.activeElement is the host itself)
		_focusedInside() {
			var active = document.activeElement;
			return active && this.contains(active) ? active : null;
		}

		// Sizes the backdrop to what the user can actually see and decides whether the
		// on-screen keyboard is open. Works for iOS and Android (visualViewport) and
		// falls back to window size where visualViewport does not exist.
		_syncViewport() {
			if (!this._el) {
				return;
			}
			var top = this._el.top;
			var vv = window.visualViewport;
			var height = vv ? vv.height : window.innerHeight;
			var offset = vv ? vv.offsetTop : 0;
			var zoomed = vv ? vv.scale > 1.01 : false; // pinch zoom also shrinks the visual viewport
			var width = window.innerWidth;
			var focused = !!this._focusedInside();
			var wasOpen = this._keyboard;
			var open = false;

			if (width !== this._lastWidth) {
				// First run or rotation: this is the new full height
				this._lastWidth = width;
				this._baseline = height;
			} else if (
				this._isMobile() &&
				!zoomed &&
				focused &&
				this._baseline - height > KEYBOARD_MIN_SHRINK
			) {
				open = true;
			}
			if (!open && (!focused || height > this._baseline)) {
				this._baseline = height;
			}

			var body = this._el.body;
			var before = open !== wasOpen ? body.getBoundingClientRect().top : null;

			if (zoomed) {
				top.style.removeProperty("--login-card-vv-top");
				top.style.removeProperty("--login-card-vv-height");
			} else {
				top.style.setProperty("--login-card-vv-top", Math.round(offset) + "px");
				top.style.setProperty("--login-card-vv-height", Math.round(height) + "px");
			}
			top.classList.toggle("is-keyboard", open);
			this._keyboard = open;

			if (before !== null) {
				this._flip(body, before);
				if (open) {
					var active = this._focusedInside();
					if (active && active !== this && typeof active.scrollIntoView === "function") {
						window.requestAnimationFrame(function () {
							active.scrollIntoView({ block: "nearest" });
						});
					}
				}
			}
		}

		// Slides the block from where it was to where it is now
		_flip(el, before) {
			var delta = before - el.getBoundingClientRect().top;
			var ms = cssTime(this._el.top, "--login-card-reposition-duration", 0);
			if (!delta || !ms) {
				return;
			}
			clearTimeout(this._flipTimer);
			el.style.transition = "none";
			el.style.transform = "translateY(" + delta + "px)";
			void el.offsetHeight; // commit the starting position
			el.style.transition =
				"transform var(--login-card-reposition-duration) var(--login-card-reposition-easing)";
			el.style.transform = "";
			this._flipTimer = setTimeout(function () {
				el.style.transition = "";
			}, ms + 50);
		}
	}

	ComponentBase.define(here.tag, LoginCard);
})();
