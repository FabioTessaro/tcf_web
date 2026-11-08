import frappe
from frappe.rate_limiter import rate_limit

from tcf_web.api.job_validation import (
	MAX_RESUME_BYTES,
	check_resume,
	safe_filename,
	validate_application,
)
from tcf_web.jobs import get_open_opening

APPLICATIONS_PER_HOUR = 5
HONEYPOT_FIELD = "website"  # hidden in the form; people leave it empty, form-filling bots do not
SOURCE = "Website Listing"

# Same text for every outcome the visitor must not be able to tell apart
OK = {"ok": True}


def _fail(errors: dict, status: int = 422) -> dict:
	frappe.local.response["http_status_code"] = status
	return {"ok": False, "errors": errors}


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=APPLICATIONS_PER_HOUR, seconds=60 * 60)
def submit_application():
	"""Public job application. Multipart POST with the form fields and a `resume` file.

	Guests may call this, so nothing from the request is trusted: every value is validated and
	cleaned (see job_validation), the job title comes from the opening and never from the
	client, and permissions are skipped only for the two inserts below."""
	form = frappe.form_dict

	if form.get(HONEYPOT_FIELD):
		return OK  # a bot: behave as if it worked, store nothing

	clean, errors = validate_application(form)

	upload = frappe.request.files.get("resume")
	data = b""
	if upload is None or not upload.filename:
		errors["resume"] = "errors.required"
	else:
		data = upload.stream.read(MAX_RESUME_BYTES + 1)  # never read more than the limit allows
		error = check_resume(upload.filename, upload.mimetype, data[:16], len(data))
		if error:
			errors["resume"] = error

	if errors:
		return _fail(errors)

	opening = get_open_opening(clean["opening"])
	if not opening:
		return _fail({"opening": "errors.invalidOpening"})

	try:
		applicant = frappe.get_doc(
			{
				"doctype": "Job Applicant",
				"applicant_name": clean["applicant_name"],
				"email_id": clean["email_id"],
				"phone_number": clean["phone_number"],
				"cover_letter": clean["cover_letter"],
				"job_title": opening.name,
				"status": "Open",
				"source": SOURCE if frappe.db.exists("Job Applicant Source", SOURCE) else None,
			}
		).insert(ignore_permissions=True)

		file = frappe.get_doc(
			{
				"doctype": "File",
				"file_name": safe_filename(upload.filename),
				"content": data,
				"is_private": 1,
				"attached_to_doctype": "Job Applicant",
				"attached_to_name": applicant.name,
				"attached_to_field": "resume_attachment",
			}
		).insert(ignore_permissions=True)
		applicant.db_set("resume_attachment", file.file_url)
	except Exception as exc:
		if type(exc).__name__ == "DuplicationError":
			# Already applied to this opening. Same answer as a new application, so the form
			# cannot be used to find out which email addresses have applied.
			frappe.db.rollback()
			return OK
		frappe.db.rollback()
		frappe.log_error(title="Job application failed")
		return _fail({"form": "errors.generic"}, status=500)

	return OK
