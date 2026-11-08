(function () {
	"use strict";

	if (typeof window.ComponentBase !== "object") {
		throw new Error(
			"[job-card] ComponentBase was not found. Load jQuery and then component-base.js first."
		);
	}

	var $ = window.jQuery;
	var here = ComponentBase.locate("job-card");

	var load = ComponentBase.bundleLoader(
		{
			html: here.sibling("job-card.html"),
			css: here.sibling("job-card.css"),
			i18n: here.sibling("../jobs/jobs.i18n.js"), // shared "jobs" strings
		},
		[],
		null,
		"job-card"
	);

	// ISO date (2026-11-08) in the page language; anything unparsable is shown as it is
	function formatDate(iso) {
		var date = new Date(iso + "T00:00:00");
		if (!iso || isNaN(date.getTime())) {
			return iso || "";
		}
		return new Intl.DateTimeFormat(document.documentElement.lang || undefined, {
			dateStyle: "medium",
		}).format(date);
	}

	class JobCard extends HTMLElement {
		static get observedAttributes() {
			return ["href", "job-title", "company", "location", "employment-type", "posted"];
		}

		constructor() {
			super();
			this._ns = ComponentBase.namespace("job-card");
			this._built = false;
			this._loading = null;
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
			$(document).off(this._ns);
			this._top().off(this._ns);
		}

		attributeChangedCallback() {
			if (this._built) {
				this._render();
			}
		}

		_top() {
			return $(this._root).find(".card").first();
		}

		_activate() {
			var self = this;
			ComponentBase.bindLinks(this._top(), this._ns); // boosted navigation from inside the shadow root
			$(document).on("app:languagechange" + this._ns, function () {
				self._render();
			});
			this._render();
		}

		// Everything goes in as text, never as HTML: the attributes come from the database
		_render() {
			var $top = this._top();
			function set(selector, value) {
				$top.find(selector)
					.text(value || "")
					.prop("hidden", !value);
			}
			$top.attr("href", this.getAttribute("href") || null);
			set(".title", this.getAttribute("job-title"));
			set(".company", this.getAttribute("company"));
			set(".location", this.getAttribute("location"));
			set(".type", this.getAttribute("employment-type"));

			var posted = this.getAttribute("posted");
			var text = "";
			if (posted && window.i18next) {
				text = window.i18next.t("jobs:card.posted", { date: formatDate(posted) });
			}
			set(".posted", text);
		}
	}

	ComponentBase.define(here.tag, JobCard);
})();
