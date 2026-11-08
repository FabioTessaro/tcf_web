import unittest

from tcf_web.api import job_validation as v

PDF = b"%PDF-1.7 rest"
DOCX = b"PK\x03\x04 rest"
DOC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1 rest"


def valid_data(**overrides):
	data = {
		"opening": "HR-OPN-2026-0001",
		"applicant_name": "Jane Smith",
		"email_id": "Jane.Smith@Example.com",
		"phone_number": "+39 02 1234 5678",
		"cover_letter": "Hello",
	}
	data.update(overrides)
	return data


class TestValidateApplication(unittest.TestCase):
	def test_valid_application_is_cleaned_and_lowercases_email(self):
		clean, errors = v.validate_application(valid_data())
		self.assertEqual(errors, {})
		self.assertEqual(clean["email_id"], "jane.smith@example.com")

	def test_required_fields(self):
		_, errors = v.validate_application(valid_data(applicant_name="  ", email_id="", opening=""))
		self.assertEqual(
			errors,
			{
				"applicant_name": "errors.required",
				"email_id": "errors.required",
				"opening": "errors.invalidOpening",
			},
		)

	def test_invalid_emails(self):
		for email in ["nope", "a@b", "a b@c.com", "a@b.c", "<x>@y.com", "a@b.com,c@d.com"]:
			with self.subTest(email=email):
				_, errors = v.validate_application(valid_data(email_id=email))
				self.assertEqual(errors, {"email_id": "errors.invalidEmail"})

	def test_invalid_phone(self):
		for phone in ["abc", "12", "+39<script>", "1" * 40]:
			with self.subTest(phone=phone):
				_, errors = v.validate_application(valid_data(phone_number=phone))
				self.assertEqual(errors, {"phone_number": "errors.invalidPhone"})

	def test_phone_is_optional(self):
		_, errors = v.validate_application(valid_data(phone_number=""))
		self.assertEqual(errors, {})

	def test_length_limits(self):
		_, errors = v.validate_application(
			valid_data(applicant_name="x" * (v.MAX_NAME + 1), cover_letter="y" * (v.MAX_COVER_LETTER + 1))
		)
		self.assertEqual(errors, {"applicant_name": "errors.tooLong", "cover_letter": "errors.tooLong"})

	def test_missing_input_is_handled(self):
		_, errors = v.validate_application(None)
		self.assertIn("applicant_name", errors)
		self.assertIn("email_id", errors)


class TestCleanText(unittest.TestCase):
	def test_clean_text_strips_tags_and_control_characters(self):
		self.assertEqual(v.clean_text("<b>Jane</b>\x00 Smith"), "Jane Smith")
		self.assertEqual(v.clean_text(None), "")
		self.assertEqual(v.clean_text("a\n\n\n\nb", multiline=True), "a\n\nb")


class TestCheckResume(unittest.TestCase):
	def test_resume_accepted(self):
		docx_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
		for name, ctype, head in [
			("cv.pdf", "application/pdf", PDF),
			("cv.PDF", "application/pdf; charset=binary", PDF),
			("cv.docx", docx_type, DOCX),
			("cv.doc", "application/msword", DOC),
			("cv.pdf", "application/octet-stream", PDF),
			("cv.pdf", "", PDF),
		]:
			with self.subTest(name=name, ctype=ctype):
				self.assertIsNone(v.check_resume(name, ctype, head, 1000))

	def test_resume_rejected(self):
		for name, ctype, head, size, error in [
			("cv.exe", "application/pdf", PDF, 1000, "errors.resumeType"),
			("cv", "application/pdf", PDF, 1000, "errors.resumeType"),
			("cv.pdf.exe", "application/pdf", PDF, 1000, "errors.resumeType"),
			("cv.pdf", "text/html", PDF, 1000, "errors.resumeType"),
			("cv.pdf", "application/pdf", b"MZ\x90\x00", 1000, "errors.resumeType"),
			("cv.docx", "application/pdf", DOCX, 1000, "errors.resumeType"),
			("cv.pdf", "application/pdf", PDF, 0, "errors.resumeEmpty"),
			("cv.pdf", "application/pdf", PDF, v.MAX_RESUME_BYTES + 1, "errors.resumeTooLarge"),
			(None, None, b"", 5, "errors.resumeType"),
		]:
			with self.subTest(name=name, ctype=ctype, size=size):
				self.assertEqual(v.check_resume(name, ctype, head, size), error)

	def test_resume_at_the_size_limit_is_accepted(self):
		self.assertIsNone(v.check_resume("cv.pdf", "application/pdf", PDF, v.MAX_RESUME_BYTES))


class TestHelpers(unittest.TestCase):
	def test_safe_filename(self):
		self.assertEqual(v.safe_filename("../../etc/passwd.pdf"), "passwd.pdf")
		self.assertEqual(v.safe_filename("C:\\docs\\My CV (final).PDF"), "My_CV_final.pdf")
		self.assertEqual(v.safe_filename(".pdf"), "resume.pdf")
		self.assertLessEqual(len(v.safe_filename("a" * 500 + ".docx")), v.MAX_FILENAME)

	def test_parse_page(self):
		self.assertEqual(v.parse_page("3"), 3)
		self.assertEqual(v.parse_page("0"), 1)
		self.assertEqual(v.parse_page("-5"), 1)
		self.assertEqual(v.parse_page("abc"), 1)
		self.assertEqual(v.parse_page(None), 1)
		self.assertEqual(v.parse_page("999999999"), v.MAX_PAGE)
		self.assertEqual(v.parse_page("9", total_pages=4), 4)

	def test_page_count(self):
		self.assertEqual(v.page_count(0), 1)
		self.assertEqual(v.page_count(12), 1)
		self.assertEqual(v.page_count(13), 2)
