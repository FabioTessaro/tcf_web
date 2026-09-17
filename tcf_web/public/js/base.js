window.frappe = {};
window.csrf_token = "{{ frappe.session.csrf_token }}";
frappe.csrf_token = "{{ frappe.session.csrf_token }}";
frappe.ready_events = [];
frappe.ready = function (fn) {
	frappe.ready_events.push(fn);
};
$(function () {
	frappe.ready_events.forEach(function (fn) {
		fn();
	});
});
