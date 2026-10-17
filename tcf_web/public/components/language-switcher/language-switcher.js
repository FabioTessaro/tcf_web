$(document).ready(function () {
	$(document).on("click", "div.language-option", function () {
		$.localization.setLanguage($(this).children("div").attr("lang"));
	});
});
