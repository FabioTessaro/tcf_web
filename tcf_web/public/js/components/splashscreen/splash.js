/* global anime */
$(function () {
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
		var logoLoopDuration = opts.logoLoopDuration || 800;
		var logoLoopDelay = opts.logoLoopDelay || 1000;
		var logoTriaInDuration = opts.logoTriaInDuration || 150;
		var logoTriaOutDuration = opts.logoTriaOutDuration || 300;

		var outroDuration = opts.outroDuration || 300;

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
		const loopCentralState = {
			logo: {
				scale: 0.65,
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
					exitRequested = false;
					running = true;
					$container.css("display", visibleDisplay);
					utils.set($backgroundTria.toArray(), introStartState.background);
					utils.set($logoTria.toArray(), introStartState.logo);
				},
				onLoop: null,
				onComplete: (anim) => {
					playLoop();
				},
			})
			.add(
				$backgroundTriaArray,
				{
					opacity: [
						{ to: introStartState.background.opacity, duration: 0 },
						{ to: 1, duration: backgroundTriaRevealDuration, ease: "outSine" },
					],
					scale: [
						{ to: introStartState.background.scale, duration: 0 },
						{ to: 1, duration: backgroundTriaRevealDuration, ease: "outSine" },
					],
					delay: (e, i) => backgroundTriaRevealDelay[i],
				},
				backgroundRevealDelay
			)
			.add(
				$logoTriaArray,
				{
					opacity: [
						{ to: introStartState.logo.opacity, duration: 0 },
						{ to: 1, duration: logoTriaRevealDuration, ease: "outSine" },
					],
					scale: [
						{ to: introStartState.logo.scale, duration: 0 },
						{ to: 1, duration: logoTriaRevealDuration, ease: "outSine" },
					],
					delay: (e, i) => logoTriaRevealDelay[i],
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
				loop: true,
				loopDelay: logoLoopDelay,
				autoplay: false,
				onBegin: (anim) => {
					if (exitRequested) {
						anim.cancel();
						// Settare i parametri al default per sicurezza
						playOutro();
					}
				},
				onLoop: function (anim) {
					if (exitRequested) {
						anim.cancel();
						// Settare i parametri al default per sicurezza
						playOutro();
					}
				},
				onComplete: null,
			})
			.add(
				$logoTriaArray,
				{
					scale: [
						{ to: 1, duration: 0 },
						{
							to: loopCentralState.logo.scale,
							duration: logoTriaInDuration,
							ease: "outSine",
						},
						{ to: 1, duration: logoTriaOutDuration, ease: "inSine" },
					],
					delay: (e, i) => logoTriaLoopDelay[i],
				},
				0
			);

		function requestExit() {
			exitRequested = true;
		}

		function playIntro() {
			introTimeline.play();
		}

		function playLoop() {
			loopTimeline.play();
		}

		function playOutro() {
			animate($container[0], {
				opacity: [1, 0],
				rotateY: [0, 90],
				duration: outroDuration,
				ease: "inSine",
				onComplete: function () {
					running = false;
					$container.css("display", hiddenDisplay);
					onFinish();
				},
			});
		}

		return {
			start: function () {
				if (running) return;
				onStart();
				playIntro();
			},

			startFromLoop: function () {
				if (running) return;
				onStart();
				playLoop();
			},

			finish: function () {
				exitRequested = true;
			},

			isRunning: function () {
				return running;
			},
		};
	};

	$.loader = $.createLoader("#splash-container", "#splash-logo", "#splash-background", {
		onStart: function () {},
		onFinish: function () {},
	});

	$(document).ready(function () {
		$.loader.start();
	});
});
