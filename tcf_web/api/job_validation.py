"""Pure validation for the public job application form.

No frappe import on purpose: everything here takes plain values and returns plain values, so it
can be unit tested without a site. api/jobs.py is the only caller and stays the authority; the
browser form (job-apply-form.js) mirrors these limits for convenience only.

Error values are i18n keys of the "jobs" namespace (see components/jobs/jobs.i18n.js).
"""

import re

MAX_NAME = 140
MAX_EMAIL = 140
MAX_COVER_LETTER = 3000
MAX_RESUME_BYTES = 5 * 1024 * 1024
MAX_FILENAME = 100
MAX_PAGE = 10_000
PAGE_LENGTH = 12

_EMAIL = re.compile(r"^[^\s@<>\"',;:()\[\]\\]+@[^\s@<>\"',;:()\[\]\\]+\.[^\s@<>\"',;:()\[\]\\]{2,}$")
_PHONE = re.compile(r"^[+0-9][0-9 ()./-]{4,29}$")
_TAGS = re.compile(r"<[^>]*>")
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")

# extension -> (content types a browser sends for it, leading bytes of the real file)
RESUME_TYPES = {
	"pdf": ({"application/pdf"}, (b"%PDF-",)),
	"doc": ({"application/msword"}, (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1",)),
	"docx": (
		{"application/vnd.openxmlformats-officedocument.wordprocessingml.document"},
		(b"PK\x03\x04",),
	),
}
# Some browsers and clients send no useful type; the leading bytes still have to match
GENERIC_CONTENT_TYPES = {"", "application/octet-stream"}


def clean_text(value, *, multiline=False) -> str:
	"""Strip control characters and tags, trim, and collapse whitespace. Never raises."""
	if value is None:
		return ""
	text = _CONTROL.sub("", str(value)).replace("\r\n", "\n").replace("\r", "\n")
	text = _TAGS.sub("", text)
	if multiline:
		text = re.sub(r"[ \t]+", " ", text)
		text = re.sub(r"\n{3,}", "\n\n", text)
	else:
		text = re.sub(r"\s+", " ", text)
	return text.strip()


def validate_application(data: dict) -> tuple[dict, dict]:
	"""Return (clean values, errors). Errors map a field name to an i18n key; empty means valid."""
	data = data or {}
	clean = {
		"opening": clean_text(data.get("opening")),
		"applicant_name": clean_text(data.get("applicant_name")),
		"email_id": clean_text(data.get("email_id")).lower(),
		"phone_number": clean_text(data.get("phone_number")),
		"cover_letter": clean_text(data.get("cover_letter"), multiline=True),
	}
	errors = {}

	if not clean["opening"] or len(clean["opening"]) > 140:
		errors["opening"] = "errors.invalidOpening"

	if not clean["applicant_name"]:
		errors["applicant_name"] = "errors.required"
	elif len(clean["applicant_name"]) > MAX_NAME:
		errors["applicant_name"] = "errors.tooLong"

	if not clean["email_id"]:
		errors["email_id"] = "errors.required"
	elif len(clean["email_id"]) > MAX_EMAIL or not _EMAIL.match(clean["email_id"]):
		errors["email_id"] = "errors.invalidEmail"

	if clean["phone_number"] and not _PHONE.match(clean["phone_number"]):
		errors["phone_number"] = "errors.invalidPhone"

	if len(clean["cover_letter"]) > MAX_COVER_LETTER:
		errors["cover_letter"] = "errors.tooLong"

	return clean, errors


def extension_of(filename) -> str:
	name = str(filename or "").rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
	return name.rsplit(".", 1)[-1].lower() if "." in name else ""


def safe_filename(filename) -> str:
	"""Base name only, a conservative character set, a bounded length, the extension kept."""
	name = str(filename or "").rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
	ext = extension_of(name)
	stem = name[: -(len(ext) + 1)] if ext else name
	stem = re.sub(r"[^A-Za-z0-9._-]+", "_", stem).strip("._-") or "resume"
	return f"{stem[: MAX_FILENAME - len(ext) - 1]}.{ext}"


def check_resume(filename, content_type, head: bytes, size: int) -> str | None:
	"""Return an error key, or None when the file is acceptable.

	`head` is the first bytes of the upload, `size` its full length in bytes."""
	ext = extension_of(filename)
	if ext not in RESUME_TYPES:
		return "errors.resumeType"
	if not size:
		return "errors.resumeEmpty"
	if size > MAX_RESUME_BYTES:
		return "errors.resumeTooLarge"

	allowed_types, magic = RESUME_TYPES[ext]
	declared = str(content_type or "").split(";", 1)[0].strip().lower()
	if declared not in allowed_types and declared not in GENERIC_CONTENT_TYPES:
		return "errors.resumeType"
	if not any(bytes(head or b"").startswith(m) for m in magic):
		return "errors.resumeType"
	return None


def parse_page(value, total_pages: int | None = None) -> int:
	"""A 1-based page number from a query string value. Junk becomes 1."""
	try:
		page = int(str(value).strip())
	except (TypeError, ValueError):
		return 1
	page = min(max(page, 1), MAX_PAGE)
	if total_pages is not None:
		page = min(page, max(total_pages, 1))
	return page


def page_count(total: int, page_length: int = PAGE_LENGTH) -> int:
	return max(-(-int(total) // page_length), 1)
