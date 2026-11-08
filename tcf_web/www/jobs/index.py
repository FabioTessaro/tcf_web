import frappe

from tcf_web.jobs import list_openings

no_cache = 1


def get_context(context):
	# Overrides hrms' www/jobs: tcf_web is installed after hrms, so this page wins.
	context.no_cache = 1
	context.update(list_openings(frappe.form_dict.get("query"), frappe.form_dict.get("page")))
