(function () {
	"use strict";

	if (typeof window.ComponentBase !== "object") {
		throw new Error(
			"[jobs-list] ComponentBase was not found. Load jQuery and then component-base.js first."
		);
	}

	var $ = window.jQuery;
	var here = ComponentBase.locate("jobs-list");

	var load = ComponentBase.bundleLoader(
		{
			html: here.sibling("jobs-list.html"),
			css: here.sibling("jobs-list.css"),
			i18n: here.sibling("../jobs/jobs.i18n.js"), // shared "jobs" strings
		},
		[],
		null,
		"jobs-list"
	);

	var LIST_PATH = "/jobs";

	function toInt(value, fallback) {
		var n = parseInt(value, 10);
		return isNaN(n) || n < 1 ? fallback : n;
	}

	class JobsList extends HTMLElement {
		static get observedAttributes() {
			return ["page", "pages", "query"];
		}

		constructor() {
			super();
			this._ns = ComponentBase.namespace("jobs-list");
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
					ComponentBase.translate($(self)); // the slotted heading and search field live in the page
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
			if (this._onSlotChange) {
				this._root.removeEventListener("slotchange", this._onSlotChange);
			}
		}

		attributeChangedCallback() {
			if (this._built) {
				this._render();
			}
		}

		_top() {
			return $(this._root).find(".jobs").first();
		}

		_activate() {
			var self = this;
			var $top = this._top();
			ComponentBase.translate($top);
			ComponentBase.watchLanguage(this._ns, $top);
			ComponentBase.bindLinks($top, this._ns); // pager links navigate like boosted links
			$(document).on("app:languagechange" + this._ns, function () {
				self._render();
			});
			// jQuery cannot bind on a ShadowRoot, so this one is native
			if (!this._onSlotChange) {
				this._onSlotChange = function () {
					self._render();
				};
			}
			this._root.addEventListener("slotchange", this._onSlotChange);
			this._render();
		}

		_href(page) {
			var params = new URLSearchParams();
			var query = this.getAttribute("query");
			if (query) {
				params.set("query", query);
			}
			if (page > 1) {
				params.set("page", String(page));
			}
			var qs = params.toString();
			return LIST_PATH + (qs ? "?" + qs : "");
		}

		_render() {
			var $top = this._top();
			var page = toInt(this.getAttribute("page"), 1);
			var pages = toInt(this.getAttribute("pages"), 1);
			var cards = this.querySelectorAll("job-card").length;

			$top.find(".empty").prop("hidden", cards > 0);

			// Pager: only when there is more than one page
			var $pager = $top.find(".pager");
			$pager.prop("hidden", pages <= 1);
			function link(selector, target, enabled, self) {
				var $a = $top.find(selector);
				$a.attr("href", enabled ? self._href(target) : null);
				$a.attr("aria-disabled", enabled ? null : "true");
			}
			link(".prev", page - 1, page > 1, this);
			link(".next", page + 1, page < pages, this);
			if (window.i18next) {
				$top.find(".count").text(
					window.i18next.t("jobs:pager.page", { page: page, pages: pages })
				);
			}
		}
	}

	ComponentBase.define(here.tag, JobsList);
})();
