/* global anime */
$(document).ready(function () {
	var animate = anime.animate;
	var utils = anime.utils;

	$.createLoader = function (container, logo, background, opts) {
		// Here we create the main settings and parse the options
		opts = opts || {};

		// These are the target elements on which to calculate and play the animation. They are required
		var $container = $(container);
		var $logo = $container.find(logo);
		var $background = $container.find(background);

		// We find the polygons inside the logo and background here
		var $backgroundTria = $background.find("polygon");
		var $logoTria = $logo.find("polygon");
		var $backgroundTriaArray = $backgroundTria.toArray();
		var $logoTriaArray = $logoTria.toArray();

		// These config are for the overall container
		var visibleDisplay = opts.visibleDisplay || "flex";
		var hiddenDisplay = opts.hiddenDisplay || "none";

		// These config are for general animation parameters
		var backgroundWaveDirection = opts.backgroundWaveDirection || 45;
		var logoWaveDirection = opts.logoWaveDirection || 45;

		// These config are for the intro animation
		var backgroundRevealDuration = opts.backgroundRevealDuration || 600;
		var backgroundRevealDelay = opts.backgroundRevealDelay || 0;
		var backgroundTriaRevealDuration = opts.backgroundTriaRevealDuration || 200;
		var logoRevealDuration = opts.logoRevealDuration || 500;
		var logoRevealDelay = opts.logoRevealDelay || 250;
		var logoTriaRevealDuration = opts.logoTriaRevealDuration || 200;

		// These configs are for the loop animation
		var logoLoopDuration = opts.logoLoopDuration || 600;
		var logoLoopDelay = opts.logoLoopDelay || 800;
		var logoTriaInDuration = opts.logoTriaInDuration || 100;
		var logoTriaOutDuration = opts.logoTriaOutDuration || 100;

		// These config are for the intro animation
		var backgroundHideDuration = opts.backgroundHideDuration || 600;
		var backgroundHideDelay = opts.backgroundHideDelay || 250;
		var backgroundTriaHideDuration = opts.backgroundTriaHideDuration || 200;
		var logoHideDuration = opts.logoHideDuration || 500;
		var logoHideDelay = opts.logoHideDelay || 0;
		var logoTriaHideDuration = opts.logoTriaHideDuration || 200;

		// These are the user defined callback functions
		var onStart = opts.onStart || function () {};
		var onFinish = opts.onFinish || function () {};
		var onCancel = opts.onCancel || function () {};

		// These are the css states for before intro, between loops, and after outro.
		const introStartState = {
			background: {
				opacity: 0,
				scale: 1,
			},
			logo: {
				opacity: 0,
				scale: 0.2,
			},
		};
		const neutralState = {
			background: {
				opacity: 1,
				scale: 1,
			},
			logo: {
				opacity: 1,
				scale: 1,
			},
		};
		const loopState = {
			logo: {
				opacity: 1,
				scale: 0.6,
			},
		};
		const outroEndState = {
			background: {
				opacity: 0,
				scale: 1,
			},
			logo: {
				opacity: 0,
				scale: 0.2,
			},
		};

		// Here we create the main state variables for the loader
		var exitRequested = false;
		var running = false;
		var phase = 0; // 0 = idle, 1 = intro, 2 = loop, 3 = outro
		var introPromises = [];
		var outroPromises = [];

		// Here we define math functions for parsing the background and logo svgs and calculating animation timings
		function getSVGCoordinates(el) {
			const bbox = el.children("svg")[0].getBBox();
			const x = bbox.x + bbox.width / 2;
			const y = bbox.y + bbox.height / 2;
			return {
				x: x,
				y: y,
			};
		}

		function getPolygonCoordinates(el) {
			var x = [];
			var y = [];
			el.each(function () {
				if (this.points && this.points.numberOfItems === 4) {
					const p1 = this.points.getItem(0);
					const p2 = this.points.getItem(1);
					const p3 = this.points.getItem(2);
					x.push((p1.x + p2.x + p3.x) / 3);
					y.push((p1.y + p2.y + p3.y) / 3);
				} else {
					const bbox = this.getBBox();
					x.push(bbox.x + bbox.width / 2);
					y.push(bbox.y + bbox.height / 2);
				}
			});
			return {
				x: x,
				y: y,
			};
		}

		function getNormalizedDistances(center, points, direction) {
			const distances = points.x.map(function (e, i) {
				return (e - center.x) * direction.vx + (points.y[i] - center.y) * direction.vy;
			});
			const minDistance = Math.min(...distances);
			const maxDistance = Math.max(...distances);
			const span = maxDistance - minDistance || 1e-6;
			return distances.map(function (e, i) {
				return (e - minDistance) / span;
			});
		}

		function getDelays(stagger, totalDuration, individualDuration) {
			const totalStaggerTimePool = totalDuration - individualDuration;
			return stagger.map(function (e, i) {
				return e * totalStaggerTimePool;
			});
		}

		// Herewe calculate svg animation properties
		var backgroundCenter = getSVGCoordinates($background);
		var backgroundTriaCenter = getPolygonCoordinates($backgroundTria);
		var logoCenter = getSVGCoordinates($logo);
		var logoTriaCenter = getPolygonCoordinates($logoTria);
		var backgroundWave = {
			vx: Math.cos((backgroundWaveDirection * Math.PI) / 180),
			vy: Math.sin((backgroundWaveDirection * Math.PI) / 180),
		};
		var logoWave = {
			vx: Math.cos((logoWaveDirection * Math.PI) / 180),
			vy: Math.sin((logoWaveDirection * Math.PI) / 180),
		};
		var backgroundStagger = getNormalizedDistances(
			backgroundCenter,
			backgroundTriaCenter,
			backgroundWave
		);
		var logoStagger = getNormalizedDistances(logoCenter, logoTriaCenter, logoWave);

		// Here we create the timeline for the intro animation by superimposing the background and logo animations
		var backgroundTriaRevealDelay = getDelays(
			backgroundStagger,
			backgroundRevealDuration,
			backgroundTriaRevealDuration
		);
		var logoTriaRevealDelay = getDelays(
			logoStagger,
			logoRevealDuration,
			logoTriaRevealDuration
		);
		var introTimeline = anime
			.createTimeline({
				loop: 0,
				autoplay: false,
				onBegin: () => {
					$container.css("display", visibleDisplay);
					utils.set($backgroundTriaArray, introStartState.background);
					utils.set($logoTriaArray, introStartState.logo);
					phase = 1;
				},
				onLoop: null,
				onComplete: () => {
					utils.set($backgroundTriaArray, neutralState.background);
					utils.set($logoTriaArray, neutralState.logo);
					settleIntroPromises();
					if (exitRequested) {
						playOutro();
					} else {
						phase = 2;
						playLoop();
					}
				},
			})
			.add(
				$backgroundTriaArray,
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
					delay: (e, i) => backgroundTriaRevealDelay[i],
					composition: 1,
				},
				backgroundRevealDelay
			)
			.add(
				$logoTriaArray,
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
					delay: (e, i) => logoTriaRevealDelay[i],
					composition: 1,
				},
				logoRevealDelay
			);

		// Here we create the timeline for the loop animation, for now just the logo animates, but we can add other timelines in the future
		var logoTriaLoopDelay = getDelays(
			logoStagger,
			logoLoopDuration,
			logoTriaInDuration + logoTriaOutDuration
		);
		var loopTimeline = anime
			.createTimeline({
				loop: 0,
				autoplay: false,
				onBegin: null,
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
				$logoTriaArray,
				{
					scale: [
						{ to: neutralState.logo.scale, duration: 0 },
						{
							to: loopState.logo.scale,
							duration: logoTriaInDuration,
							ease: "outSine",
						},
						{
							to: neutralState.logo.scale,
							duration: logoTriaOutDuration,
							ease: "inSine",
						},
						{
							to: neutralState.logo.scale,
							duration: logoLoopDelay / 2,
						},
					],
					delay: (e, i) => logoTriaLoopDelay[i],
				},
				logoLoopDelay / 2
			);

		// Here we create the timeline for the outro animationby superimposing the background and logo animations
		var backgroundTriaHideDelay = getDelays(
			backgroundStagger,
			backgroundHideDuration,
			backgroundTriaHideDuration
		);
		var logoTriaHideDelay = getDelays(logoStagger, logoHideDuration, logoTriaHideDuration);
		var outroTimeline = anime
			.createTimeline({
				loop: 0,
				autoplay: false,
				onBegin: () => {
					settleOutroPromises();
					utils.set($backgroundTriaArray, neutralState.background);
					utils.set($logoTriaArray, neutralState.logo);
					phase = 3;
				},
				onLoop: null,
				onComplete: () => {
					utils.set($backgroundTriaArray, outroEndState.background);
					utils.set($logoTriaArray, outroEndState.logo);
					$container.css("display", hiddenDisplay);
					running = false;
					phase = 0;
					onFinish();
				},
			})
			.add(
				$backgroundTriaArray,
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
					delay: (e, i) => backgroundTriaHideDelay[i],
					composition: 1,
				},
				backgroundHideDelay
			)
			.add(
				$logoTriaArray,
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
					delay: (e, i) => logoTriaHideDelay[i],
					composition: 1,
				},
				logoHideDelay
			);

		// Here we create the methods that play the timelines and requests the exit.
		function requestExit() {
			if (running) {
				exitRequested = true;
				return;
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

		// Here we create the promises that can be fired when intro finishes and outro starts
		function endOfIntroPromise() {
			return new Promise(function (resolveFunc, rejectFunc) {
				introPromises.push({
					resolve: resolveFunc,
					reject: rejectFunc,
				});
			});
		}

		function startOfOutroPromise() {
			return new Promise(function (resolveFunc, rejectFunc) {
				outroPromises.push({
					resolve: resolveFunc,
					reject: rejectFunc,
				});
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

		// Here we create the cancel error
		function createCancelError() {
			var err = new Error("Loader cancelled");
			err.name = "LoaderCancelled";
			err.cancelled = true;
			return err;
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
				var prom = endOfIntroPromise();
				onStart();
				playIntro();
				return prom;
			},

			startFromLoop: function () {
				if (running) {
					return Promise.reject(new Error("Loader is already running"));
				}
				exitRequested = false;
				running = true;
				phase = 2;
				onStart();
				playLoop();
				return Promise.resolve();
			},

			cancel: function () {
				if (!running) return false;
				introTimeline.pause();
				loopTimeline.pause();
				outroTimeline.pause();

				utils.set($backgroundTriaArray, outroEndState.background);
				utils.set($logoTriaArray, outroEndState.logo);
				$container.css("display", hiddenDisplay);

				running = false;
				exitRequested = false;
				phase = 0;

				var err = createCancelError();
				settleIntroPromises(err);
				settleOutroPromises(err);

				onCancel();
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
	};
});
