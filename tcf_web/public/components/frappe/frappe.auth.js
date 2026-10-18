function toError(err) {
	const message = (err && (err.message || err.exception)) || "Request failed";
	const error = new Error(message);
	error.status = err && err.httpStatus;
	error.cause = err;
	return error;
}

$.api.extend("auth", function (ctx) {
	return {
		login: function (username, password) {
			return ctx.sdk.auth
				.loginWithUsernamePassword({ username: username, password: password })
				.catch(function (err) {
					throw toError(err);
				})
				.then(function () {
					return ctx.session.refresh();
				});
		},

		logout: function () {
			return ctx.sdk.auth
				.logout()
				.catch(function (err) {
					throw toError(err);
				})
				.then(function () {
					return ctx.session.refresh();
				});
		},
	};
});
