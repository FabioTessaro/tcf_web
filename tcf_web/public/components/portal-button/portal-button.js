$(document).ready(function () {
	function changeButton(session) {
		if (session.isGuest) {
			$(".portal-button-desktop-label").attr("data-i18n", "portal-button:guest").localize();
			$(".portal-button-desktop-icon").html("account_circle");
		} else {
			if (session.roles.includes("Desk User")) {
				$(".portal-button-desktop-label")
					.attr("data-i18n", "portal-button:loggedUser.deskUser")
					.localize();
				$(".portal-button-desktop-icon").html("apps");
			} else {
				$(".portal-button-desktop-label")
					.attr("data-i18n", "portal-button:loggedUser.portalUser")
					.localize();
				$(".portal-button-desktop-icon").html("globe");
			}
		}
	}

	$(document).on("frappe:ready", function (event, session) {
		changeButton(session);
	});
	$(document).on("frappe:session-changed", function (event, session, previousUser) {
		changeButton(session);
	});
});
