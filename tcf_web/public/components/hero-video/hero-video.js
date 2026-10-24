/**
 * <hero-video>: full-bleed looping background video.
 *
 * Picks a rendition from the connection speed (small probe file) and the
 * viewport, buffers it behind the splash, and starts playing from 0:00 when
 * the splash fires START_EVENT. Restarts from the beginning every time the
 * element is inserted (e.g. after an htmx swap) and releases the download
 * when it is removed.
 *
 * Hard dependency: jQuery. Include this file in the <head> after jQuery.
 *
 * Events (jQuery-triggered on the element, handler signature (event, detail)):
 *   hero-video:rendition-selected  detail: { rendition, mbps }
 *   hero-video:playing             detail: { rendition }
 *   hero-video:autoplay-blocked    detail: { rendition }
 *   hero-video:error               detail: { error }
 *
 * Host attribute data-state: loading | waiting | playing | error
 */
(function ($) {
	"use strict";

	if (!$) {
		throw new Error("hero-video: jQuery is required and must load before this file.");
	}
	if (customElements.get("hero-video")) return;

	var SCRIPT_URL = document.currentScript && document.currentScript.src;
	var BASE_URL = SCRIPT_URL
		? new URL(".", SCRIPT_URL).href
		: "/assets/tcf_web/components/hero-video/";

	var MANIFEST_URL = "/api/method/tcf_web.api.hero_video.get_manifest";
	var START_EVENT = "splash-outro-start"; // playback starts when this fires
	var START_FALLBACK_MS = 10000; // start anyway if it never fires
	var PROBE_TIMEOUT_MS = 4000;
	var HEADROOM = 1.5; // measured Mbps must exceed bitrate * HEADROOM
	var MAX_DPR = 2;
	var CACHE_KEY = "heroVideo.mbps";
	var CACHE_TTL_MS = 10 * 60 * 1000;

	var instanceCount = 0;

	// ---------- helpers ----------

	function textOrThrow(res) {
		if (!res.ok) throw new Error("HTTP " + res.status + " for " + res.url);
		return res.text();
	}

	var templatePromise = null;
	function loadTemplate() {
		if (!templatePromise) {
			templatePromise = Promise.all([
				fetch(BASE_URL + "hero-video.html").then(textOrThrow),
				fetch(BASE_URL + "hero-video.css").then(textOrThrow),
			])
				.then(function (parts) {
					return { html: parts[0], css: parts[1] };
				})
				.catch(function (err) {
					templatePromise = null;
					throw err;
				});
		}
		return templatePromise;
	}

	function readCachedMbps() {
		try {
			var raw = sessionStorage.getItem(CACHE_KEY);
			if (!raw) return null;
			var entry = JSON.parse(raw);
			return Date.now() - entry.at < CACHE_TTL_MS ? entry.mbps : null;
		} catch (e) {
			return null;
		}
	}

	function writeCachedMbps(mbps) {
		try {
			sessionStorage.setItem(CACHE_KEY, JSON.stringify({ mbps: mbps, at: Date.now() }));
		} catch (e) {
			/* storage unavailable: probe again next time */
		}
	}

	function pickRendition(manifest, mbps) {
		var sorted = manifest.renditions.slice().sort(function (a, b) {
			return a.width - b.width;
		});

		var conn = navigator.connection;
		if (conn && conn.saveData) return sorted[0];

		// With object-fit: cover the video is scaled until BOTH dimensions fill
		// the viewport, so portrait screens need the video's width to be
		// height * aspect, not the viewport width.
		var aspect = manifest.aspect_ratio || 16 / 9;
		var dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
		var neededWidth = Math.max(window.innerWidth, window.innerHeight * aspect) * dpr;

		var ceiling = sorted.findIndex(function (r) {
			return r.width >= neededWidth;
		});
		if (ceiling === -1) ceiling = sorted.length - 1;

		var choice = 0;
		for (var i = 0; i <= ceiling; i++) {
			if ((sorted[i].bitrate_kbps * HEADROOM) / 1000 <= mbps) choice = i;
		}
		return sorted[choice];
	}

	// ---------- element ----------

	class HeroVideo extends HTMLElement {
		connectedCallback() {
			var self = this;
			this._abort = new AbortController();
			// Per-instance namespaces: htmx inserts the new page before removing the
			// old one, so two instances can briefly coexist.
			this._id = ++instanceCount;
			this._retryEvent = "pointerdown.heroVideo" + this._id;
			this._startEvent = START_EVENT + ".heroVideo" + this._id;
			var signal = this._abort.signal;
			var ABORTED = new Error("hero-video: aborted");

			function guard(value) {
				if (signal.aborted) throw ABORTED;
				return value;
			}

			// Arm before any async work so the start event can't be missed while
			// the manifest and probe are still in flight.
			this._armStartGate();
			this._setState("loading");

			this._render()
				.then(guard)
				.then(function () {
					return self._loadManifest();
				})
				.then(guard)
				.then(function (manifest) {
					return self._measure(manifest).then(function (mbps) {
						return { manifest: manifest, mbps: mbps };
					});
				})
				.then(guard)
				.then(function (result) {
					var rendition = pickRendition(result.manifest, result.mbps);
					$(self).trigger("hero-video:rendition-selected", [
						{ rendition: rendition, mbps: result.mbps },
					]);

					// Start buffering right away (behind the splash), play on the gate.
					self._loadSource(rendition);
					if (!self._gateOpen) self._setState("waiting");

					return self._startGate.then(guard).then(function () {
						return self._play(rendition);
					});
				})
				.catch(function (err) {
					if (signal.aborted) return; // element removed: expected
					self._setState("error");
					$(self).trigger("hero-video:error", [{ error: err }]);
					console.warn("hero-video:", err);
				});
		}

		disconnectedCallback() {
			if (this._abort) this._abort.abort();
			this._disarmStartGate();
			if (this._retryEvent) $(document).off(this._retryEvent);
			this._release();
		}

		_setState(state) {
			$(this).attr("data-state", state);
		}

		// ----- start gate -----

		_armStartGate() {
			var self = this;
			this._gateOpen = false;
			this._startGate = new Promise(function (resolve) {
				self._resolveGate = resolve;
			});
			this._onStart = function () {
				self._openStartGate();
			};

			// jQuery-triggered events and native bubbling events reach document...
			$(document).on(this._startEvent, this._onStart);
			// ...native non-bubbling events only show up in the capture phase.
			document.addEventListener(START_EVENT, this._onStart, true);

			this._fallbackTimer = setTimeout(this._onStart, START_FALLBACK_MS);
		}

		_openStartGate() {
			if (this._gateOpen) return;
			this._gateOpen = true;
			this._disarmStartGate();
			this._resolveGate();
		}

		_disarmStartGate() {
			clearTimeout(this._fallbackTimer);
			if (this._startEvent) $(document).off(this._startEvent);
			if (this._onStart) document.removeEventListener(START_EVENT, this._onStart, true);
		}

		// ----- rendering and loading -----

		_render() {
			var self = this;
			return loadTemplate().then(function (tpl) {
				if (!self.shadowRoot) {
					var root = self.attachShadow({ mode: "open" });
					$(root).append($("<style>").text(tpl.css)).append($.parseHTML(tpl.html));
				}
				self._$video = $(self.shadowRoot).find("video");
				self._$video.prop("muted", true); // the attribute alone isn't always honored for autoplay
			});
		}

		_loadManifest() {
			return fetch(MANIFEST_URL, { signal: this._abort.signal })
				.then(function (res) {
					if (!res.ok) throw new Error("manifest HTTP " + res.status);
					return res.json();
				})
				.then(function (body) {
					return body.message;
				});
		}

		_measure(manifest) {
			var cached = readCachedMbps();
			if (cached !== null) return Promise.resolve(cached);
			return this._probe(manifest.probe).then(function (mbps) {
				writeCachedMbps(mbps);
				return mbps;
			});
		}

		_probe(probe) {
			var self = this;
			var ctrl = new AbortController();
			var onUnmount = function () {
				ctrl.abort();
			};
			self._abort.signal.addEventListener("abort", onUnmount);

			var timedOut = false;
			var timer = setTimeout(function () {
				timedOut = true;
				ctrl.abort();
			}, PROBE_TIMEOUT_MS);
			var t0 = performance.now();

			return fetch(probe.url + "?t=" + Date.now(), {
				cache: "no-store",
				signal: ctrl.signal,
			})
				.then(function (res) {
					if (!res.ok) throw new Error("probe HTTP " + res.status);
					return res.arrayBuffer();
				})
				.then(function (buf) {
					var seconds = (performance.now() - t0) / 1000;
					return (buf.byteLength * 8) / seconds / 1e6; // Mbps
				})
				.catch(function (err) {
					if (timedOut) return 0; // too slow: lowest rendition
					throw err;
				})
				.finally(function () {
					clearTimeout(timer);
					self._abort.signal.removeEventListener("abort", onUnmount);
				});
		}

		_loadSource(rendition) {
			// Setting src starts buffering (preload="auto") without playing.
			this._$video.get(0).src = BASE_URL + rendition.url.replace(/^.*\/video\//, "video/");
		}

		_play(rendition) {
			var self = this;
			var $video = this._$video;
			var video = $video.get(0);

			$video.off(".heroVideo").one("playing.heroVideo", function () {
				self._setState("playing");
				$(self).trigger("hero-video:playing", [{ rendition: rendition }]);
			});

			var attempt = video.play();
			if (!attempt || !attempt.catch) return Promise.resolve();

			return attempt.catch(function () {
				// Autoplay blocked (e.g. Low Power Mode): retry on first interaction
				$(self).trigger("hero-video:autoplay-blocked", [{ rendition: rendition }]);
				$(document)
					.off(self._retryEvent)
					.one(self._retryEvent, function () {
						video.play().catch(function () {});
					});
			});
		}

		_release() {
			if (!this._$video) return;
			var video = this._$video.get(0);
			this._$video.off(".heroVideo");
			video.pause();
			video.removeAttribute("src");
			video.load(); // cancels the in-flight download
		}
	}

	customElements.define("hero-video", HeroVideo);
})(window.jQuery);
