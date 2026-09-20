/**
 * navigation.js
 * -----------------------------------------------------------------------------
 * Splash-screen and navigation controller for htmx sites.
 * Autonomous: it needs only the dependencies and markup below.
 *
 * DEPENDENCIES (load in this order, before this file)
 *   1. jQuery 3.x (on 1.x/2.x this file still works; it reads evt.originalEvent.detail)
 *   2. htmx 1.9+ or 2.x
 *   3. Your plugins, which must provide:
 *        $.createLoader(containerSel, logoSel, backgroundSel) -> loader with:
 *            loader.startFromLoop()  Initial page-load intro (called once by this file).
 *            loader.start()          Returns a Promise that resolves when the intro has
 *                                    finished and the page is fully covered.
 *            loader.finish()         Returns a Promise that resolves when the outro has
 *                                    ended and the page is fully revealed.
 *        $.confirmationDialog.show(question) -> Promise. Resolves (anything but `false`)
 *                                    on confirm. Rejects or resolves `false` on cancel.
 *        $.errorDialog.show(message) -> shows an error message. The return value is ignored.
 *   4. Optional: the i18n layer (window.AppI18n from i18n-master.js). If present, swapped-in
 *      content and restored history pages are localized while the splash still covers the
 *      page, and the initial intro waits for the translations. If absent, this file works
 *      unchanged.
 *
 * REQUIRED HTML
 *   <body>
 *       <div id="splash-container">
 *           <div id="splash-background"></div>
 *           <div id="splash-logo"></div>
 *       </div>
 *       <main id="content" hx-history-elt>   <!-- htmx snapshots/restores ONLY this -->
 *           ...your page...
 *       </main>
 *   </body>
 *   - Those three splash ids are passed to $.createLoader below. Rename them here if needed.
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
 *   - Only one splash runs at a time. Requests fired while a splash is up go through
 *     untouched and are covered by the running splash.
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

	$.loader = $.createLoader("#splash-container", "#splash-logo", "#splash-background");
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
		window.AppI18n &&
		AppI18n.onReady(() => {
			AppI18n.translate();
			void document.body.offsetHeight;
		});

	// Resolves once translations are applied. Gives up after ASSET_WAIT_MS so a failed i18n
	// init can never keep the initial splash up.
	const i18nReady = () =>
		window.AppI18n
			? Promise.race([new Promise((r) => AppI18n.onReady(r)), sleep(ASSET_WAIT_MS)])
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
	let pendingPop = null; // history state waiting for the current session to finish
	let replaying = false; // true while WE dispatch the popstate that htmx must see

	function begin(kind) {
		const cur = {
			kind, // "request" | "history"
			xhr: null,
			expecting: false, // true only while we synchronously call issueRequest()
			released: false, // request: response has been handed to htmx
			aborted: false, // request: superseded by a back/forward press
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

	// Runs a queued back/forward press once the previous splash has fully finished
	function drain() {
		if (s || !pendingPop) return;
		const state = pendingPop;
		pendingPop = null;
		log("drain queued popstate");
		startHistory(state);
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
				pendingPop: !!pendingPop,
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
				cur.aborted = true;
				if (cur.xhr) cur.xhr.abort();
				cur.xhr = null;
				cur.kind = "history";
				cur.replayState = e.state;
				cur.covered.then(() => replay(cur));
				return;
			}

			pendingPop = e.state; // mid-restore or outro: run afterwards
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
		const { elt, question, issueRequest } = detail(evt);
		const off = $(elt).closest('[data-splash="off"]').length > 0;

		if (s) return; // splash already up: let htmx proceed
		if (off && !question) return; // nothing to do: let htmx proceed
		evt.preventDefault(); // pause until the dialog (if any) is answered

		Promise.resolve(question ? $.confirmationDialog.show(question) : true)
			.then((ok) => {
				if (ok === false) return; // cancelled: no splash, no request
				if (off || s) return issueRequest(true);
				const cur = begin("request"); // intro starts now...
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
		const xhr = detail(evt).xhr;
		evt.preventDefault(); // htmx stops before touching the DOM
		cur.covered.then(() => {
			if (cur.aborted || cur.done) return; // superseded by back/forward: drop the response
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
});
