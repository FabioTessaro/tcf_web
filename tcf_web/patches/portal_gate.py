import frappe
from frappe.website.page_renderers.base_renderer import BaseRenderer

# First path segment of every route tcf_core/tcf_web are allowed to own,
# plus the framework internals that must never be blocked.
# Add to this one prefix at a time as you build real pages.
ALLOWED_PREFIXES = {
	"",
	"desk",
	"drive",
	"meet",
	"login",
	"raven",
	"update-password",
	"reset-password",
	"printview",
	"printpreview",
	"qrcode",
	"website_script.js",
	"robots.txt",
	"sitemap.xml",
	"api",
	"assets",
	"files",
	"private",
	"backups",
	"/",
	"index",
}


class TCFPortalGate(BaseRenderer):
	"""Blocks every erpnext/hrms/frappe website page and dynamic web view
	that tcf_core hasn't explicitly claimed."""

	def can_render(self):
		first_segment = self.path.strip("/").split("/", 1)[0]
		return first_segment not in ALLOWED_PREFIXES

	def render(self):
		raise frappe.PageDoesNotExistError
