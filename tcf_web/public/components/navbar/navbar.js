const $ = window.jQuery || window.$;
if (typeof $ !== "function") {
	throw new Error(
		"navbar.js requires jQuery to be loaded globally (as `window.jQuery`/`window.$`) before this module runs."
	);
}

// --- auto-inject navbar.css, once, next to this module ---------------------
(function injectStyles() {
	if ($("link[data-navbar-styles]").length) return;
	$("<link>", {
		rel: "stylesheet",
		href: new URL("./navbar.css", import.meta.url).href,
	})
		.attr("data-navbar-styles", "")
		.appendTo("head");
})();
