/**
 * navigation.js
 * -----------------------------------------------------------------------------
 * Splash-screen and navigation controller for htmx sites.
 * Autonomous: it needs only the dependencies and markup below.
 *
 * DEPENDENCIES (load in this order, before this file)
 *   1. jQuery 3.x (on 1.x/2.x this file still works; it reads evt.originalEvent.detail)
 *   2. htmx 1.9+ or 2.x
 *   3. splash.js (module) and anime.js v4. splash.js defines <splash-screen id="splash">,
 *      which must be upgraded before this file's ready callback runs. It provides:
 *            splash.startFromLoop()  Initial page-load intro (called once by this file).
 *            splash.start()          Returns a Promise that resolves when the intro has
 *                                    finished and the page is fully covered.
 *            splash.finish()         Returns a Promise that resolves when the outro has
 *                                    ended and the page is fully revealed.
 *   4. Your plugins, which must provide:
 *        $.confirmationDialog.show(question) -> Promise. Resolves (anything but `false`)
 *                                    on confirm. Rejects or resolves `false` on cancel.
 *        $.errorDialog.show(message) -> shows an error message. The return value is ignored.
 *   5. Optional: the i18n layer ($.localization from localization.js). If present, swapped-in
 *      content and restored history pages are localized while the splash still covers the
 *      page, and the initial intro waits for the translations. If absent, this file works
 *      unchanged.
 *
 * REQUIRED HTML
 *   <body hx-boost="true" hx-target="#page-container" hx-select="#page-container"
 *         hx-swap="outerHTML">
 *       <splash-screen id="splash">
 *           <splash-background>...svg...</splash-background>
 *           <splash-logo>...svg...</splash-logo>
 *       </splash-screen>
 *       <div id="page-container" hx-history-elt>   <!-- htmx snapshots/restores ONLY this -->
 *           ...your page...
 *       </div>
 *   </body>
 *   - The splash element is looked up by id="splash" below. Rename it here if needed.
 *   - The splash must be visible by default (via CSS) so there is no flash of the
 *     unstyled page before the initial intro runs.
 *   - #splash-container MUST be outside every element htmx swaps (hx-target, or the body
 *     when using hx-boost="true" with the default body swap).
 *   - #splash-container MUST be outside the history element. Put hx-history-elt on a
 *     content wrapper that does not contain the splash. Otherwise every history restore
 *     replaces the splash node with a frozen copy and the loader stops working after the
 *     first back/forward. A console warning is printed at startup if this is wrong.
 *
 * ATTRIBUTES YOU CAN SET ON ELEMENTS
 *   (nothing)              Any htmx request (hx-get/post/..., hx-boost links and
 *                          forms) gets: intro + request in parallel -> swap held until
 *                          the page is covered -> assets load -> outro.
 *                          The page never changes until the intro has fully covered it.
 *   hx-confirm="Question"  Shows $.confirmationDialog.show("Question") BEFORE the splash
 *                          starts and before the request is sent. If cancelled, nothing
 *                          happens (no splash, no request). This replaces htmx's native
 *                          window.confirm().
 *   data-splash="off"      Put on an element (or any ancestor) to skip the splash for its
 *                          requests. Use it for polling, live search, tiny inline updates.
 *                          It can be combined with hx-confirm (confirmation, no splash).
 *                          Failures of splash-less requests are NOT reported by this file.
 *
 * PROGRAMMATIC NAVIGATION
 *   $.navigation.navigateTo(url, showLoader = true, options = {})
 *       url          Destination, absolute or relative. A different origin does a normal
 *                    full page load (location.assign) and ignores the other arguments.
 *       showLoader   true: same as clicking a link (splash covers the swap).
 *                    false: no splash (same as data-splash="off"). Ignored while a splash is
 *                    already running: the new navigation is covered by it.
 *       options      { replace: true } replaces the current history entry instead of
 *                    pushing a new one (e.g. after login, so the form is not in the back stack).
 *   It clicks a hidden boosted <a>, so it inherits hx-boost / hx-target / hx-select / hx-swap
 *   from <body> and behaves exactly like a link click, including the overlap rules above.
 *   Several calls in a row: the last one wins. It returns nothing.
 *   Listen for "splash-outro-end" on #splash if you need to know when it is done.
 *
 * BEHAVIOUR SUMMARY
 *   - Initial load:      startFromLoop() -> wait for window load, fonts and images -> finish().
 *   - Request success:   start() and the request fire together. If the response arrives
 *                        before the page is covered, htmx processing is held until it is.
 *                        Then swap -> wait for images/fonts -> finish().
 *   - Request failure:   (4xx/5xx, network error, timeout, swap error) start() -> finish(),
 *                        and only then $.errorDialog.show(message). The page is left unchanged.
 *   - Back/forward:      For htmx history entries the splash covers the page, then ONE
 *                        history restore is replayed underneath it, then finish().
 *                        Rapid presses are handled like this:
 *                          * during the intro:        coalesced into the single replay
 *                          * during a request:        the request is aborted, back wins
 *                          * during restore/outro:    the latest press is queued and gets
 *                                                     its own splash afterwards
 *                        Only entries created by htmx (hx-push-url / hx-boost) are handled.
 *                        Hash-only or foreign history entries are left alone.
 *   - Watchdog:          A splash that has not finished after WATCHDOG_MS is aborted and
 *                        ends with an error dialog, so the loader can never stay up forever.
 *   - Only one splash runs at a time. While one is up:
 *       * a boosted GET navigation (link click, GET form, $.navigation.navigateTo) is
 *         "latest wins": if the running splash is still waiting for its response, that request
 *         is aborted and the new one is sent inside the same splash (no second intro). A repeat
 *         of the URL already loading is ignored. If it is too late to abort (response already
 *         swapped, outro running, back/forward in progress) a link click or navigateTo is
 *         queued (one slot, the newest wins) and gets its own splash afterwards.
 *       * everything else (polling, live search, POST, hx-confirm, data-splash="off", GET forms
 *         once it is too late to abort) goes through untouched, covered by the running splash.
 *
 * DEBUGGING
 *   Set DEBUG = true below to log every session step ("[nav] begin / popstate / replay /
 *   historyRestore / end") to the console. Set it to false in production.
 *
 * GOTCHAS
 *   - The popstate listener is native (not jQuery) on purpose: jQuery cannot listen in the
 *     capture phase, and it must run before htmx's own popstate handler.
 *   - Holding the response relies on cancelling htmx:beforeOnLoad and later calling
 *     xhr.onload() again. That is not documented htmx API (it works in 1.9 and 2.x),
 *     so re-test the transition after upgrading htmx.
 *   - Requests that htmx cancels before sending (validation failure, hx-sync) are detected
 *     and the splash is dismissed automatically.
 * -----------------------------------------------------------------------------
 */
$(function () {
	const DEBUG = false; // set to false once everything works
	const WATCHDOG_MS = 20000; // max lifetime of one splash before it is force-ended
	const ASSET_WAIT_MS = 5000; // max wait for fonts/images before the outro

	$.loader = document.getElementById("splash");
	$.loader.startFromLoop();

	// ---------- helpers ----------
	const log = (...a) => DEBUG && console.log("[nav]", ...a);
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

	// jQuery 3 exposes evt.detail; older versions need originalEvent
	const detail = (evt) => evt.detail || (evt.originalEvent && evt.originalEvent.detail) || {};

	// Localization (optional). Synchronous; a no-op if the i18n layer is not on the page.
	// The forced layout starts loading the font slices the new text needs, so that
	// assetsReady() waits for them before the outro.
	const localize = () =>
		$.localization &&
		$.localization.onReady(() => {
			$.localization.translate();
			void document.body.offsetHeight;
		});

	// Resolves once translations are applied. Gives up after ASSET_WAIT_MS so a failed i18n
	// init can never keep the initial splash up.
	const i18nReady = () =>
		$.localization
			? Promise.race([new Promise((r) => $.localization.onReady(r)), sleep(ASSET_WAIT_MS)])
			: Promise.resolve();

	// Resolves when fonts and pending (non-lazy) images are loaded, or after a timeout
	const assetsReady = () =>
		Promise.race([
			Promise.all([
				document.fonts ? document.fonts.ready : null,
				...$("img")
					.filter((_, i) => !i.complete && i.loading !== "lazy")
					.map((_, i) => new Promise((r) => $(i).one("load error", r)))
					.get(),
			]),
			sleep(ASSET_WAIT_MS),
		]);

	// Dev check: the splash must not live inside the element htmx snapshots and restores
	const splashEl = $("#splash-container")[0];
	const historyElt =
		document.querySelector("[hx-history-elt],[data-hx-history-elt]") || document.body;
	if (splashEl && historyElt.contains(splashEl)) {
		console.warn(
			"navigation.js: #splash-container is inside the htmx history element. " +
				"Put hx-history-elt on a content wrapper that does not contain the splash."
		);
	}

	// ---------- initial load ----------
	const loaded =
		document.readyState === "complete"
			? Promise.resolve()
			: new Promise((r) => $(window).one("load", r));
	loaded
		.then(i18nReady)
		.then(assetsReady)
		.then(() => $.loader.finish())
		.catch(console.error);

	// ---------- splash session (one at a time) ----------
	let s = null; // the active session
	let pending = null; // function to run once the current session has finished (newest wins)
	let replaying = false; // true while WE dispatch the popstate that htmx must see

	function begin(kind) {
		const cur = {
			kind, // "request" | "history"
			xhr: null,
			url: null, // request: absolute URL being loaded (links only), to ignore repeats
			expecting: false, // true only while we synchronously call issueRequest()
			released: false, // request: response has been handed to htmx
			replayed: false, // history: popstate has been replayed to htmx
			replayState: null, // history: state to replay
			done: false,
			watchdog: null,
		};
		// Resolves when the intro has finished and the page is fully covered
		cur.covered = Promise.race([
			Promise.resolve()
				.then(() => $.loader.start())
				.catch((err) => console.error("Loader intro failed", err)),
			sleep(WATCHDOG_MS),
		]);
		cur.watchdog = setTimeout(() => {
			if (s !== cur) return;
			if (cur.xhr) cur.xhr.abort();
			end("The page took too long to respond.");
		}, WATCHDOG_MS);
		log("begin", kind);
		s = cur;
		return cur;
	}

	// Ends the active session exactly once. error -> outro, then the error dialog.
	async function end(error) {
		const cur = s;
		if (!cur || cur.done) return;
		cur.done = true;
		log("end", error || "ok");
		clearTimeout(cur.watchdog);
		try {
			await cur.covered; // never outro before the intro is done
			if (!error) await assetsReady(); // page must be loaded before the outro
			await $.loader.finish(); // resolves when the outro has ended
		} catch (err) {
			console.error("Loader outro failed", err);
		} finally {
			s = null; // always release, even if the loader failed
		}
		if (error) $.errorDialog.show(error); // only after the loader is gone
		drain();
	}

	// Runs the queued back/forward press or navigation once the previous splash has fully finished
	function drain() {
		if (s || !pending) return;
		const run = pending;
		pending = null;
		log("drain queued action");
		run();
	}

	// A request session can be replaced only while its response has not been handed to htmx
	function adoptable(cur) {
		return cur.kind === "request" && !cur.released && !cur.done && !!cur.xhr;
	}

	// A boosted navigation: GET from a link or form that has no hx-get/post/... of its own
	const VERB_ATTR = /^(data-)?hx-(get|post|put|patch|delete)$/;
	function isNavigation(elt, verb) {
		return (
			verb === "get" &&
			/^(A|FORM)$/.test(elt.tagName) &&
			!Array.from(elt.attributes).some((a) => VERB_ATTR.test(a.name))
		);
	}

	// ---------- back / forward ----------
	function startHistory(state) {
		const cur = begin("history");
		cur.replayState = state;
		cur.covered.then(() => replay(cur));
	}

	// Hands exactly one popstate to htmx, once the page is covered
	function replay(cur) {
		if (s !== cur || cur.replayed || cur.done) return;
		cur.replayed = true;
		log("replay");
		replaying = true;
		try {
			window.dispatchEvent(new PopStateEvent("popstate", { state: cur.replayState }));
		} catch (err) {
			console.error("History replay failed", err);
			end("The previous page could not be loaded.");
		} finally {
			replaying = false;
		}
	}

	// Native + capture on purpose: must run before htmx's own popstate listener.
	// Every htmx history event is swallowed here; htmx only ever sees our replay.
	window.addEventListener(
		"popstate",
		function (e) {
			if (replaying) return; // our own replay: let htmx have it
			if (!(e.state && e.state.htmx)) return; // hash / foreign entries: leave alone
			e.stopImmediatePropagation();
			log("popstate", {
				session: s && s.kind,
				replayed: s && s.replayed,
				pending: !!pending,
			});

			if (!s) return startHistory(e.state); // idle: start a history splash

			if (s.kind === "history" && !s.replayed) {
				// intro running: coalesce presses
				s.replayState = e.state; // htmx restores from the current URL anyway
				return;
			}

			if (s.kind === "request" && !s.released && !s.done) {
				// Request still in flight: back wins. Abort it and turn this splash into a history one.
				const cur = s;
				if (cur.xhr) cur.xhr.abort();
				cur.xhr = null;
				cur.kind = "history";
				cur.replayState = e.state;
				cur.covered.then(() => replay(cur));
				return;
			}

			pending = () => startHistory(e.state); // mid-restore or outro: run afterwards
		},
		true
	);

	$(document).on("htmx:historyRestore", function () {
		localize(); // a snapshot can contain text from another language
		log("historyRestore", { session: s && s.kind, replayed: s && s.replayed });
		if (s && s.kind === "history" && s.replayed) end();
	});
	$(document).on("htmx:historyCacheMissLoadError", function () {
		log("historyCacheMissLoadError", { session: s && s.kind, replayed: s && s.replayed });
		if (s && s.kind === "history" && s.replayed) end("The previous page could not be loaded.");
	});

	// ---------- localization of swapped-in content ----------
	// htmx:afterSwap fires synchronously inside the swap: while the splash still covers the
	// page and before htmx:afterRequest lets end() start the outro. It also covers
	// data-splash="off" requests, which have no splash session.
	$(document).on("htmx:afterSwap", localize);

	// ---------- normal requests, optional confirmation (hx-confirm), opt-out (data-splash="off") ----------
	$(document).on("htmx:confirm", function (evt) {
		const { elt, question, issueRequest, verb, path } = detail(evt);
		const off = $(elt).closest('[data-splash="off"]').length > 0;
		const url = elt.tagName === "A" && path ? new URL(path, location.href).href : null;

		if (s) {
			// A navigation while a splash is running: the newest one wins. Everything else
			// (polling, POST, hx-confirm, data-splash="off") proceeds untouched.
			if (question || off || !isNavigation(elt, verb)) return;
			evt.preventDefault();
			if (!adoptable(s)) {
				// Too late to abort: a link waits for its own splash, a GET form goes through as before
				if (url) pending = () => $.navigation.navigateTo(url);
				else issueRequest(true);
				return;
			}
			if (url && s.url === url) return; // already loading this page: ignore the repeat
			const cur = s;
			const old = cur.xhr;
			cur.xhr = null; // from now on the old response is stale (see htmx:beforeOnLoad)
			old.abort();
			cur.url = url;
			cur.expecting = true; // the new request joins the running splash
			issueRequest(true);
			cur.expecting = false;
			if (!cur.xhr) end(); // htmx sent nothing (validation etc.)
			return;
		}
		if (off && !question) return; // nothing to do: let htmx proceed
		evt.preventDefault(); // pause until the dialog (if any) is answered

		Promise.resolve(question ? $.confirmationDialog.show(question) : true)
			.then((ok) => {
				if (ok === false) return; // cancelled: no splash, no request
				if (off || s) return issueRequest(true);
				const cur = begin("request"); // intro starts now...
				cur.url = url;
				cur.expecting = true;
				issueRequest(true); // ...and the request is sent immediately
				cur.expecting = false;
				if (!cur.xhr) end(); // htmx sent nothing (validation etc.)
			})
			.catch(() => {}); // dialog rejected = cancelled
	});

	// Remember which XHR belongs to the splash so unrelated requests can't end it
	$(document).on("htmx:beforeRequest", function (evt) {
		if (s && s.kind === "request" && s.expecting && !s.xhr) s.xhr = detail(evt).xhr;
	});

	const mine = (evt) => s && s.kind === "request" && s.xhr && s.xhr === detail(evt).xhr;

	// Hold the response until the page is covered, then let htmx process it normally
	$(document).on("htmx:beforeOnLoad", function (evt) {
		if (!mine(evt) || s.released) return;
		const cur = s;
		const { xhr, elt } = detail(evt);
		evt.preventDefault(); // htmx stops before touching the DOM
		cur.covered.then(() => {
			// Superseded (back/forward, or a newer navigation took over the session): drop the
			// response. xhr.abort() cannot stop a response that already arrived and is held here.
			if (cur.xhr !== xhr || cur.done) {
				$(elt).filter("[data-nav-proxy]").remove(); // its request will never finish: clean up its anchor
				return;
			}
			cur.released = true;
			xhr.onload(); // replay: htmx now handles it as usual
		});
	});

	$(document).on("htmx:afterRequest", function (evt) {
		if (mine(evt) && detail(evt).successful) end();
	});

	// ---------- failures ----------
	const errors = {
		"htmx:responseError": "The server returned an error.",
		"htmx:sendError": "Could not reach the server.",
		"htmx:timeout": "The request timed out.",
		"htmx:swapError": "The page could not be updated.",
	};
	$.each(errors, function (name, message) {
		$(document).on(name, function (evt) {
			if (mine(evt)) end(message);
		});
	});

	// ---------- programmatic navigation ----------
	// A hidden boosted <a> carries the request, so it inherits hx-boost, hx-target, hx-select
	// and hx-swap from <body> and goes through the same pipeline as a real link click.
	// It must stay in the DOM until the request has fully finished: htmx re-checks that the
	// element is attached when htmx:confirm resumes and when a held response is replayed (see
	// above), so an early removal drops or breaks the request. htmx fires htmx:afterRequest
	// once for the response we hold back (detail.successful is undefined) and once when it
	// is really done (successful is true/false); only the second one is a safe moment.
	$.navigation = {
		navigateTo: function (url, showLoader = true, options = {}) {
			const dest = new URL(url, location.href);

			// Another origin: htmx cannot handle it, do a normal page load
			if (dest.origin !== location.origin) {
				location.assign(dest.href);
				return;
			}

			if (s) {
				// Too late to replace the running navigation: run after its splash, newest wins
				if (!adoptable(s)) {
					pending = () => $.navigation.navigateTo(dest.href, showLoader, options);
					return;
				}
				if (s.url === dest.href) return; // already loading this page
			}

			const a = document.createElement("a");
			a.href = dest.href;
			a.hidden = true;
			a.setAttribute("data-nav-proxy", "");
			a.setAttribute("hx-sync", "body:replace"); // a newer call aborts an older one still in flight
			if (!showLoader && !s) a.setAttribute("data-splash", "off"); // a running splash covers it anyway
			if (options.replace) a.setAttribute("hx-replace-url", "true");

			const cleanup = () => {
				clearTimeout(timer);
				a.remove();
			};
			const timer = setTimeout(cleanup, WATCHDOG_MS + 1000); // safety net (send error)
			$(a).on("htmx:afterRequest", (evt) => {
				if (detail(evt).successful !== undefined) cleanup();
			});
			$(a).one("htmx:sendAbort", cleanup); // superseded by a newer navigation

			document.body.appendChild(a);
			htmx.process(a);
			a.click();
		},
	};
});
