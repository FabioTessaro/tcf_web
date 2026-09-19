$(document).ready(function () {
	$.loader = $.createLoader("#splash-container", "#splash-logo", "#splash-background", {
		onStart: function () {},
		onFinish: function () {},
		onCancel: function () {},
	});

	$.loader.startFromLoop();

	if (document.readyState === "complete") {
		$.loader.finish();
	} else {
		$(window).on("load", function () {
			$.loader.finish();
		});
	}

	$(document).on("htmx:beforeRequest", function () {
		console.log("This should fire before the request");
		$.loader.start();
	});

	$(document).on("htmx:afterRequest", function () {
		console.log($.loader.getPhase());
		$.loader.finish();
		console.log(
			"This should fire after the response has been received and the new page loaded."
		);
	});

	$(document).on("htmx:timeout", function () {
		console.log(
			"This should fire if the request times out. Add something in splash.js you idiot."
		);
	});

	$(document).on("htmx:sendError", function () {
		console.log(
			"This should fire if the request couldn't be sent at all. Add something in splash.js you idiot."
		);
	});

	$(document).on("htmx:responseError", function () {
		console.log(
			"This should fire if the response is an error like 4XX or 5XX. Add something in splash.js you idiot."
		);
	});
});
