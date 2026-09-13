frappe.ready(function () {
	$("#splash-screen").fadeOut(300);

	$(document).on("click", "a.splash-link", function (e) {
		if (e.ctrlKey || e.metaKey || $(this).attr("target") === "_blank") return;

		e.preventDefault();
		var targetUrl = $(this).attr("href");

		$("#splash-screen").fadeIn(200, function () {
			$.ajax({
				url: targetUrl,
				method: "GET",
				success: function (response) {
					var doc = new DOMParser().parseFromString(response, "text/html");
					var newContent = doc.querySelector("#page-container").innerHTML;

					var newTitle = doc.querySelector("title");
					if (newTitle) document.title = newTitle.innerText;

					$("#page-container").html(newContent);
					window.history.pushState({ path: targetUrl }, "", targetUrl);

					$("#splash-screen").fadeOut(300);
				},
				error: function () {
					window.location.href = targetUrl;
				},
			});
		});
	});

	$(window).on("popstate", function () {
		$("#splash-screen").fadeIn(200, function () {
			window.location.reload();
		});
	});
});
