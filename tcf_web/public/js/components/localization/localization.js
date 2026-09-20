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

	window.AppI18n = {
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
