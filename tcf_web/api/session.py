import frappe
from frappe.sessions import get_csrf_token


@frappe.whitelist(allow_guest=True, methods=["GET"])
def get_session():
	"""Return everything the frontend needs to bootstrap a session.

	Safe for guests: they get user="Guest" and no CSRF token.
	"""
	user = frappe.session.user
	is_guest = user == "Guest"

	return {
		"user": user,
		"is_guest": is_guest,
		"full_name": None if is_guest else frappe.utils.get_fullname(user),
		"roles": frappe.get_roles(user),
		"lang": frappe.local.lang,
		"csrf_token": None if is_guest else get_csrf_token(),
	}
