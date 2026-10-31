// <login-text-field>  (include this file in <head>; hard deps: jQuery; soft: i18next + jquery-i18next for messages)
// Slots: "label" · default = a native <input> (stays in the light DOM so browser autofill works) · "action" · "error"
// The error state clears itself as soon as the user changes the input.
// Password inputs automatically get a show/hide button and a "forgot password" button
// (attributes no-reveal / no-forgot turn them off).
// API:   field.input · field.setError(i18nKey | null) · field.toggleReveal([show]) · field.ready (Promise)
// Events: login-text-field:ready · login-text-field:error {detail:{key}} · login-text-field:reveal {detail:{visible}} · login-text-field:forgot
(function () {
	const NAME = "login-text-field";
	// Loader: swap these few lines for your component-base helpers.
	const BASE =
		(document.currentScript && document.currentScript.src.replace(/[^/]*$/, "")) ||
		"/assets/tcf_web/components/login-text-field/";
	const fetchAsset = (file, type) => $.ajax({ url: BASE + file, dataType: type, cache: true });

	// One shared load (css + html + i18n) for every instance on the page.
	const assets = Promise.all([
		fetchAsset(NAME + ".css", "text"),
		fetchAsset(NAME + ".html", "text"),
		fetchAsset(NAME + ".i18n.js", "script"),
	]).then(([css, html]) => {
		const add = () =>
			$.each(window.LOGIN_TEXT_FIELD_I18N || {}, (lng, res) =>
				i18next.addResourceBundle(lng, "translation", { [NAME]: res }, true, true)
			);
		if (window.i18next) {
			i18next.isInitialized ? add() : i18next.on("initialized", add);
		}
		return { css, html };
	});

	class LoginTextField extends HTMLElement {
		constructor() {
			super();
			this.ready = new Promise((res) => {
				this._done = res;
			});
		}

		connectedCallback() {
			// The built-in button label lives in the shadow DOM, so the field re-localizes it itself
			if (window.i18next)
				i18next.on(
					"languageChanged",
					(this._lang = this._lang || (() => this.localizeShadow()))
				);

			if (this.shadowRoot) return; // same node re-inserted (htmx swaps): already built
			const root = this.attachShadow({ mode: "open" });

			// Self-clearing error: input/change from the slotted <input> bubble up to the host
			$(this).on("input change", "input", () => {
				if (this.hasAttribute("error")) this.setError(null);
			});
			assets
				.then((a) => {
					root.innerHTML = `<style>${a.css}</style>${a.html}`;
					$(root)
						.find("label")
						.on("click", () => this.input && this.input.focus());

					// Show/hide button: mousedown is cancelled so the input keeps focus (and the mobile keyboard stays up)
					$(root)
						.find(".toggle")
						.on("mousedown", (e) => e.preventDefault())
						.on("click", () => this.toggleReveal());

					// Forgot password: the field only announces the click, the page decides what to do
					$(root)
						.find(".forgot")
						.on("click", () =>
							this.dispatchEvent(
								new CustomEvent(NAME + ":forgot", { bubbles: true })
							)
						);
					$(root)
						.find("slot:not([name])")
						.on("slotchange", () => this.syncPasswordParts());
					this.syncPasswordParts();
					this.localizeShadow();

					this._done(this);
					this.dispatchEvent(new CustomEvent(NAME + ":ready", { bubbles: true }));
				})
				.catch((err) => console.error(NAME + ": failed to load assets", err));
		}

		disconnectedCallback() {
			if (window.i18next && this._lang) i18next.off("languageChanged", this._lang);
		}

		// jquery-i18next does not reach into shadow roots, so translate the built-in label here
		localizeShadow() {
			if ($.fn.localize && this.shadowRoot)
				$(this.shadowRoot).find("[data-i18n]").localize();
		}

		get input() {
			return this.querySelector("input");
		}

		// Shows the show/hide and forgot buttons only for password inputs
		// (remembered, because the input type flips while the password is revealed)
		syncPasswordParts() {
			const input = this.input;
			if (input && input.type === "password") this._password = true;
			const $root = $(this.shadowRoot);
			$root
				.find(".toggle")
				.prop("hidden", !(this._password && !this.hasAttribute("no-reveal")));
			$root
				.find(".forgot")
				.prop("hidden", !(this._password && !this.hasAttribute("no-forgot")));
		}

		// show = true | false to force, omit to flip
		toggleReveal(show) {
			const input = this.input;
			if (!input) return;
			const reveal = show === undefined ? input.type === "password" : !!show;
			const start = input.selectionStart,
				end = input.selectionEnd;
			input.type = reveal ? "text" : "password";
			if (start !== null) input.setSelectionRange(start, end); // keep the caret where it was
			$(this.shadowRoot)
				.find(".icon")
				.text(reveal ? "visibility_off" : "visibility");
			this.dispatchEvent(
				new CustomEvent(NAME + ":reveal", { bubbles: true, detail: { visible: reveal } })
			);
		}

		// key = i18n key of the message (e.g. 'login-text-field.required'), or null to clear
		setError(key) {
			$(this).children("[slot=error]").remove();
			this.removeAttribute("error");
			if (!key) return;
			void this.offsetWidth; // restart the shake
			$('<span slot="error">').attr("data-i18n", key).appendTo(this);
			if ($.fn.localize) $(this).localize();
			this.setAttribute("error", "");
			this.dispatchEvent(
				new CustomEvent(NAME + ":error", { bubbles: true, detail: { key } })
			);
		}
	}
	if (!customElements.get(NAME)) customElements.define(NAME, LoginTextField);
})();
