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

		// These are the css states for before intro, between loops, and after outro.
		const introStartState = {
			background: {
				opacity: 0,
				scale: 1,
			},
			logo: {
				opacity: 0,
				scale: 1.5,
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
				scale: 0.65,
			},
		};
		const outroEndState = {
			background: {
				opacity: 0,
				scale: 1,
			},
			logo: {
				opacity: 0,
				scale: 1.5,
			},
		};

		// Here we create the main state variables for the loader
		var exitRequested = false;
		var running = false;

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

		// Here we create the timeline for the intro animation by superimposing the background and logo animations with their individual staggers
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
				},
				onLoop: null,
				onComplete: () => {
					utils.set($backgroundTriaArray, neutralState.background);
					utils.set($logoTriaArray, neutralState.logo);
					if (exitRequested) {
						playOutro();
					} else {
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
				onComplete: function (anim) {
					if (exitRequested) {
						playOutro();
					} else {
						playLoop(true);
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
					],
					delay: (e, i) => logoTriaLoopDelay[i],
				},
				logoLoopDelay
			);

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
				delay: logoLoopDelay,
				onBegin: () => {
					utils.set($backgroundTriaArray, neutralState.background);
					utils.set($logoTriaArray, neutralState.logo);
				},
				onLoop: null,
				onComplete: () => {
					utils.set($backgroundTriaArray, outroEndState.background);
					utils.set($logoTriaArray, outroEndState.logo);
					$container.css("display", hiddenDisplay);
					running = false;
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

		function requestExit() {
			exitRequested = true;
		}

		function playIntro() {
			introTimeline.play();
		}

		function playLoop(restart) {
			if (restart) {
				loopTimeline.restart();
				return;
			}
			loopTimeline.play();
		}

		function playOutro() {
			outroTimeline.play();
		}

		return {
			start: function () {
				if (running) return;
				exitRequested = false;
				running = true;
				onStart();
				playIntro();
			},

			startFromLoop: function () {
				if (running) return;
				exitRequested = false;
				running = true;
				onStart();
				playLoop();
			},

			finish: function () {
				requestExit();
			},

			isRunning: function () {
				return running;
			},

			exitRequested: function () {
				return exitRequested;
			},
		};
	};

	$.loader = $.createLoader("#splash-container", "#splash-logo", "#splash-background", {
		onStart: function () {},
		onFinish: function () {},
	});

	$.loader.startFromLoop();

	if (document.readyState === "complete") {
		$.loader.finish();
	} else {
		$(window).on("load", $.loader.finish);
	}
});
