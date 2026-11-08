import frappe

from tcf_web.jobs import get_open_opening

no_cache = 1


def get_context(context):
	context.no_cache = 1
	opening = get_open_opening(frappe.form_dict.get("opening"))
	context.opening = opening.name if opening else ""
	context.opening_title = opening.job_title if opening else ""
