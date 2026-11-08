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

		// Logged-in change: the server checks the current password. Resolves with the URL
		// Frappe suggests next (a string) and the session is refreshed, because Frappe logs
		// the user in again after the change. 401 = wrong current password.
		changePassword: function (oldPassword, newPassword) {
			if (!oldPassword || !newPassword) {
				return Promise.reject(
					toError({ httpStatus: 400, message: "Both passwords are required." })
				);
			}
			return updatePassword(ctx, { old_password: oldPassword, new_password: newPassword });
		},

		// Emailed-link flow: the key comes from ?key= in the link. 410 = link used or expired.
		resetPassword: function (key, newPassword) {
			if (!key || !newPassword) {
				return Promise.reject(
					toError({ httpStatus: 400, message: "A key and a new password are required." })
				);
			}
			return updatePassword(ctx, { key: key, new_password: newPassword });
		},
	};
});

function updatePassword(ctx, params) {
	return ctx.sdk.call
		.post("frappe.core.doctype.user.user.update_password", params)
		.catch(function (err) {
			throw toError(err);
		})
		.then(function (res) {
			return ctx.session.refresh().then(function () {
				return res && res.message;
			});
		});
}
