/*!
 * component-base.js: shared helpers for the site's web components (Shadow DOM + jQuery)
 *
 * Every component (nav-bar, navbar-toggle, portal-button, ...) uses this file for the plumbing that would
 * otherwise be copied into each of them. It knows nothing about any particular component, so a component
 * can be used anywhere, with or without a <nav-bar> around it.
 *
 * FILE (one folder, included once in the <head>, AFTER jQuery and BEFORE every component)
 *   component-base.js
 *   <script src="/path/jquery.min.js"></script>
 *   <script src="/path/component-base/component-base.js"></script>
 *   <script src="/path/navbar-toggle/navbar-toggle.js"></script>
 * Without jQuery this script throws and creates nothing. Components that find no window.ComponentBase should throw too.
 *
 * Everything below hangs off window.ComponentBase (frozen).
 *
 * WHERE AM I LOADED FROM
 *   var here = ComponentBase.locate("navbar-toggle");            // first line of the component's js, while it runs
 *   var here = ComponentBase.locate("navbar", "nav-bar");        // second argument: tag when the name is not the tag
 *     here.tag          the custom element name (the data-tag attribute of the script tag wins, so it can be renamed)
 *     here.src          URL of the component's js
 *     here.sibling(p)   URL of a file next to it; keeps ?v=... so cache busting reaches every file
 *   It must be called synchronously at the top of the component's js (document.currentScript only exists then).
 *   Throws if the tag is not a valid custom element name (lowercase, with a hyphen).
 *   ComponentBase.define(tag, Class)   customElements.define that warns instead of throwing when the tag exists.
 *
 * LOADING FILES
 *   ComponentBase.bundleLoader(urls, optional, transform, label) -> load()
 *       load() fetches everything ONCE for all instances and returns a Promise of { html, css, svg, ... }.
 *       urls      { html: url, css: url, svg: url, i18n: url }  (any text keys; "i18n" is special, see below)
 *       optional  keys that only warn when missing: ["svg"]
 *       transform optional function(bundle) -> bundle (or a Promise), e.g. to clean up an svg
 *       label     prefix for messages, e.g. "navbar"
 *       A failed load is not cached, so the next load() tries again.
 *     The "i18n" key is the component's .i18n.js. It is run as a script (it registers its strings with
 *     $.localization), not returned as text. A missing file, or a page without $.localization, only warns.
 *     It always finishes before the Promise resolves, so strings exist before the component first translates.
 *   ComponentBase.loadBundle(urls, optional, label)   the same without the cache.
 *   ComponentBase.fetchText(url, label), ComponentBase.loadScript(url, label)   single files (scripts load once per URL).
 *   ComponentBase.applyStyle(root, cssText)   constructable stylesheet on a shadow root, <style> fallback.
 *   ComponentBase.hold(root, css) / .release(root)
 *       hold hides the component while it loads (default css ":host{visibility:hidden}"); release shows it.
 *
 * EVENTS
 *   ComponentBase.emit(source, name, detail, cancelable) -> { event, canceled, pending }
 *       bubbles + composed, so it crosses shadow roots and works with addEventListener and jQuery (e.detail).
 *       Every event gets detail.waitUntil(promise); it only has an effect on cancelable events.
 *   ComponentBase.detailOf(e)   the detail of a native or jQuery event.
 *
 * LINKS INSIDE A SHADOW ROOT
 *   htmx cannot see <a> tags inside a shadow root, so boosted navigation (splash, partial page swap) would be lost
 *   and every link would reload the page. ComponentBase.bindLinks($top, ns) fixes that: for a plain left click on
 *   a same-origin link it calls $.navigation.navigateTo(url), exactly like a boosted link.
 *   $top is the component's top element inside the shadow root. jQuery cannot attach events to the ShadowRoot
 *   itself (it silently ignores it), so bind on an element; .find() on the ShadowRoot is fine.
 *   data-splash="off" on the link or an ancestor inside the shadow root navigates without the splash.
 *   (navigateTo takes hx-target / hx-select / hx-swap from <body>, so those on a single link are not used.)
 *   Left to the browser: modified clicks, target="_blank" or download, other origins, hash-only links on the
 *   current page, and anything with hx-boost="false" on the link or an ancestor inside the shadow root.
 *   Without $.navigation it does nothing, so links keep working as normal links.
 *
 * LOCALIZATION INSIDE A SHADOW ROOT
 *   $.localization translates the document only; it does not enter shadow roots.
 *   ComponentBase.translate(target)          translate an element (jQuery object, element) once i18next is ready.
 *   ComponentBase.watchLanguage(ns, target)  translate it again on every language switch (app:languagechange).
 *   ComponentBase.unwatchLanguage(ns)        call it from disconnectedCallback.
 *   Pass the component's top element inside the shadow root (not the ShadowRoot itself).
 *   All three do nothing when $.localization is missing.
 *
 * SMALL HELPERS
 *   ComponentBase.namespace(name)           unique jQuery event namespace per instance: ".navbar-toggle3"
 *   ComponentBase.rafThrottle(fn)           run fn at most once per animation frame
 *   ComponentBase.setAttrIfChanged(el, name, value)
 */
(function () {
	"use strict";

	if (window.ComponentBase) {
		return;
	}

	/* ------------------------------------------------------------------ */
	/* jQuery (hard dependency)                                            */
	/* ------------------------------------------------------------------ */

	if (typeof window.jQuery !== "function") {
		throw new Error(
			"[component-base] jQuery is required but window.jQuery was not found. " +
				"Load jQuery before component-base.js. ComponentBase was not created."
		);
	}

	(function ($) {
		var TAG_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)+$/;
		var uid = 0;
		var scriptLoads = {}; // url -> Promise, so a script runs once however many components ask for it

		/* -------------------------------------------------------------- */
		/* Where am I loaded from?                                          */
		/* -------------------------------------------------------------- */

		function escapeRegExp(s) {
			return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		}

		function locate(name, defaultTag) {
			var script = document.currentScript;
			if (!script) {
				var all = document.getElementsByTagName("script");
				var re = new RegExp("/" + escapeRegExp(name) + "\\.js(\\?|#|$)");
				for (var i = all.length - 1; i >= 0; i--) {
					if (re.test(all[i].src)) {
						script = all[i];
						break;
					}
				}
			}
			var src = new URL(script && script.src ? script.src : name + ".js", document.baseURI);
			var tag = (script && script.getAttribute("data-tag")) || defaultTag || name;
			if (!TAG_PATTERN.test(tag)) {
				throw new Error(
					"[" +
						name +
						'] "' +
						tag +
						'" is not a valid custom element name: it must be lowercase and contain a hyphen.'
				);
			}
			return {
				name: name,
				tag: tag,
				src: src.href,
				sibling: function (path) {
					// keeps ?v=... so cache busting reaches every file
					var u = new URL(path, src);
					u.search = src.search;
					return u.href;
				},
			};
		}

		function define(tag, Class) {
			if (window.customElements.get(tag)) {
				console.warn(
					"[component-base] <" +
						tag +
						"> is already defined; the second definition was ignored."
				);
				return;
			}
			window.customElements.define(tag, Class);
		}

		/* -------------------------------------------------------------- */
		/* Loading files                                                    */
		/* -------------------------------------------------------------- */

		function fetchText(url, label) {
			return new Promise(function (resolve, reject) {
				$.ajax({ url: url, dataType: "text" })
					.done(resolve)
					.fail(function (xhr, status, err) {
						reject(
							new Error(
								"[" +
									(label || "component-base") +
									"] could not load " +
									url +
									" (" +
									(err || status) +
									")"
							)
						);
					});
			});
		}

		// A real <script> element (not $.ajax + eval), so it also works under a strict content-security policy.
		function loadScript(url, label) {
			if (!scriptLoads[url]) {
				scriptLoads[url] = new Promise(function (resolve, reject) {
					var el = document.createElement("script");
					el.onload = function () {
						resolve("");
					};
					el.onerror = function () {
						reject(
							new Error(
								"[" + (label || "component-base") + "] could not load " + url
							)
						);
					};
					el.src = url;
					document.head.appendChild(el);
				});
				scriptLoads[url].catch(function () {
					delete scriptLoads[url];
				});
			}
			return scriptLoads[url];
		}

		function loadI18n(url, label) {
			if (!$.localization || typeof $.localization.register !== "function") {
				console.warn(
					"[" +
						(label || "component-base") +
						"] $.localization not found; " +
						url +
						" was not loaded."
				);
				return Promise.resolve("");
			}
			return loadScript(url, label);
		}

		function makeSheet(cssText) {
			if (
				"adoptedStyleSheets" in Document.prototype &&
				window.CSSStyleSheet &&
				"replaceSync" in CSSStyleSheet.prototype
			) {
				var sheet = new CSSStyleSheet();
				sheet.replaceSync(cssText);
				return sheet;
			}
			return null;
		}

		/** Put one stylesheet into a shadow root (constructable sheet, <style> fallback). */
		function applyStyle(root, cssText) {
			if (!cssText) {
				return;
			}
			var sheet = makeSheet(cssText);
			if (sheet) {
				root.adoptedStyleSheets = [sheet];
			} else {
				$(root).append($("<style></style>").text(cssText));
			}
		}

		/**
		 * Fetch several files in parallel: loadBundle({ html: url, css: url, svg: url, i18n: url }, ['svg'], 'navbar').
		 * Keys listed in `optional` only warn when missing. "i18n" is run as a script and always only warns.
		 * Resolves with { html, css, svg, i18n } (texts; "" for the i18n script and for missing optional files).
		 */
		function loadBundle(urls, optional, label) {
			optional = optional || [];
			var keys = Object.keys(urls);
			return Promise.all(
				keys.map(function (k) {
					var isI18n = k === "i18n";
					var p = isI18n ? loadI18n(urls[k], label) : fetchText(urls[k], label);
					if (isI18n || optional.indexOf(k) !== -1) {
						p = p.catch(function (e) {
							console.warn(e.message);
							return "";
						});
					}
					return p;
				})
			).then(function (texts) {
				var out = {};
				keys.forEach(function (k, i) {
					out[k] = texts[i];
				});
				return out;
			});
		}

		/** loadBundle, fetched once for all instances of a component. Returns a function that returns the Promise. */
		function bundleLoader(urls, optional, transform, label) {
			var promise = null;
			return function load() {
				if (!promise) {
					promise = loadBundle(urls, optional, label);
					if (transform) {
						promise = promise.then(transform);
					}
					promise.catch(function () {
						promise = null; // try again next time
					});
				}
				return promise;
			};
		}

		/** Keep a component invisible until its html and css are in place. */
		function hold(root, css) {
			$(root).append($("<style data-boot></style>").text(css || ":host{visibility:hidden}"));
		}

		function release(root) {
			$(root).find("style[data-boot]").remove();
		}

		/* -------------------------------------------------------------- */
		/* Events                                                           */
		/* -------------------------------------------------------------- */

		/**
		 * Standard event: bubbles + composed, so it crosses shadow boundaries and can be caught with
		 * addEventListener or jQuery (`e.detail` is available on the jQuery event).
		 * Every event gets detail.waitUntil(promise); it only has an effect on cancelable events.
		 * Returns { event, canceled, pending } where pending = the promises handlers registered.
		 */
		function emit(source, name, detail, cancelable) {
			var pending = [];
			var d = $.extend({}, detail);
			d.waitUntil = function (p) {
				pending.push(Promise.resolve(p));
			};
			var ev = new CustomEvent(name, {
				bubbles: true,
				composed: true,
				cancelable: !!cancelable,
				detail: d,
			});
			source.dispatchEvent(ev);
			return { event: ev, canceled: ev.defaultPrevented, pending: pending };
		}

		function detailOf(e) {
			return (e.originalEvent || e).detail || {};
		}

		/* -------------------------------------------------------------- */
		/* Links inside a shadow root                                       */
		/* -------------------------------------------------------------- */

		function onLinkClick(e) {
			var oe = e.originalEvent || e;
			if (e.isDefaultPrevented() || oe.button !== 0) {
				return;
			}
			if (oe.metaKey || oe.ctrlKey || oe.shiftKey || oe.altKey) {
				return;
			}
			var a = e.currentTarget;
			var target = a.getAttribute("target");
			if ((target && target !== "_self") || a.hasAttribute("download")) {
				return;
			}
			if ($(a).closest('[hx-boost="false"]').length) {
				return; // e.g. the Desk link: a different app, full page load
			}
			if (!$.navigation || typeof $.navigation.navigateTo !== "function") {
				return;
			}
			var url;
			try {
				url = new URL(a.href, document.baseURI);
			} catch (err) {
				return;
			}
			if (url.origin !== window.location.origin) {
				return;
			}
			if (
				url.hash &&
				url.pathname === window.location.pathname &&
				url.search === window.location.search
			) {
				return; // jump inside the current page
			}
			e.preventDefault();
			var splash = !$(a).closest('[data-splash="off"]').length;
			$.navigation.navigateTo(url.pathname + url.search + url.hash, splash);
		}

		/**
		 * Boosted-link behaviour for the <a href> tags inside a shadow root (see the header).
		 * Delegated on the component's top element, so links added later are covered. Safe to call on every connect.
		 */
		function bindLinks($top, ns) {
			var type = "click" + ns + ".links";
			$top.off(type).on(type, "a[href]", onLinkClick);
		}

		/* -------------------------------------------------------------- */
		/* Localization inside a shadow root                                */
		/* -------------------------------------------------------------- */

		function translate(target) {
			if (!$.localization || typeof $.localization.onReady !== "function") {
				return;
			}
			var $target = $(target);
			$.localization.onReady(function () {
				$.localization.translate($target);
			});
		}

		function watchLanguage(ns, target) {
			var type = "app:languagechange" + ns + ".i18n";
			$(document)
				.off(type)
				.on(type, function () {
					translate(target);
				});
		}

		function unwatchLanguage(ns) {
			$(document).off("app:languagechange" + ns + ".i18n");
		}

		/* -------------------------------------------------------------- */
		/* Small helpers                                                    */
		/* -------------------------------------------------------------- */

		function namespace(name) {
			return "." + name + ++uid;
		}

		function rafThrottle(fn) {
			var pending = false;
			return function () {
				if (pending) {
					return;
				}
				pending = true;
				requestAnimationFrame(function () {
					pending = false;
					fn();
				});
			};
		}

		function setAttrIfChanged(el, name, value) {
			if (el.getAttribute(name) !== value) {
				el.setAttribute(name, value);
			}
		}

		window.ComponentBase = Object.freeze({
			locate: locate,
			define: define,
			fetchText: fetchText,
			loadScript: loadScript,
			loadBundle: loadBundle,
			bundleLoader: bundleLoader,
			applyStyle: applyStyle,
			hold: hold,
			release: release,
			emit: emit,
			detailOf: detailOf,
			bindLinks: bindLinks,
			translate: translate,
			watchLanguage: watchLanguage,
			unwatchLanguage: unwatchLanguage,
			namespace: namespace,
			rafThrottle: rafThrottle,
			setAttrIfChanged: setAttrIfChanged,
		});
	})(window.jQuery);
})();
