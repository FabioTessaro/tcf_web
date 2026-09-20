/**
 * localization.js
 * -----------------------------------------------------------------------------
 * Master localization controller. Initialises i18next once, collects the strings
 * that every component registers, translates the DOM, and owns the language choice.
 * Everything else (component strings, the language switcher) talks to it through
 * window.AppI18n.
 *
 * DEPENDENCIES (all with `defer`, in <head>, in this order, before this file)
 *   1. jQuery 3.x
 *   2. i18next, UMD build from the CDN            -> window.i18next
 *   3. jquery-i18next                             -> window.jqueryI18next
 *   This file must load BEFORE any component .i18n.js file. If i18next or
 *   jquery-i18next is missing, an error is logged and nothing else runs.
 *   Pin exact CDN versions in production.
 *
 * THE RULE: WHAT MAKES TEXT TRANSLATABLE
 *   Text is translated only if BOTH are true:
 *     (a) its namespace is registered with AppI18n.register(), and
 *     (b) the element that shows it has a data-i18n attribute.
 *   A namespace comes from one of two places:
 *     - a component's own <name>.i18n.js file (one namespace per component), or
 *     - the "common" namespace registered at the bottom of THIS file, for strings
 *       shared across the site (no separate file needed).
 *   Text without data-i18n is never touched. Text rendered by Jinja stays as it is
 *   unless you add data-i18n to its element.
 *
 * ADDING A COMPONENT (3 steps)
 *   1. js/component/<name>/<name>.i18n.js registers the namespace, named after the folder:
 *          AppI18n.register('pricing-card', {
 *              'en-GB': { title: 'Our plans', cta: { buy: 'Buy now' } },
 *              'de-DE': { title: 'Unsere Tarife', cta: { buy: 'Jetzt kaufen' } },
 *              // ...one block per supported language
 *          });
 *   2. Mark up the component's HTML. Keep the default text inside the element:
 *          <h2 data-i18n="pricing-card:title">Our plans</h2>
 *   3. Include both scripts at the end of the component's Jinja template, .i18n.js first:
 *          <script src=".../pricing-card.i18n.js" defer></script>
 *          <script src=".../pricing-card.js" defer></script>
 *
 * ATTRIBUTES YOU CAN SET ON ELEMENTS (syntax of the jquery-i18next plugin)
 *   data-i18n="ns:key"                    Sets the element's text.
 *   data-i18n="[html]ns:key"              Sets innerHTML. Trusted strings only, never user input.
 *   data-i18n="[placeholder]ns:key"       Sets an attribute (title, alt, aria-label, ...).
 *   data-i18n="[title]ns:a;ns:b"          Several targets, separated by ";" (here: title + text).
 *   data-i18n-options='{"count": 3}'      Interpolation ({{name}}), plurals (count),
 *                                         context. Must be valid JSON.
 *   Keys can be nested: "ns:cta.buy". Plurals use the suffixes _zero, _one and _other
 *   (zh-CN and ja-JP only need _other). Formatting such as {{amount, currency(EUR)}}
 *   follows the active language.
 *
 * PUBLIC API (window.AppI18n)
 *   register(ns, bundles)   Adds a namespace: { 'en-GB': {...}, 'de-DE': {...} }.
 *                           Idempotent: registering twice overwrites. Works before and
 *                           after init; after init it re-translates the page.
 *   setLanguage(code)       Switches language. Returns a Promise. Unsupported codes are
 *                           ignored. This is the ONLY call needed to change the site
 *                           language. Do not call i18next.changeLanguage() directly.
 *   translate(root)         Translates root (DOM element or jQuery object); the whole
 *                           document if omitted. Same as $(root).localize().
 *   onReady(cb)             Runs cb once i18next is initialised (immediately if it
 *                           already is). Use it for anything that needs $.t or .localize().
 *   language                Current language code, e.g. "de-DE" (getter).
 *   supported               Copy of the supported language codes (getter).
 *
 * EVENTS
 *   "app:languagechange"    Triggered on document after every language switch:
 *                               $(document).on('app:languagechange', function (e, lng) {...});
 *                           It is a jQuery event, so it reaches jQuery handlers only,
 *                           not native addEventListener. Use it to re-render anything
 *                           that is not plain data-i18n DOM text (chart labels, canvas).
 *
 * CONTENT LOADED LATER (ajax, htmx, injected markup)
 *   New markup keeps its default text until it is translated:
 *       $('#box').html(html).localize();      // or AppI18n.translate(el)
 *   With htmx this is done for you by navigation.js (htmx:afterSwap and
 *   htmx:historyRestore). Set counts with .attr('data-i18n-options', ...), NOT .data(),
 *   because the plugin reads the attribute.
 *
 * BEHAVIOUR SUMMARY
 *   - Init:        runs on DOMContentLoaded, which fires after every deferred script, so all
 *                  .i18n.js files on the initial page have registered by then.
 *   - Language:    saved choice (localStorage "app.lang") -> browser languages, matched on the
 *                  base language (en-US -> en-GB, de-AT -> de-DE, zh-TW -> zh-CN) ->
 *                  fallback language.
 *   - Switch:      setLanguage() changes the i18next language, saves it, sets <html lang>
 *                  (this drives the :lang() typeface rules in the SCSS), translates the
 *                  page, then triggers "app:languagechange".
 *   - Missing:     a key missing in a language falls back to the fallback language; a key
 *                  missing everywhere, or a namespace that was never registered, leaves
 *                  the default text from the HTML in place. It fails silently.
 *   - Before init: $.t and .localize() do not exist yet. Wrap early calls in onReady().
 *
 * ADDING A LANGUAGE (keep these in sync)
 *   1. CONFIG.supported below         (currently en-GB, de-DE, it-IT, zh-CN, ja-JP)
 *   2. a block in every .i18n.js file and in "common" below
 *   3. an <option> in the language switcher template
 *   4. $languages in scss/config/_typography.scss (script group for the typefaces)
 *
 * DEBUGGING (browser console)
 *   AppI18n.language                              current language
 *   i18next.exists('pricing-card:title')          is the key found in the current language?
 *   i18next.hasResourceBundle('de-DE', 'pricing-card')   was the namespace registered?
 *   i18next.getResourceBundle('de-DE', 'pricing-card')   what strings did it register?
 *   Setting debug: true in the i18next.init() options below logs every missing key.
 *
 * GOTCHAS
 *   - Init is deliberately started from the native DOMContentLoaded event, not $(fn).
 *     jQuery's ready callback can fire between deferred scripts, before later component
 *     .i18n.js files have registered.
 *   - Inline <script> blocks that use $ or AppI18n break with deferred scripts: they run
 *     before the libraries. Keep such code in component files.
 *   - A component swapped in by htmx runs its <script> tags AFTER htmx:afterSwap. Put the
 *     .i18n.js files in the base template so namespaces exist before any swap.
 *   - interpolation.escapeValue is false (text is set through textContent). Do not
 *     interpolate user input into [html] strings.
 *   - The language codes must match everywhere: CONFIG.supported, the keys of every
 *     .i18n.js block, the switcher's <option value>, and the SCSS $languages map.
 * -----------------------------------------------------------------------------
 */

(function ($) {
	"use strict";

	if (!window.i18next || !window.jqueryI18next) {
		console.error("[i18n] i18next or jquery-i18next failed to load from the CDN.");
		return;
	}

	const CONFIG = {
		supported: ["en-GB", "de-DE", "it-IT", "zh-CN", "ja-JP"],
		fallback: "en",
		storageKey: "tcfgroup.lang",
		defaultNS: "common",
	};

	const registry = {}; // { namespace: { lng: { key: value } } }
	const ready = $.Callbacks("once memory"); // 'memory': callbacks added after firing run immediately
	let isReady = false;

	// ---- language resolution -------------------------------------------------
	function matchSupported(code) {
		if (!code) return null;
		const lower = String(code).toLowerCase();
		const exact = CONFIG.supported.find((s) => s.toLowerCase() === lower);
		if (exact) return exact;
		const base = lower.split("-")[0];
		return CONFIG.supported.find((s) => s.toLowerCase().split("-")[0] === base) || null;
	}

	function detectLanguage() {
		try {
			const saved = matchSupported(localStorage.getItem(CONFIG.storageKey));
			if (saved) return saved;
		} catch (e) {
			/* storage blocked */
		}
		const prefs = navigator.languages || [navigator.language];
		for (let i = 0; i < prefs.length; i++) {
			const m = matchSupported(prefs[i]);
			if (m) return m;
		}
		return CONFIG.fallback;
	}

	// ---- DOM translation (delegated to jquery-i18next) -----------------------
	function translate(root) {
		$(root || document.documentElement).localize();
	}

	function applyLanguage(lng) {
		$("html").attr("lang", lng); // drives :lang() CSS in step 5
		translate();
	}

	// ---- public API ----------------------------------------------------------
	function register(ns, bundles) {
		registry[ns] = bundles;
		if (!isReady) return; // picked up by init()
		$.each(bundles, function (lng, res) {
			i18next.addResourceBundle(lng, ns, res, true, true);
		});
		translate();
	}

	function setLanguage(lng) {
		const target = matchSupported(lng);
		if (!target) return Promise.resolve();
		return i18next.changeLanguage(target).then(function () {
			try {
				localStorage.setItem(CONFIG.storageKey, target);
			} catch (e) {
				// Add a catch here?
			}
			applyLanguage(target);
			$(document).trigger("app:languagechange", [target]);
		});
	}

	$.localization = {
		register: register,
		setLanguage: setLanguage,
		translate: translate,
		onReady: function (cb) {
			ready.add(cb);
		},
		get language() {
			return i18next.language;
		},
		get supported() {
			return CONFIG.supported.slice();
		},
	};

	// ---- init ----------------------------------------------------------------
	function init() {
		const lng = detectLanguage();

		const resources = {};
		$.each(registry, function (ns, bundles) {
			$.each(bundles, function (l, res) {
				(resources[l] = resources[l] || {})[ns] = res;
			});
		});

		i18next
			.init({
				lng: lng,
				fallbackLng: CONFIG.fallback,
				supportedLngs: CONFIG.supported,
				load: "currentOnly",
				ns: Object.keys(registry),
				defaultNS: CONFIG.defaultNS,
				resources: resources,
				interpolation: { escapeValue: false },
			})
			.then(function () {
				jqueryI18next.init(i18next, $, { useOptionsAttr: true }); // adds $.fn.localize and $.t
				isReady = true;
				applyLanguage(lng);
				ready.fire();
			});
	}

	// Native DOMContentLoaded on purpose, not $(fn): see the notes below.
	if (document.readyState === "complete") init();
	else document.addEventListener("DOMContentLoaded", init);
})(jQuery);
