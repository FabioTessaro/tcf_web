import { FrappeApp } from "https://cdn.jsdelivr.net/npm/frappe-js-sdk/+esm";

const app = new FrappeApp();

$.api = {
	app: app,
	auth: app.auth(),
	db: app.db(),
	call: app.call(),
	file: app.file(),
};
