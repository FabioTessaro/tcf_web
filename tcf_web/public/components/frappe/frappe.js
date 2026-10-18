import { FrappeApp } from "https://cdn.jsdelivr.net/npm/frappe-js-sdk/+esm";

/*
 * frappe.js: core bootstrap. Runs once per page load.
 *
 * Owns: $.api.session, $.api.sdk, $.api.ready, $.api.extend.
 * Everything else ($.api.auth, $.api.db, ...) is registered by extension files via $.api.extend.
 * Requires jQuery to be loaded as a classic script before this module.
 */

const SESSION_METHOD = "tcf_web.api.session.get_session";
const CSRF_HEADER = "X-Frappe-CSRF-Token";

// name -> factory. Re-run on every rebuild so extensions never hold a stale SDK instance.
const factories = {};
let bootstrapped = false;
let inflight = null;

// Stable object: other scripts can keep a reference to it, we only mutate it.
const session = {
	user: "Guest",
	isGuest: true,
	fullName: null,
	roles: [],
	lang: null,
	csrf: null,
	failed: false,
	refresh: refresh,
};

$.api = {
	session: session,
	sdk: null,
	ready: null,
	extend: extend,
};

function fetchSession() {
	return fetch("/api/method/" + SESSION_METHOD, {
		credentials: "same-origin",
		headers: { Accept: "application/json" },
	})
		.then(function (res) {
			if (!res.ok) throw new Error("get_session failed with status " + res.status);
			return res.json();
		})
		.then(function (body) {
			return body.message;
		});
}

function applySession(data) {
	session.user = data.user;
	session.isGuest = data.is_guest;
	session.fullName = data.full_name;
	session.roles = data.roles;
	session.lang = data.lang;
	session.csrf = data.csrf_token;
	session.failed = false;
}

function runFactory(name) {
	$.api[name] = factories[name]({ sdk: $.api.sdk, session: session });
}

// (Re)creates the SDK instance with the current CSRF token, then re-runs every extension.
function build() {
	const headers = {};
	if (session.csrf) headers[CSRF_HEADER] = session.csrf;

	const app = new FrappeApp(location.origin, undefined, undefined, headers);

	$.api.sdk = {
		app: app,
		auth: app.auth(),
		db: app.db(),
		call: app.call(),
		file: app.file(),
	};

	Object.keys(factories).forEach(runFactory);
}

function refresh() {
	if (inflight) return inflight;

	const previousUser = session.user;

	inflight = fetchSession()
		.then(applySession)
		.catch(function (err) {
			console.error("[frappe] could not load session", err);
			session.failed = true;
		})
		.then(function () {
			if (!bootstrapped) {
				build();
				bootstrapped = true;
				$(document).trigger("frappe:ready", [session]);
			} else if (!session.failed) {
				// Only rebuild and announce when we actually got fresh data.
				build();
				$(document).trigger("frappe:session-changed", [session, previousUser]);
			}

			return session;
		})
		.finally(function () {
			inflight = null;
		});

	return inflight;
}

// Register a feature under $.api[name]. The factory gets { sdk, session } and returns the public object.
function extend(name, factory) {
	factories[name] = factory;
	if ($.api.sdk) runFactory(name);
	return $.api;
}

$.api.ready = refresh();
