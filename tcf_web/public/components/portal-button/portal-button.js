$(document).ready(function () {
	// ---- Config -------------------------------------------------------
	const MAIN_PAGE = "/"; // fallback when the current page can't be a return target
	const LOGIN_URL = "/login";
	const REDIRECT_PARAM = "redirect-to"; // Frappe's query parameter name
	const PORTAL_URL = "/portal";
	const DESK_URL = "/desk";
	const DESK_ROLE = "Desk User";

	// Desktop and mobile variants (only one is visible at a time, both are kept in sync)
	const DESKTOP_SELECTOR = ".portal-button-desktop-container";
	const MOBILE_SELECTOR = ".portal-button-mobile-container";
	const BUTTON_SELECTOR = DESKTOP_SELECTOR + ", " + MOBILE_SELECTOR;

	const DESKTOP_LABEL_SELECTOR = ".portal-button-desktop-label"; // desktop: inner label
	// mobile: the container itself carries data-i18n, so it is its own label
	const ICON_SELECTOR = ".portal-button-desktop-icon"; // mobile has no icon

	// ---- States -------------------------------------------------------
	// href may be a function so it is evaluated when applied, not at load time
	const STATES = {
		guest: {
			i18n: "portal-button:guest",
			icon: "account_circle",
			href: getLoginUrl,
			boost: true,
		},
		portalUser: {
			i18n: "portal-button:loggedUser.portalUser",
			icon: "globe",
			href: PORTAL_URL,
			boost: true,
		},
		deskUser: {
			i18n: "portal-button:loggedUser.deskUser",
			icon: "apps",
			href: DESK_URL,
			boost: false, // Desk is a different app: full page load, not htmx
		},
	};

	// ---- Helpers ------------------------------------------------------
	function getReturnPath() {
		// Current page as a same-origin relative URL
		let path = window.location.pathname + window.location.search + window.location.hash;

		// Collapse leading slashes so "//host" can never be read as an external URL
		path = path.replace(/^\/+/, "/");

		// Never return to the login page itself (would loop)
		const pathname = window.location.pathname;
		if (pathname === LOGIN_URL || pathname.startsWith(LOGIN_URL + "/")) {
			return MAIN_PAGE;
		}
		return path || MAIN_PAGE;
	}

	function getLoginUrl() {
		return LOGIN_URL + "?" + REDIRECT_PARAM + "=" + encodeURIComponent(getReturnPath());
	}

	function getStateName(session) {
		if (!session) return null; // session not known yet: leave the buttons alone
		if (session.isGuest) return "guest";
		const roles = Array.isArray(session.roles) ? session.roles : [];
		return roles.includes(DESK_ROLE) ? "deskUser" : "portalUser";
	}

	function resolveHref(state) {
		return typeof state.href === "function" ? state.href() : state.href;
	}

	function translate($element) {
		// If i18next isn't ready yet, the global localization will translate
		// every [data-i18n] element once it initialises.
		if ($.fn.localize && window.i18next && window.i18next.isInitialized) {
			$element.localize();
		}
	}

	// The element that holds the translated text: the mobile button itself,
	// or the inner label of the desktop button
	function getLabel($button) {
		return $button.is(MOBILE_SELECTOR) ? $button : $button.find(DESKTOP_LABEL_SELECTOR);
	}

	function applyState(session) {
		const stateName = getStateName(session);
		if (!stateName) return;
		const state = STATES[stateName];

		// Query on every call: buttons may have been replaced by an htmx swap
		$(BUTTON_SELECTOR).each(function () {
			const $button = $(this);

			$button.attr("data-portal-state", stateName);
			$button.attr("href", resolveHref(state));
			if (state.boost) {
				$button.removeAttr("hx-boost");
			} else {
				$button.attr("hx-boost", "false");
			}

			const $label = getLabel($button);
			$label.attr("data-i18n", state.i18n);
			translate($label);

			// No-op on the mobile button (no icon element)
			$button.find(ICON_SELECTOR).text(state.icon);
		});
	}

	function applyCurrentSession() {
		applyState($.api && $.api.session);
	}

	// Only the guest href depends on the current page, so only refresh that one
	function refreshGuestHref() {
		$(BUTTON_SELECTOR).filter('[data-portal-state="guest"]').attr("href", getLoginUrl());
	}

	// ---- Triggers -----------------------------------------------------
	// 1. Session became available / changed (login, logout)
	$(document).on("frappe:ready", function (event, session) {
		applyState(session);
	});
	$(document).on("frappe:session-changed", function (event, session) {
		applyState(session);
	});

	// 2. The page changed or the buttons were re-rendered by htmx
	$(document).on("htmx:afterSettle htmx:historyRestore", applyCurrentSession);
	$(window).on("popstate hashchange", refreshGuestHref);

	// 3. Just before the user interacts (covers click, tap, middle-click, copy link)
	$(document).on(
		"pointerenter pointerdown focusin contextmenu",
		BUTTON_SELECTOR,
		refreshGuestHref
	);

	// 4. The session was already available before this handler was registered
	applyCurrentSession();
});
