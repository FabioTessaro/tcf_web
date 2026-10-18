$(document).ready(function () {
	$(document).on("click", "div.language-option", function () {
		$.localization.setLanguage($(this).children("div").attr("lang"));
	});
	$(document).on("click", "div.language-option-mobile", function () {
		$.localization.setLanguage($(this).children("div").attr("lang"));
		$("div.language-switcher-mobile-popup-container").attr("active", "false");
	});
	$(document).on("click", "div.language-switcher-mobile-trigger", function () {
		$("div.language-switcher-mobile-popup-container").attr("active", "true");
	});
});
