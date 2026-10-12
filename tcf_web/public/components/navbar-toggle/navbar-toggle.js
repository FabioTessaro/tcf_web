$(document).ready(function () {
	$(document).on("click", "div[navbar-role='toggle-open']", function () {
		NavbarComponent.request(this, "open")
			.then(function (r) {
				/* { expanded, changed, cancelled, reason } */
			})
			.catch(function (err) {
				console.error(err);
			});
	});

	$(document).on("click", "div[navbar-role='toggle-close']", function () {
		NavbarComponent.request(this, "close")
			.then(function (r) {
				/* { expanded, changed, cancelled, reason } */
			})
			.catch(function (err) {
				console.error(err);
			});
	});
});
