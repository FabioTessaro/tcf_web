(function () {
	"use strict";

	if (typeof window.ComponentBase !== "object") {
		throw new Error(
			"[job-apply-form] ComponentBase was not found. Load jQuery and then component-base.js first."
		);
	}

	var $ = window.jQuery;
	var here = ComponentBase.locate("job-apply-form");

	var load = ComponentBase.bundleLoader(
		{
			html: here.sibling("job-apply-form.html"),
			css: here.sibling("job-apply-form.css"),
			i18n: here.sibling("../jobs/jobs.i18n.js"), // shared "jobs" strings
		},
		[],
		null,
		"job-apply-form"
	);

	/* ==========================================================================
	   EDIT HERE (1/3): validation
	   A convenience mirror of tcf_web/api/job_validation.py. The server decides.
	   Return an i18n key of the "jobs" namespace, or null.
	   ========================================================================== */

	var MAX_RESUME_BYTES = 5 * 1024 * 1024;
	var RESUME_EXTENSIONS = ["pdf", "doc", "docx"];
	var EMAIL_PATTERN = /^[^\s@<>"',;:()[\]\\]+@[^\s@<>"',;:()[\]\\]+\.[^\s@<>"',;:()[\]\\]{2,}$/;
	var PHONE_PATTERN = /^[+0-9][0-9 ()./-]{4,29}$/;

	function validate(values, file) {
		var errors = {};
		var name = values.applicant_name.trim();
		var email = values.email_id.trim();
		var phone = values.phone_number.trim();

		if (!name) {
			errors.applicant_name = "errors.required";
		} else if (name.length > 140) {
			errors.applicant_name = "errors.tooLong";
		}
		if (!email) {
			errors.email_id = "errors.required";
		} else if (!EMAIL_PATTERN.test(email)) {
			errors.email_id = "errors.invalidEmail";
		}
		if (phone && !PHONE_PATTERN.test(phone)) {
			errors.phone_number = "errors.invalidPhone";
		}
		if (values.cover_letter.length > 3000) {
			errors.cover_letter = "errors.tooLong";
		}
		if (!file) {
			errors.resume = "errors.required";
		} else {
			var ext = (file.name.split(".").pop() || "").toLowerCase();
			if (RESUME_EXTENSIONS.indexOf(ext) < 0) {
				errors.resume = "errors.resumeType";
			} else if (!file.size) {
				errors.resume = "errors.resumeEmpty";
			} else if (file.size > MAX_RESUME_BYTES) {
				errors.resume = "errors.resumeTooLarge";
			}
		}
		return errors;
	}

	/* ==========================================================================
	   EDIT HERE (2/3): how the server's answer is read

	   200 { message: { ok: true } }                  sent
	   422 { message: { ok: false, errors: {...} } }  field errors (keys as above, plus "form")
	   429                                            too many applications from this address
	   anything else                                  generic message
	   ========================================================================== */

	function readOutcome(status, body) {
		var message = (body && body.message) || {};
		if (status === 200 && message.ok) {
			return { sent: true };
		}
		if (status === 422 && message.errors) {
			return { errors: message.errors };
		}
		if (status === 429) {
			return { errors: { form: "errors.tooMany" } };
		}
		return { errors: { form: "errors.generic" } };
	}

	/* ==========================================================================
	   EDIT HERE (3/3): API
	   ========================================================================== */

	var ENDPOINT = "/api/method/tcf_web.api.jobs.submit_application";

	// Guests have no CSRF token; a logged-in visitor does, and Frappe then wants it
	function csrfHeader() {
		var token = $.api && $.api.session && $.api.session.csrf;
		return token ? { "X-Frappe-CSRF-Token": token } : {};
	}

	function send(formData) {
		var ready = $.api && $.api.ready ? $.api.ready : Promise.resolve();
		return ready
			.catch(function () {})
			.then(function () {
				return fetch(ENDPOINT, {
					method: "POST",
					body: formData,
					credentials: "same-origin",
					headers: Object.assign({ Accept: "application/json" }, csrfHeader()),
				});
			})
			.then(function (res) {
				return res
					.json()
					.catch(function () {
						return null;
					})
					.then(function (body) {
						return readOutcome(res.status, body);
					});
			});
	}

	/* ==========================================================================
	   Internals
	   ========================================================================== */

	var FIELDS = ["applicant_name", "email_id", "phone_number", "cover_letter", "resume"];

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

	class JobApplyForm extends HTMLElement {
		static get observedAttributes() {
			return ["opening", "opening-title", "unavailable"];
		}

		constructor() {
			super();
			this._ns = ComponentBase.namespace("job-apply-form");
			this._built = false;
			this._loading = null;
			this._busy = false;
			this._state = "form";
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
					ComponentBase.applyStyle(self._root, res.css);
					$(self._root).append($.parseHTML(res.html));
					self._built = true;
					ComponentBase.release(self._root);
					if (self.isConnected) {
						self._activate();
					}
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
				this._renderState();
			}
		}

		_top() {
			return $(this._root).find(".apply-form").first();
		}

		_activate() {
			var self = this;
			var $top = this._top();
			ComponentBase.translate($top);
			ComponentBase.watchLanguage(this._ns, $top);
			ComponentBase.bindLinks($top, this._ns);

			// primary-button delivers no clicks while it is disabled or loading
			$top.on("click" + this._ns, ".submit", function () {
				self._submit();
			});
			$top.on("submit" + this._ns, ".form", function (e) {
				e.preventDefault();
				self._submit();
			});
			// Editing a field removes its error
			$top.on("input change" + this._ns, "input, textarea", function () {
				self._setFieldError($(this).closest(".field").attr("data-field"), null);
			});
			this._renderState();
		}

		_renderState() {
			var $top = this._top();
			var state =
				this._state === "sent"
					? "sent"
					: this.hasAttribute("unavailable")
					? "unavailable"
					: "form";
			$top.find("[data-state]").each(function () {
				this.hidden = this.getAttribute("data-state") !== state;
			});
			$top.find(".opening-title").text(this.getAttribute("opening-title") || "");
		}

		_setFieldError(field, key) {
			var $field = this._top().find('.field[data-field="' + field + '"]');
			var $error = $field.find(".error");
			$field.toggleClass("is-error", !!key);
			if (key) {
				$error.attr("data-i18n", "jobs:" + key);
				ComponentBase.translate($error);
			} else {
				$error.removeAttr("data-i18n").text("");
			}
		}

		_setFormError(key) {
			var $error = this._top().find(".form-error");
			if (key) {
				$error.attr("data-i18n", "jobs:" + key).prop("hidden", false);
				ComponentBase.translate($error);
			} else {
				$error.removeAttr("data-i18n").text("").prop("hidden", true);
			}
		}

		_showErrors(errors) {
			var self = this;
			var first = null;
			FIELDS.forEach(function (field) {
				self._setFieldError(field, errors[field] || null);
				if (errors[field] && !first) {
					first = field;
				}
			});
			// The server may also name the opening or the form as a whole
			this._setFormError(errors.form || errors.opening || null);
			if (first) {
				var el = this._root.querySelector('[name="' + first + '"]');
				if (el) {
					el.focus();
				}
			}
		}

		_submit() {
			var self = this;
			if (this._busy) {
				return;
			}
			var form = this._root.querySelector(".form");
			var values = {};
			["applicant_name", "email_id", "phone_number", "cover_letter"].forEach(function (
				name
			) {
				values[name] = form.elements[name].value;
			});
			var file = form.elements.resume.files[0] || null;

			var errors = validate(values, file);
			this._showErrors(errors);
			if (Object.keys(errors).length) {
				return;
			}

			var data = new FormData(form); // includes the honeypot, empty for real visitors
			data.set("opening", this.getAttribute("opening") || "");

			this._busy = true;
			setLoading(this._top().find(".submit")[0], true);
			send(data)
				.then(function (outcome) {
					self._busy = false;
					setLoading(self._top().find(".submit")[0], false);
					if (outcome.sent) {
						self._state = "sent";
						self._renderState();
						ComponentBase.emit(self, "job-apply-form:sent", {
							opening: self.getAttribute("opening"),
						});
					} else {
						self._showErrors(outcome.errors);
					}
				})
				.catch(function () {
					self._busy = false;
					setLoading(self._top().find(".submit")[0], false);
					self._showErrors({ form: "errors.generic" });
				});
		}
	}

	ComponentBase.define(here.tag, JobApplyForm);
})();
