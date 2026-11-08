(function () {
	"use strict";

	if (typeof window.ComponentBase !== "object") {
		throw new Error(
			"[job-detail] ComponentBase was not found. Load jQuery and then component-base.js first."
		);
	}

	var $ = window.jQuery;
	var here = ComponentBase.locate("job-detail");

	var load = ComponentBase.bundleLoader(
		{
			html: here.sibling("job-detail.html"),
			css: here.sibling("job-detail.css"),
			i18n: here.sibling("../jobs/jobs.i18n.js"), // shared "jobs" strings
		},
		[],
		null,
		"job-detail"
	);

	// Only same-origin targets, like everywhere else on the site
	function localUrl(value) {
		try {
			var url = new URL(value, window.location.origin);
			return url.origin === window.location.origin ? url.pathname + url.search : null;
		} catch (e) {
			return null;
		}
	}

	function formatDate(iso) {
		var date = new Date(iso + "T00:00:00");
		if (!iso || isNaN(date.getTime())) {
			return iso || "";
		}
		return new Intl.DateTimeFormat(document.documentElement.lang || undefined, {
			dateStyle: "long",
		}).format(date);
	}

	class JobDetail extends HTMLElement {
		static get observedAttributes() {
			return [
				"job-title",
				"company",
				"posted",
				"location",
				"department",
				"employment-type",
				"salary",
				"closes",
				"status",
				"apply-href",
			];
		}

		constructor() {
			super();
			this._ns = ComponentBase.namespace("job-detail");
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
			ComponentBase.unwatchLanguage(this._ns);
			$(document).off(this._ns);
			this._top().off(this._ns);
		}

		attributeChangedCallback() {
			if (this._built) {
				this._render();
			}
		}

		_top() {
			return $(this._root).find(".detail").first();
		}

		_activate() {
			var self = this;
			var $top = this._top();
			ComponentBase.translate($top);
			ComponentBase.watchLanguage(this._ns, $top);
			ComponentBase.bindLinks($top, this._ns);

			// primary-button delivers no clicks while it is disabled or loading
			$top.on("click" + this._ns, ".apply", function () {
				var target = localUrl(self.getAttribute("apply-href"));
				if (!target) {
					return;
				}
				if ($.navigation && typeof $.navigation.navigateTo === "function") {
					$.navigation.navigateTo(target);
				} else {
					window.location.assign(target);
				}
			});
			$(document).on("app:languagechange" + this._ns, function () {
				self._render();
			});
			this._render();
		}

		// Everything goes in as text, never as HTML: the attributes come from the database
		_render() {
			var $top = this._top();
			var self = this;
			var posted = this.getAttribute("posted");
			var company = this.getAttribute("company");
			var byline = [company, posted ? formatDate(posted) : ""].filter(Boolean).join(" · ");

			$top.find(".title").text(this.getAttribute("job-title") || "");
			$top.find(".byline").text(byline).prop("hidden", !byline);

			$top.find(".fact").each(function () {
				var field = this.getAttribute("data-field");
				var value = self.getAttribute(field) || "";
				if (field === "closes" && value) {
					value = formatDate(value);
				}
				$(this).find("dd").text(value);
				this.hidden = !value;
			});

			var open = (this.getAttribute("status") || "Open") === "Open";
			$top.find(".apply").prop("hidden", !open);
			$top.find(".closed").prop("hidden", open);
		}
	}

	ComponentBase.define(here.tag, JobDetail);
})();
