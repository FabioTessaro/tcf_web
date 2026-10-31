$(function () {
	const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	const DEFAULT_DESTINATION = "/";

	function isValidLogin(value) {
		const login = value.trim();
		return login === "Administrator" || EMAIL_REGEX.test(login);
	}

	function getNavigateTarget() {
		const raw = new URLSearchParams(window.location.search).get("redirect-to");
		if (!raw) {
			return DEFAULT_DESTINATION;
		}

		try {
			const url = new URL(raw, window.location.origin);

			// Same origin only; this rejects //host, /\host, https://other.com, javascript:, etc.
			if (url.origin !== window.location.origin) {
				return DEFAULT_DESTINATION;
			}

			// Return a normalized relative URL, not the raw string
			return url.pathname + url.search + url.hash;
		} catch (e) {
			return DEFAULT_DESTINATION;
		}
	}

	$(document).on("submit", "#loginForm", function (event) {
		event.preventDefault();

		const email = $("#loginEmail").val().trim();
		const password = $("#loginPassword").val();

		if (!isValidLogin(email)) {
			console.error("Invalid Email");
			return;
		}

		$.api.auth
			.login(email, password)
			.then(function (response) {
				$.navigation.navigateTo(getNavigateTarget(), true);
			})
			.catch(function (error) {
				console.error(error);
			});

		return false;
	});
});
