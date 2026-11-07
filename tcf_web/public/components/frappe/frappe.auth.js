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

		forgot: function (username) {
			const user = String(username == null ? "" : username).trim();
			if (!user) {
				return Promise.reject(
					toError({ httpStatus: 400, message: "A user is required." })
				);
			}
			return ctx.sdk.call
				.post("frappe.core.doctype.user.user.reset_password", { user: user })
				.catch(function (err) {
					throw toError(err);
				})
				.then(function (res) {
					if (res && res.message === "not allowed") {
						throw toError({
							httpStatus: 403,
							message: "Password reset is not allowed for this account.",
						});
					}
				});
		},
	};
});
