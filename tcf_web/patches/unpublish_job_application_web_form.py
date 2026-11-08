import frappe

WEB_FORM = "job-application"


def execute():
	"""Unpublish hrms' public Job Application web form.

	Frappe resolves a published Web Form before any www page (WebFormPage comes before
	TemplatePage), so /job_application would keep serving hrms' form next to our own /apply
	page. Unpublished, it no longer answers.

	Also run from the after_migrate hook: hrms ships this web form as standard JSON, so a
	migrate may sync it back to published."""
	if not frappe.db.exists("Web Form", WEB_FORM):
		return
	if frappe.db.get_value("Web Form", WEB_FORM, "published"):
		frappe.db.set_value("Web Form", WEB_FORM, "published", 0)
		frappe.clear_cache()
