import unittest

from tcf_web.entries import build_entries, is_safe_href, normalise

HR = {"key": "hr", "href": "/hrms", "label": "account-buttons:entries.hr", "icon": "badge", "order": 20}


class TestBuildEntries(unittest.TestCase):
	def keys(self, **kwargs):
		return [e["key"] for e in build_entries(**kwargs)]

	def test_guest_gets_only_login(self):
		self.assertEqual(self.keys(is_guest=True, desk_user=True, provided=[HR]), ["login"])

	def test_desk_wins_over_hr(self):
		self.assertEqual(self.keys(is_guest=False, desk_user=True, provided=[HR]), ["desk"])

	def test_hr_only_user_has_no_desk(self):
		self.assertEqual(self.keys(is_guest=False, desk_user=False, provided=[HR]), ["hr"])

	def test_user_with_nothing_falls_back_to_account(self):
		entries = build_entries(is_guest=False, desk_user=False, provided=[])
		self.assertEqual([e["key"] for e in entries], ["account"])
		self.assertEqual(entries[0]["href"], "/me")

	def test_only_one_entry_is_ever_returned(self):
		many = [HR, dict(HR, key="x", href="/x", order=30)]
		self.assertEqual(len(build_entries(is_guest=False, desk_user=True, provided=many)), 1)

	def test_duplicates_first_wins_and_lowest_order_wins(self):
		late = dict(HR, href="/other")  # same key as HR: dropped
		entries = build_entries(is_guest=False, desk_user=False, provided=[HR, late])
		self.assertEqual(entries[0]["href"], "/hrms")
		first = build_entries(is_guest=False, desk_user=True, provided=[dict(HR, order=1)])
		self.assertEqual([e["key"] for e in first], ["hr"])

	def test_invalid_provided_entries_are_dropped(self):
		bad = [
			None,
			"x",
			{"key": "x", "label": "l", "href": "https://evil.example"},
			{"key": "y", "label": "l", "href": "//evil.example"},
			{"key": "z", "label": "l"},
			{"key": 1, "label": "l", "href": "/ok"},
		]
		self.assertEqual(self.keys(is_guest=False, desk_user=False, provided=bad), ["account"])

	def test_normalise_defaults_to_full_page_load(self):
		entry = normalise({"key": "k", "label": "l", "href": "/p"})
		self.assertFalse(entry["boost"])
		self.assertEqual(entry["order"], 50)

	def test_is_safe_href(self):
		self.assertTrue(is_safe_href("/hrms"))
		for bad in ("hrms", "//x", "http://x", None, 5):
			self.assertFalse(is_safe_href(bad))
