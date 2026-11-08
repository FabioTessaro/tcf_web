"""Which account buttons the website navbar shows to the current user.

The server decides, the navbar only draws the list (see public/components/account-buttons). An entry that is
not returned here does not exist for the browser, so access rules live in one place.

The navbar shows ONE button: the entry with the lowest `order` wins (Desk 10 beats HR 20, so a user with both
sees Desk; HR-only users, or users outside the network once the desk is filtered, see HR).

Other apps add entries with the hook `tcf_web_account_entries`: a list of dotted paths to functions
`fn(user) -> list[dict]` returning entries (see `normalise`). tcf_hr contributes the HR entry.
"""

import frappe

# Label keys belong to the "account-buttons" i18n namespace of the website
LOGIN = {
	"key": "login",
	"label": "account-buttons:entries.login",
	"icon": "account_circle",
	"boost": True,
	"order": 0,
}
DESK = {"key": "desk", "href": "/desk", "label": "account-buttons:entries.desk", "icon": "apps", "order": 10}
# Fallback for a logged-in user with nothing else to open: Frappe's /me page (has the logout)
ACCOUNT = {
	"key": "account",
	"href": "/me",
	"label": "account-buttons:entries.account",
	"icon": "account_circle",
	"order": 90,
}


def is_safe_href(href) -> bool:
	"""Same-origin relative path only."""
	return isinstance(href, str) and href.startswith("/") and not href.startswith("//")


def normalise(entry) -> dict | None:
	"""Return a clean entry, or None if it is invalid. Links to other apps are full page loads (boost False)."""
	if not isinstance(entry, dict):
		return None
	key, label, href = entry.get("key"), entry.get("label"), entry.get("href")
	if not isinstance(key, str) or not isinstance(label, str):
		return None
	if key != "login" and not is_safe_href(href):
		return None
	cleaned = {
		"key": key,
		"label": label,
		"icon": entry.get("icon") if isinstance(entry.get("icon"), str) else "",
		"boost": bool(entry.get("boost", False)),
		"order": entry.get("order") if isinstance(entry.get("order"), int) else 50,
	}
	if href is not None:
		cleaned["href"] = href
	return cleaned


def build_entries(*, is_guest: bool, desk_user: bool, provided: list) -> list[dict]:
	"""Pure: assemble, validate, de-duplicate (first wins), order, and keep the winning entry only."""
	if is_guest:
		return [normalise(LOGIN)]

	candidates = ([DESK] if desk_user else []) + list(provided)
	entries, seen = [], set()
	for candidate in candidates:
		entry = normalise(candidate)
		if entry and entry["key"] not in seen:
			seen.add(entry["key"])
			entries.append(entry)

	if not entries:
		entries = [normalise(ACCOUNT)]
	# One button only: the highest priority (lowest order) entry
	return sorted(entries, key=lambda e: e["order"])[:1]


def can_open_desk(user: str) -> bool:
	"""Whether the Desk button is offered. Today: any user with desk access (System User).

	The network and role filters for the desk are planned in tcf_core; they will narrow this one place.
	"""
	return frappe.db.get_value("User", user, "user_type") == "System User"


def get_entries(user: str) -> list[dict]:
	is_guest = user == "Guest"
	provided = []
	if not is_guest:
		for path in frappe.get_hooks("tcf_web_account_entries"):
			try:
				provided.extend(frappe.get_attr(path)(user) or [])
			except Exception:
				frappe.log_error(title=f"tcf_web account entries provider failed: {path}")
	return build_entries(is_guest=is_guest, desk_user=not is_guest and can_open_desk(user), provided=provided)
