import frappe

# ---- Configuration: edit when the video changes -----------------------------
# Real duration of the video in seconds. Get it exactly with:
#   ffprobe -v error -show_entries format=duration -of csv=p=0 hero-1080p.mp4
VIDEO_DURATION_SECONDS = 120

ASPECT_RATIO = 16 / 9
PROBE_BYTES = 524288

# File sizes in MB, as shown by your file explorer.
# Remove a line to drop a tier; add a name to WIDTHS below to add one.
RENDITION_SIZES_MB = {
	"480p": 4,
	"720p": 7,
	"1080p": 15,
	"1440p": 27,
	"2160p": 49,
}
# -----------------------------------------------------------------------------

BASE = "/assets/tcf_web/components/hero-video/video"

# Pixel width of each tier (used to match the viewport)
WIDTHS = {
	"480p": 854,
	"720p": 1280,
	"1080p": 1920,
	"1440p": 2560,
	"2160p": 3840,
}


def _build_renditions():
	renditions = []
	for name, size_mb in RENDITION_SIZES_MB.items():
		bitrate_kbps = size_mb * 1024 * 1024 * 8 / VIDEO_DURATION_SECONDS / 1000
		renditions.append(
			{
				"name": name,
				"width": WIDTHS[name],
				"size_mb": size_mb,
				"bitrate_kbps": round(bitrate_kbps),
				"url": f"{BASE}/hero-{name}.mp4",
			}
		)
	return renditions


@frappe.whitelist(allow_guest=True, methods=["GET"])
def get_manifest():
	return {
		"aspect_ratio": ASPECT_RATIO,
		"probe": {"url": f"{BASE}/probe.bin", "bytes": PROBE_BYTES},
		"renditions": _build_renditions(),
	}
