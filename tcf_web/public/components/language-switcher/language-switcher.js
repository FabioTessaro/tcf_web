/*!
 * <language-switcher>: the language picker of the navbar, as a self-contained web component (Shadow DOM + jQuery)
 *
 * FILES (one folder; only language-switcher.js is included in pages)
 *   language-switcher.js    this file
 *   language-switcher.html  structure, placed inside the shadow root (plus one <template> row per variant)
 *   language-switcher.css   all styles of the shadow root (compiled from language-switcher.scss)
 *
 * USAGE (jQuery >= 3, localization.js and component-base.js must be loaded first; without any of them this script
 *        throws and registers nothing. localization.js is a hard dependency: it owns the language.)
 *   <script src="/path/to/jquery.min.js"></script>
 *   <script src="/path/to/i18next.min.js"></script>
 *   <script src="/path/to/jquery-i18next.min.js"></script>
 *   <script src="/path/to/localization/localization.js"></script>
 *   <script src="/path/to/component-base/component-base.js"></script>
 *   <script src="/path/to/language-switcher/language-switcher.js"></script>
 *   <nav-bar>
 *     <language-switcher navbar-role="utility">
 *       <option value="en-GB">English</option>
 *       <option value="de-DE">Deutsch</option>
 *       <option value="it-IT">Italiano</option>
 *       <option value="zh-CN">中文</option>
 *       <option value="ja-JP">日本語</option>
 *     </language-switcher>
 *   </nav-bar>
 *
 * THE OPTIONS
 *   One <option value="code">Label</option> child per language: value is the language code, the text is the name
 *   of the language in that language. The order of the children is the order of the list. There must be EXACTLY one
 *   option for every code in $.localization.supported, and no others. The check compares codes ignoring letter case
 *   and runs when the component is built and again whenever the children change.
 *   When it fails:
 *     - a clear message is written to the console (once per distinct problem),
 *     - the tag gets an empty "invalid" attribute (style it, or look for language-switcher[invalid] in a test),
 *     - only the valid options are shown: supported codes, first occurrence, non-empty label.
 *   Problems it reports: missing languages, codes that are not supported, codes listed more than once, empty labels.
 *   The label keeps its own lang attribute, so each name is typeset in its own script.
 *
 * WHAT IT DOES
 *   Picking a language calls $.localization.setLanguage(code); on mobile it also closes the popup. The trigger icon
 *   opens the popup, and a click on the dimmed background closes it. The desktop dropdown is pure CSS (hover).
 *   The component fires no events of its own: $.localization already triggers "app:languagechange" on document.
 *   navbar-role="utility" is set on the tag so the navbar puts it in its top row / mobile footer.
 */
(function () {
	"use strict";

	if (typeof window.ComponentBase !== "object") {
		throw new Error(
			"[language-switcher] ComponentBase was not found. Load jQuery and then component-base.js before language-switcher.js. " +
				"The language-switcher element was not registered."
		);
	}

	var $ = window.jQuery;

	if (!$.localization || typeof $.localization.setLanguage !== "function") {
		throw new Error(
			"[language-switcher] $.localization was not found. Load localization.js (after jQuery, i18next and jquery-i18next) " +
				"before language-switcher.js. The language-switcher element was not registered."
		);
	}

	var here = ComponentBase.locate("language-switcher"); // throws on an invalid data-tag
	var TAG = here.tag;

	/* ------------------------------------------------------------------ */
	/* Shared resources: fetched once for all instances                     */
	/* ------------------------------------------------------------------ */

	var load = ComponentBase.bundleLoader(
		{
			html: here.sibling("language-switcher.html"),
			css: here.sibling("language-switcher.css"),
		},
		[],
		null,
		"language-switcher"
	);

	/* ------------------------------------------------------------------ */
	/* The element                                                          */
	/* ------------------------------------------------------------------ */

	class LanguageSwitcher extends HTMLElement {
		constructor() {
			super();
			var self = this;
			this._ns = ComponentBase.namespace("language-switcher");
			this._built = false;
			this._loading = null;
			this._parsed = false; // the document has been parsed, so the <option> children are all there
			this._problem = ""; // the last problem reported, so the same one is logged once
			this._observer = null;
			this._render = ComponentBase.rafThrottle(function () {
				self._renderOptions();
			});
			this._root = this.attachShadow({ mode: "open" });
			ComponentBase.hold(this._root, ":host{display:contents;visibility:hidden}");
		}

		/* ---------------- lifecycle ---------------- */

		connectedCallback() {
			var self = this;
			if (this._built) {
				this._activate();
				return;
			}
			if (this._loading) {
				return;
			} // still loading; the pending callback will activate

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
			this._top().off(this._ns);
			if (this._observer) {
				this._observer.disconnect();
			}
		}

		/* ---------------- internals ---------------- */

		// jQuery cannot bind events on the ShadowRoot itself, so everything binds on the element inside it
		_top() {
			return $(this._root).find(".language-switcher-container").first();
		}

		_build(res) {
			var self = this;
			ComponentBase.applyStyle(this._root, res.css);
			$(this._root).append($.parseHTML(res.html));
			this._built = true;

			// The <option> children may not be parsed yet when the element connects: wait for the document
			this._whenParsed(function () {
				self._parsed = true;
				self._renderOptions();
				ComponentBase.release(self._root); // reveal
			});

			if (this.isConnected) {
				this._activate();
			}
		}

		_whenParsed(callback) {
			if (document.readyState !== "loading") {
				callback();
				return;
			}
			document.addEventListener("DOMContentLoaded", callback, { once: true });
		}

		// Read the <option> children and compare them with the supported languages
		_readOptions() {
			var supported = $.localization.supported; // a copy
			var byLower = {};
			supported.forEach(function (code) {
				byLower[code.toLowerCase()] = code;
			});

			var seen = {};
			var options = [];
			var unsupported = [];
			var duplicate = [];
			var empty = [];

			$(this)
				.children("option")
				.each(function () {
					var raw = this.getAttribute("value");
					var code = byLower[(raw || "").trim().toLowerCase()];
					var label = (this.textContent || "").trim();

					if (!code) {
						unsupported.push(raw && raw.trim() ? raw.trim() : "(no value)");
						return;
					}
					if (seen[code]) {
						duplicate.push(code);
						return;
					}
					seen[code] = true;
					if (!label) {
						empty.push(code);
						return;
					}
					options.push({ code: code, label: label });
				});

			var missing = supported.filter(function (code) {
				return !seen[code];
			});

			return {
				supported: supported,
				options: options,
				problems: {
					missing: missing,
					unsupported: unsupported,
					duplicate: duplicate,
					empty: empty,
				},
			};
		}

		// Log a problem once, and mirror it on the tag as the "invalid" attribute
		_report(supported, problems) {
			var parts = [];
			if (problems.missing.length) {
				parts.push("Missing: " + problems.missing.join(", ") + ".");
			}
			if (problems.unsupported.length) {
				parts.push("Not supported: " + problems.unsupported.join(", ") + ".");
			}
			if (problems.duplicate.length) {
				parts.push("Listed more than once: " + problems.duplicate.join(", ") + ".");
			}
			if (problems.empty.length) {
				parts.push("Without a label: " + problems.empty.join(", ") + ".");
			}
			var message = parts.join(" ");

			if (message) {
				if (message !== this._problem) {
					console.error(
						"[language-switcher] The <option> children do not match $.localization.supported (" +
							supported.join(", ") +
							"). " +
							message +
							' It needs exactly one <option value="code">Label</option> for each supported language.'
					);
				}
				ComponentBase.setAttrIfChanged(this, "invalid", "");
			} else {
				this.removeAttribute("invalid");
			}
			this._problem = message;
		}

		_template(kind) {
			return $(this._root)
				.find("template")
				.filter(".language-option-" + kind + "-template")[0];
		}

		// Fill one card with one row per valid option, using the template row for that variant
		_fill($card, template, options) {
			$card.empty();
			if (!template) {
				return;
			}
			options.forEach(function (option) {
				var row = template.content.firstElementChild.cloneNode(true);
				$(row).children("div").attr("lang", option.code).text(option.label);
				$card.append(row);
			});
		}

		_renderOptions() {
			var read = this._readOptions();
			this._report(read.supported, read.problems);

			var $top = this._top();
			this._fill(
				$top.find(".language-switcher-desktop-dropdown-card"),
				this._template("desktop"),
				read.options
			);
			this._fill(
				$top.find(".language-switcher-mobile-popup-card"),
				this._template("mobile"),
				read.options
			);
		}

		_setPopup(open) {
			this._top()
				.find(".language-switcher-mobile-popup-container")
				.attr("active", open ? "true" : "false");
		}

		_select(code) {
			if (!code) {
				return;
			}
			$.localization.setLanguage(code).catch(function (err) {
				console.error(err);
			});
		}

		// Runs on every connect: bind to the top element, never to document delegation
		_activate() {
			var self = this;
			var ns = this._ns;
			var $top = this._top();

			$top.off(ns)
				.on("click" + ns, ".language-option", function () {
					self._select($(this).children("div").attr("lang"));
				})
				.on("click" + ns, ".language-option-mobile", function () {
					self._select($(this).children("div").attr("lang"));
					self._setPopup(false);
				})
				.on("click" + ns, ".language-switcher-mobile-trigger", function () {
					self._setPopup(true);
				})
				.on("click" + ns, ".language-switcher-mobile-popup-container", function (event) {
					if (event.target === this) {
						self._setPopup(false); // a click on the dimmed background
					}
				});

			// Re-render when the <option> children change (added, removed, relabelled)
			if (!this._observer) {
				this._observer = new MutationObserver(function () {
					self._render();
				});
			}
			this._observer.disconnect();
			this._observer.observe(this, {
				childList: true,
				subtree: true,
				characterData: true,
				attributes: true,
				attributeFilter: ["value"],
			});

			if (this._parsed) {
				this._renderOptions(); // the children may have changed while the element was disconnected
			}
		}
	}

	ComponentBase.define(TAG, LanguageSwitcher);
})();
