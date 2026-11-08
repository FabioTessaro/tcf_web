"""Data helpers for the public jobs pages (www/jobs, www/apply, the job detail template).

Everything here runs for guests, so only published, open Job Openings are ever read and only
the listed fields leave this module.
"""

import frappe
from frappe.utils import getdate, nowdate

from tcf_web.api.job_validation import PAGE_LENGTH, clean_text, page_count, parse_page

LIST_FIELDS = [
	"name",
	"job_title",
	"company",
	"location",
	"employment_type",
	"department",
	"posted_on",
	"route",
]
MAX_QUERY = 100


def _base_filters(txt: str = "") -> list:
	filters = [
		["Job Opening", "publish", "=", 1],
		["Job Opening", "status", "=", "Open"],
	]
	if txt:
		filters.append(["Job Opening", "job_title", "like", f"%{txt}%"])
	return filters


def list_openings(query=None, page=None) -> dict:
	"""One page of published, open openings, newest first, with the numbers the pager needs."""
	txt = clean_text(query)[:MAX_QUERY]
	filters = _base_filters(txt)
	total = frappe.db.count("Job Opening", filters)
	pages = page_count(total)
	page = parse_page(page, pages)

	openings = frappe.get_all(
		"Job Opening",
		filters=filters,
		fields=LIST_FIELDS,
		order_by="posted_on desc, creation desc",
		limit_start=(page - 1) * PAGE_LENGTH,
		limit_page_length=PAGE_LENGTH,
	)
	return {"openings": openings, "query": txt, "page": page, "pages": pages, "total": total}


def get_open_opening(name) -> dict | None:
	"""The opening if it can still receive applications (published, Open, not past its closing date)."""
	name = clean_text(name)
	if not name or len(name) > 140:
		return None
	opening = frappe.db.get_value(
		"Job Opening",
		{"name": name, "publish": 1, "status": "Open"},
		["name", "job_title", "company", "closes_on"],
		as_dict=True,
	)
	if not opening:
		return None
	if opening.closes_on and getdate(opening.closes_on) < getdate(nowdate()):
		return None
	return opening


def safe_html(html) -> str:
	"""Jinja helper: HR-authored rich text, cleaned before it is printed unescaped."""
	from frappe.utils.html_utils import sanitize_html

	return sanitize_html(html or "")
