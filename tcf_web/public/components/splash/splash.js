/* global anime */

/**
 * Splash screen web component — jQuery-powered internals.
 *
 * Import this file as a module and it registers three custom elements:
 *
 *   <splash-screen>      the container / orchestrator (start, startFromLoop,
 *                        cancel, finish — all return Promises, same as before)
 *   <splash-background>  holds the background SVG
 *   <splash-logo>        holds the logo SVG
 *
 * Usage:
 *
 *   <script type="module" src="components/splash/splash.js"></script>
 *
 *   <splash-screen id="splash">
 *     <splash-background src="/assets/splash-background.svg"></splash-background>
 *     <splash-logo src="/assets/splash-logo.svg"></splash-logo>
 *   </splash-screen>
 *
 *   const splash = document.getElementById('splash');
 *   splash.start().then(() => {
 *     // ...later
 *     return splash.finish();
 *   });
 *
 * <splash-background>/<splash-logo> accept the SVG either way:
 *   - as a `src="...".svg` attribute (fetched via $.ajax and injected), or
 *   - as raw <svg>...</svg> markup pasted directly inside the tag.
 *
 * Events are dispatched with a native CustomEvent, which jQuery's `.on()`
 * also picks up (jQuery listens via addEventListener internally) — so you
 * can listen either way:
 *   $('#splash').on('splash-intro-end', fn)   // jQuery
 *   splash.addEventListener('splash-intro-end', fn) // native
 * (jQuery's own `.trigger()` only reaches jQuery-bound handlers, not plain
 * addEventListener ones, so it's not used for emitting these.)
 * Events on <splash-screen>: splash-intro-start, splash-intro-end,
 * splash-loop-start, splash-outro-start, splash-outro-end, splash-cancel,
 * splash-ready (loader initialized, before the first start()/startFromLoop()).
 * <splash-background>/<splash-logo> also emit splash-media-ready once their
 * `src` SVG has been fetched and injected.
 *
 * Requires jQuery (global `window.jQuery`/`window.$`) and anime.js v4
 * (global `window.anime`; animate / utils / createTimeline), exactly like
 * the original implementation.
 *
 * Note: there's no hyphen-free `<splash>` tag — the Custom Elements spec
 * requires autonomous element names to contain a dash, so the container is
 * `<splash-screen>` instead. Everything else matches the original API.
 */

const $ = window.jQuery || window.$;
if (typeof $ !== "function") {
	throw new Error(
		"splash.js requires jQuery to be loaded globally (as `window.jQuery`/`window.$`) before this module runs."
	);
}

// --- auto-inject splash.css, once, next to this module ---------------------
(function injectStyles() {
	if ($("link[data-splash-styles]").length) return;
	$("<link>", {
		rel: "stylesheet",
		href: new URL("./splash.css", import.meta.url).href,
	})
		.attr("data-splash-styles", "")
		.appendTo("head");
})();

// --- small helpers -----------------------------------------------------------

function createCancelError() {
	const err = new Error("Loader cancelled");
	err.name = "LoaderCancelled";
	err.cancelled = true;
	return err;
}

function getSVGCoordinates($el) {
	const bbox = $el.children("svg")[0].getBBox();
	return {
		x: bbox.x + bbox.width / 2,
		y: bbox.y + bbox.height / 2,
	};
}

function getPolygonCoordinates(polygons) {
	const x = [];
	const y = [];
	polygons.forEach(function (el) {
		if (el.points && el.points.numberOfItems === 4) {
			const p1 = el.points.getItem(0);
			const p2 = el.points.getItem(1);
			const p3 = el.points.getItem(2);
			x.push((p1.x + p2.x + p3.x) / 3);
			y.push((p1.y + p2.y + p3.y) / 3);
		} else {
			const bbox = el.getBBox();
			x.push(bbox.x + bbox.width / 2);
			y.push(bbox.y + bbox.height / 2);
		}
	});
	return { x: x, y: y };
}

function getNormalizedDistances(center, points, direction) {
	const distances = points.x.map(function (e, i) {
		return (e - center.x) * direction.vx + (points.y[i] - center.y) * direction.vy;
	});
	const minDistance = Math.min(...distances);
	const maxDistance = Math.max(...distances);
	const span = maxDistance - minDistance || 1e-6;
	return distances.map(function (e) {
		return (e - minDistance) / span;
	});
}

function getDelays(stagger, totalDuration, individualDuration) {
	const totalStaggerTimePool = totalDuration - individualDuration;
	return stagger.map(function (e) {
		return e * totalStaggerTimePool;
	});
}

// --- <splash-background> / <splash-logo> ------------------------------------

/**
 * Thin custom element that resolves its own SVG content: either fetched
 * from a `src` attribute, or already present as markup inside the tag.
 */
class SplashMedia extends HTMLElement {
	connectedCallback() {
		if (!this._ready) {
			this._ready = this._resolveContent();
		}
	}

	_resolveContent() {
		const src = this.getAttribute("src");
		if (!src) {
			// Whatever markup was already inside the tag is used as-is.
			return Promise.resolve();
		}
		const $this = $(this);
		return $.ajax({ url: src, dataType: "text" }).then(
			(svgMarkup) => {
				$this.html(svgMarkup);
				this.dispatchEvent(
					new CustomEvent("splash-media-ready", { bubbles: true, composed: true })
				);
			},
			(jqXHR, textStatus, errorThrown) => {
				console.error(
					`<${this.tagName.toLowerCase()}> failed to load src="${src}":`,
					textStatus,
					errorThrown
				);
			}
		);
	}

	/** Promise that resolves once this element's SVG content is in place. */
	get ready() {
		if (!this._ready) this._ready = this._resolveContent();
		return this._ready;
	}

	get svg() {
		return $(this).children("svg")[0];
	}

	get polygons() {
		return $(this).find("polygon").toArray();
	}
}

class SplashBackground extends SplashMedia {}
class SplashLogo extends SplashMedia {}

customElements.define("splash-background", SplashBackground);
customElements.define("splash-logo", SplashLogo);

// --- animation engine (ported from the original $.createLoader, still jQuery-powered) ------------

function createLoader(container, logo, background, opts) {
	opts = opts || {};

	if (typeof anime === "undefined" || !anime.createTimeline) {
		throw new Error(
			"<splash-screen> requires anime.js v4 to be loaded globally as `window.anime`."
		);
	}
	const animeUtils = anime.utils;

	// These are the target elements on which to calculate and play the animation.
	const $container = $(container);
	const $logo = $(logo);
	const $background = $(background);

	// We find the polygons inside the logo and background here, same as the
	// original: a jQuery collection, converted to a plain array for anime.js.
	const $backgroundTria = $background.find("polygon");
	const $logoTria = $logo.find("polygon");
	const backgroundPolygons = $backgroundTria.toArray();
	const logoPolygons = $logoTria.toArray();

	// Overall container config
	const visibleDisplay = opts.visibleDisplay || "flex";
	const hiddenDisplay = opts.hiddenDisplay || "none";

	// General animation parameters
	const backgroundWaveDirection = opts.backgroundWaveDirection ?? 45;
	const logoWaveDirection = opts.logoWaveDirection ?? 45;

	// Intro animation
	const backgroundRevealDuration = opts.backgroundRevealDuration ?? 600;
	const backgroundRevealDelay = opts.backgroundRevealDelay ?? 0;
	const backgroundTriaRevealDuration = opts.backgroundTriaRevealDuration ?? 200;
	const logoRevealDuration = opts.logoRevealDuration ?? 500;
	const logoRevealDelay = opts.logoRevealDelay ?? 250;
	const logoTriaRevealDuration = opts.logoTriaRevealDuration ?? 200;

	// Loop animation
	const logoLoopDuration = opts.logoLoopDuration ?? 600;
	const logoLoopDelay = opts.logoLoopDelay ?? 800;
	const logoTriaInDuration = opts.logoTriaInDuration ?? 100;
	const logoTriaOutDuration = opts.logoTriaOutDuration ?? 100;

	// Outro animation
	const backgroundHideDuration = opts.backgroundHideDuration ?? 600;
	const backgroundHideDelay = opts.backgroundHideDelay ?? 250;
	const backgroundTriaHideDuration = opts.backgroundTriaHideDuration ?? 200;
	const logoHideDuration = opts.logoHideDuration ?? 500;
	const logoHideDelay = opts.logoHideDelay ?? 0;
	const logoTriaHideDuration = opts.logoTriaHideDuration ?? 200;

	// Minimum logo splash duration if there is no loop
	const minSplashDuration = opts.minSplashDuration ?? logoLoopDelay / 2;

	// State
	let exitRequested = false;
	let startedFromLoop = false;
	let running = false;
	let phase = 0; // 0 = idle, 1 = intro, 2 = loop, 3 = outro
	let introPromises = [];
	let outroPromises = [];

	// A native dispatchEvent reaches BOTH plain addEventListener listeners
	// and jQuery's $(...).on(...) handlers, because jQuery attaches its own
	// listeners via addEventListener internally. jQuery's own .trigger(),
	// tested the other way round, does NOT reach native addEventListener
	// listeners — so this is the one mechanism that works for both.
	function emit(name) {
		container.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true }));
	}

	// Animation geometry
	const backgroundCenter = getSVGCoordinates($background);
	const backgroundTriaCenter = getPolygonCoordinates(backgroundPolygons);
	const logoCenter = getSVGCoordinates($logo);
	const logoTriaCenter = getPolygonCoordinates(logoPolygons);
	const backgroundWave = {
		vx: Math.cos((backgroundWaveDirection * Math.PI) / 180),
		vy: Math.sin((backgroundWaveDirection * Math.PI) / 180),
	};
	const logoWave = {
		vx: Math.cos((logoWaveDirection * Math.PI) / 180),
		vy: Math.sin((logoWaveDirection * Math.PI) / 180),
	};
	const backgroundStagger = getNormalizedDistances(
		backgroundCenter,
		backgroundTriaCenter,
		backgroundWave
	);
	const logoStagger = getNormalizedDistances(logoCenter, logoTriaCenter, logoWave);

	// CSS states: before intro, between loops, after outro
	const introStartState = {
		background: {
			opacity: 0,
			scale: 0.5,
			rotateX: 90 * backgroundWave.vx,
			rotateY: 90 * backgroundWave.vy,
		},
		logo: { opacity: 0, scale: 0.2, rotateX: 90 * logoWave.vx, rotateY: 90 * logoWave.vy },
	};
	const neutralState = {
		background: { opacity: 1, scale: 1, rotateX: 0, rotateY: 0 },
		logo: { opacity: 1, scale: 1, rotateX: 0, rotateY: 0 },
	};
	const loopState = {
		logo: { opacity: 1, scale: 0.6, rotateX: 0, rotateY: 0 },
	};
	const outroEndState = {
		background: {
			opacity: 0,
			scale: 0.5,
			rotateX: 90 * backgroundWave.vx,
			rotateY: 90 * backgroundWave.vy,
		},
		logo: { opacity: 0, scale: 0.2, rotateX: 90 * logoWave.vx, rotateY: 90 * logoWave.vy },
	};

	// Intro timeline (background + logo superimposed)
	const backgroundTriaRevealDelay = getDelays(
		backgroundStagger,
		backgroundRevealDuration,
		backgroundTriaRevealDuration
	);
	const logoTriaRevealDelay = getDelays(logoStagger, logoRevealDuration, logoTriaRevealDuration);
	const introTimeline = anime
		.createTimeline({
			loop: 0,
			autoplay: false,
			onBegin: () => {
				$container.css("display", visibleDisplay);
				animeUtils.set(backgroundPolygons, introStartState.background);
				animeUtils.set(logoPolygons, introStartState.logo);
				phase = 1;
				emit("splash-intro-start");
			},
			onLoop: null,
			onComplete: () => {
				animeUtils.set(backgroundPolygons, neutralState.background);
				animeUtils.set(logoPolygons, neutralState.logo);
				settleIntroPromises();
				emit("splash-intro-end");
				if (exitRequested) {
					setTimeout(function () {
						playOutro();
					}, minSplashDuration);
				} else {
					phase = 2;
					emit("splash-loop-start");
					playLoop();
				}
			},
		})
		.add(
			backgroundPolygons,
			{
				opacity: [
					{ to: introStartState.background.opacity, duration: 0 },
					{
						to: neutralState.background.opacity,
						duration: backgroundTriaRevealDuration,
						ease: "outSine",
					},
				],
				scale: [
					{ to: introStartState.background.scale, duration: 0 },
					{
						to: neutralState.background.scale,
						duration: backgroundTriaRevealDuration,
						ease: "outSine",
					},
				],
				rotateX: [
					{ to: introStartState.background.rotateX, duration: 0 },
					{
						to: neutralState.background.rotateX,
						duration: backgroundTriaRevealDuration,
						ease: "outSine",
					},
				],
				rotateY: [
					{ to: introStartState.background.rotateY, duration: 0 },
					{
						to: neutralState.background.rotateY,
						duration: backgroundTriaRevealDuration,
						ease: "outSine",
					},
				],
				delay: (e, i) => backgroundTriaRevealDelay[i],
				composition: 1,
			},
			backgroundRevealDelay
		)
		.add(
			logoPolygons,
			{
				opacity: [
					{ to: introStartState.logo.opacity, duration: 0 },
					{
						to: neutralState.logo.opacity,
						duration: logoTriaRevealDuration,
						ease: "outSine",
					},
				],
				scale: [
					{ to: introStartState.logo.scale, duration: 0 },
					{
						to: neutralState.logo.scale,
						duration: logoTriaRevealDuration,
						ease: "outSine",
					},
				],
				rotateX: [
					{ to: introStartState.logo.rotateX, duration: 0 },
					{
						to: neutralState.logo.rotateX,
						duration: logoTriaRevealDuration,
						ease: "outSine",
					},
				],
				rotateY: [
					{ to: introStartState.logo.rotateY, duration: 0 },
					{
						to: neutralState.logo.rotateY,
						duration: logoTriaRevealDuration,
						ease: "outSine",
					},
				],
				delay: (e, i) => logoTriaRevealDelay[i],
				composition: 1,
			},
			logoRevealDelay
		);

	// Loop timeline (logo pulse)
	const logoTriaLoopDelay = getDelays(
		logoStagger,
		logoLoopDuration,
		logoTriaInDuration + logoTriaOutDuration
	);
	const loopTimeline = anime
		.createTimeline({
			loop: 0,
			autoplay: false,
			onBegin: function (anim) {
				if (exitRequested && !startedFromLoop) {
					anim.cancel();
					playOutro();
				}
			},
			onLoop: null,
			onComplete: function () {
				if (exitRequested) {
					playOutro();
				} else {
					playLoop();
				}
			},
		})
		.add(
			logoPolygons,
			{
				scale: [
					{ to: neutralState.logo.scale, duration: 0 },
					{ to: loopState.logo.scale, duration: logoTriaInDuration, ease: "outSine" },
					{ to: neutralState.logo.scale, duration: logoTriaOutDuration, ease: "inSine" },
					{ to: neutralState.logo.scale, duration: logoLoopDelay / 2 },
				],
				delay: (e, i) => logoTriaLoopDelay[i],
			},
			logoLoopDelay / 2
		);

	// Outro timeline (background + logo superimposed)
	const backgroundTriaHideDelay = getDelays(
		backgroundStagger,
		backgroundHideDuration,
		backgroundTriaHideDuration
	);
	const logoTriaHideDelay = getDelays(logoStagger, logoHideDuration, logoTriaHideDuration);
	const outroTimeline = anime
		.createTimeline({
			loop: 0,
			autoplay: false,
			onBegin: () => {
				animeUtils.set(backgroundPolygons, neutralState.background);
				animeUtils.set(logoPolygons, neutralState.logo);
				phase = 3;
				emit("splash-outro-start");
			},
			onLoop: null,
			onComplete: () => {
				animeUtils.set(backgroundPolygons, outroEndState.background);
				animeUtils.set(logoPolygons, outroEndState.logo);
				$container.css("display", hiddenDisplay);
				settleOutroPromises();
				running = false;
				startedFromLoop = false;
				phase = 0;
				emit("splash-outro-end");
			},
		})
		.add(
			backgroundPolygons,
			{
				opacity: [
					{ to: neutralState.background.opacity, duration: 0 },
					{
						to: outroEndState.background.opacity,
						duration: backgroundTriaHideDuration,
						ease: "outSine",
					},
				],
				scale: [
					{ to: neutralState.background.scale, duration: 0 },
					{
						to: outroEndState.background.scale,
						duration: backgroundTriaHideDuration,
						ease: "outSine",
					},
				],
				rotateX: [
					{ to: neutralState.background.rotateX, duration: 0 },
					{
						to: outroEndState.background.rotateX,
						duration: backgroundTriaHideDuration,
						ease: "outSine",
					},
				],
				rotateY: [
					{ to: neutralState.background.rotateY, duration: 0 },
					{
						to: outroEndState.background.rotateY,
						duration: backgroundTriaHideDuration,
						ease: "outSine",
					},
				],
				delay: (e, i) => backgroundTriaHideDelay[i],
				composition: 1,
			},
			backgroundHideDelay
		)
		.add(
			logoPolygons,
			{
				opacity: [
					{ to: neutralState.logo.opacity, duration: 0 },
					{
						to: outroEndState.logo.opacity,
						duration: logoTriaHideDuration,
						ease: "outSine",
					},
				],
				scale: [
					{ to: neutralState.logo.scale, duration: 0 },
					{
						to: outroEndState.logo.scale,
						duration: logoTriaHideDuration,
						ease: "outSine",
					},
				],
				rotateX: [
					{ to: neutralState.logo.rotateX, duration: 0 },
					{
						to: outroEndState.logo.rotateX,
						duration: logoTriaHideDuration,
						ease: "outSine",
					},
				],
				rotateY: [
					{ to: neutralState.logo.rotateY, duration: 0 },
					{
						to: outroEndState.logo.rotateY,
						duration: logoTriaHideDuration,
						ease: "outSine",
					},
				],
				delay: (e, i) => logoTriaHideDelay[i],
				composition: 1,
			},
			logoHideDelay
		);

	// Play / request-exit helpers
	function requestExit() {
		if (running) {
			exitRequested = true;
		}
	}

	function playIntro() {
		introTimeline.restart();
	}

	function playLoop() {
		loopTimeline.restart();
	}

	function playOutro() {
		outroTimeline.restart();
	}

	// Promises fired when the intro finishes / the outro starts
	function endOfIntroPromise() {
		return new Promise(function (resolve, reject) {
			introPromises.push({ resolve: resolve, reject: reject });
		});
	}

	function startOfOutroPromise() {
		return new Promise(function (resolve, reject) {
			outroPromises.push({ resolve: resolve, reject: reject });
		});
	}

	function settleIntroPromises(error) {
		introPromises.splice(0).forEach(function (p) {
			if (error) p.reject(error);
			else p.resolve();
		});
	}

	function settleOutroPromises(error) {
		outroPromises.splice(0).forEach(function (p) {
			if (error) p.reject(error);
			else p.resolve();
		});
	}

	return {
		start: function () {
			if (running) {
				if (phase === 1) return endOfIntroPromise();
				return Promise.reject(new Error("Loader is not playing the intro"));
			}
			exitRequested = false;
			running = true;
			phase = 1;
			const prom = endOfIntroPromise();
			playIntro();
			return prom;
		},

		startFromLoop: function () {
			if (running) {
				return Promise.reject(new Error("Loader is already running"));
			}
			exitRequested = false;
			startedFromLoop = true;
			running = true;
			phase = 2;
			$container.css("display", visibleDisplay);
			emit("splash-loop-start");
			playLoop();
			return Promise.resolve();
		},

		cancel: function () {
			if (!running) return false;
			introTimeline.pause();
			loopTimeline.pause();
			outroTimeline.pause();

			animeUtils.set(backgroundPolygons, outroEndState.background);
			animeUtils.set(logoPolygons, outroEndState.logo);
			$container.css("display", hiddenDisplay);

			running = false;
			exitRequested = false;
			startedFromLoop = false;
			phase = 0;

			const err = createCancelError();
			settleIntroPromises(err);
			settleOutroPromises(err);
			emit("splash-cancel");

			return true;
		},

		finish: function () {
			if (phase === 3) return Promise.resolve();
			if (!running) return Promise.reject(new Error("Loader is not running"));
			requestExit();
			return startOfOutroPromise();
		},

		isRunning: function () {
			return running;
		},

		exitRequested: function () {
			return exitRequested;
		},

		getPhase: function () {
			switch (phase) {
				case 0:
					return "idle";
				case 1:
					return "intro";
				case 2:
					return "loop";
				case 3:
					return "outro";
				default:
					return null;
			}
		},
	};
}

// --- <splash-screen> ---------------------------------------------------------

const OPTION_ATTRS = {
	"visible-display": "visibleDisplay",
	"hidden-display": "hiddenDisplay",
	"background-wave-direction": "backgroundWaveDirection",
	"logo-wave-direction": "logoWaveDirection",
	"background-reveal-duration": "backgroundRevealDuration",
	"background-reveal-delay": "backgroundRevealDelay",
	"background-tria-reveal-duration": "backgroundTriaRevealDuration",
	"logo-reveal-duration": "logoRevealDuration",
	"logo-reveal-delay": "logoRevealDelay",
	"logo-tria-reveal-duration": "logoTriaRevealDuration",
	"logo-loop-duration": "logoLoopDuration",
	"logo-loop-delay": "logoLoopDelay",
	"logo-tria-in-duration": "logoTriaInDuration",
	"logo-tria-out-duration": "logoTriaOutDuration",
	"background-hide-duration": "backgroundHideDuration",
	"background-hide-delay": "backgroundHideDelay",
	"background-tria-hide-duration": "backgroundTriaHideDuration",
	"logo-hide-duration": "logoHideDuration",
	"logo-hide-delay": "logoHideDelay",
	"logo-tria-hide-duration": "logoTriaHideDuration",
	"min-splash-duration": "minSplashDuration",
};

class SplashScreen extends HTMLElement {
	connectedCallback() {
		if (!this._readyPromise) {
			this._readyPromise = this._init();
		}
	}

	disconnectedCallback() {
		if (this._loader && this._loader.isRunning()) {
			this._loader.cancel();
		}
	}

	_init() {
		const $this = $(this);
		const background = $this.children("splash-background")[0];
		const logo = $this.children("splash-logo")[0];
		if (!background || !logo) {
			console.error(
				"<splash-screen> requires a <splash-background> and a <splash-logo> child."
			);
			return Promise.resolve();
		}
		return Promise.all([
			customElements.whenDefined("splash-background"),
			customElements.whenDefined("splash-logo"),
			background.ready,
			logo.ready,
		]).then(() => {
			this._loader = createLoader(this, logo, background, this._readOptions());
			this.dispatchEvent(new CustomEvent("splash-ready", { bubbles: true, composed: true }));
		});
	}

	_readOptions() {
		const $this = $(this);
		const opts = {};
		for (const attr in OPTION_ATTRS) {
			const raw = $this.attr(attr);
			if (raw !== undefined) {
				const key = OPTION_ATTRS[attr];
				const num = Number(raw);
				opts[key] = raw !== "" && !Number.isNaN(num) ? num : raw;
			}
		}
		return opts;
	}

	_whenReady() {
		if (!this._readyPromise) this._readyPromise = this._init();
		return this._readyPromise.then(() => {
			if (!this._loader) {
				throw new Error(
					"<splash-screen> failed to initialize (missing <splash-background>/<splash-logo>?)."
				);
			}
			return this._loader;
		});
	}

	// Public API — identical shape to the original loader, all Promise-based.
	start() {
		return this._whenReady().then((loader) => loader.start());
	}

	startFromLoop() {
		return this._whenReady().then((loader) => loader.startFromLoop());
	}

	finish() {
		return this._whenReady().then((loader) => loader.finish());
	}

	cancel() {
		return this._loader ? this._loader.cancel() : false;
	}

	isRunning() {
		return !!this._loader && this._loader.isRunning();
	}

	getPhase() {
		return this._loader ? this._loader.getPhase() : "idle";
	}
}

customElements.define("splash-screen", SplashScreen);
