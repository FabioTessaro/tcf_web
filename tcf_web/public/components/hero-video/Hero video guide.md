# `<hero-video>` Component Guide

A full-bleed, looping, muted background video that picks the right resolution for each visitor. It measures the connection speed with a small probe file, takes the screen size into account, and plays the best rendition that the connection can sustain.

- **Dependency:** jQuery (hard). Must load before the component script.
- **Isolation:** all styling lives in the Shadow DOM.
- **Behaviour:** muted, loop, no controls, no poster. Buffers behind the splash and starts playing from 0:00 when the splash fires `splash-outro-start`. Ignores `prefers-reduced-motion` by design.
- **Lifecycle:** restarts from the beginning every time it is inserted into the page (including htmx swaps) and cancels its download when removed.

---

## 1. Folder structure

```
public/components/hero-video/
├── video/
│   ├── hero-480p.mp4
│   ├── hero-720p.mp4
│   ├── hero-1080p.mp4
│   ├── hero-1440p.mp4
│   ├── hero-2160p.mp4
│   └── probe.bin            ← 512 KB of random bytes
├── hero-video.scss          ← source styles
├── hero-video.css           ← compiled styles (loaded by the JS)
├── hero-video.html          ← template (loaded by the JS)
└── hero-video.js            ← element definition

api/hero_video.py            ← manifest endpoint + configuration
```

There is no `hero-video.i18n.js` because the component has no text.

---

## 2. Installation

### 2.1 Create the probe file (once)

Random bytes cannot be compressed, so the timing reflects real bandwidth:

```bash
head -c 524288 /dev/urandom > public/components/hero-video/video/probe.bin
```

### 2.2 Add the videos

Place the five MP4 files in `video/` with the exact names above. Each must have no audio track and must be encoded with the moov atom at the start (`-movflags +faststart`), otherwise playback cannot begin until the whole file has downloaded.

Example encode for one tier:

```bash
ffmpeg -i source.mov -an -vf "scale=-2:1080" \
  -c:v libx264 -profile:v high -pix_fmt yuv420p -preset slow \
  -crf 28 -movflags +faststart hero-1080p.mp4
```

### 2.3 Include the script

In the page `<head>`, **after** jQuery:

```html
<script src="/assets/tcf_web/components/hero-video/hero-video.js"></script>
```

Put it in the `<head>` (not in a swapped fragment) so it is defined only once. htmx never re-runs head scripts.

### 2.4 Place the element

Inside a container that has `position: relative` (or any positioned ancestor) and a size:

```html
<section class="hero">
  <hero-video></hero-video>
  <div class="hero-content"><!-- your content --></div>
</section>
```

```css
.hero { position: relative; min-height: 100vh; }
.hero-content { position: relative; z-index: 1; }  /* keep content above the video */
```

The element is `position: absolute; inset: 0`, so it fills its positioned parent. Content needs a higher stacking order than the video.

---

## 3. Configuration

### 3.1 Server: `api/hero_video.py` (the one to edit when the video changes)

```python
VIDEO_DURATION_SECONDS = 120      # real duration of the video

RENDITION_SIZES_MB = {            # file sizes in MB, as shown by your file explorer
    "480p": 4,
    "720p": 7,
    "1080p": 15,
    "1440p": 27,
    "2160p": 49,
}
```

The average bitrate of each rendition is derived from `size_mb × 8 / duration`, so you never compute it by hand.

- Get the exact duration with:
  `ffprobe -v error -show_entries format=duration -of csv=p=0 hero-1080p.mp4`
- To drop a tier, delete its line from `RENDITION_SIZES_MB`.
- To add a tier, add it to `RENDITION_SIZES_MB` **and** `WIDTHS`, and add the matching file.
- After editing, restart the bench (dev mode reloads automatically).

Derived values for the current configuration (120 s):

| Tier  | Size  | Avg bitrate | Needs measured speed of (×1.5 headroom) |
|-------|-------|-------------|------------------------------------------|
| 480p  | 4 MB  | 0.28 Mbps   | 0.42 Mbps |
| 720p  | 7 MB  | 0.49 Mbps   | 0.73 Mbps |
| 1080p | 15 MB | 1.05 Mbps   | 1.57 Mbps |
| 1440p | 27 MB | 1.89 Mbps   | 2.83 Mbps |
| 2160p | 49 MB | 3.43 Mbps   | 5.14 Mbps |

### 3.2 Client: constants at the top of `hero-video.js`

| Constant | Default | Meaning |
|----------|---------|---------|
| `MANIFEST_URL` | `/api/method/tcf_web.api.hero_video.get_manifest` | Endpoint returning the renditions |
| `PROBE_TIMEOUT_MS` | `4000` | If the probe takes longer, the connection is treated as slow and the lowest rendition is used |
| `HEADROOM` | `1.5` | Measured Mbps must exceed `bitrate × HEADROOM` to select a tier. Lower it for more aggressive quality, raise it for more safety |
| `MAX_DPR` | `2` | Cap on device pixel ratio used for the resolution ceiling |
| `CACHE_KEY` | `heroVideo.mbps` | `sessionStorage` key for the cached measurement |
| `CACHE_TTL_MS` | `600000` | How long a measurement is reused (10 min) |
| `START_EVENT` | `splash-outro-start` | Event that starts playback (see section 7) |
| `START_FALLBACK_MS` | `10000` | If the start event has not arrived this long after the element connects, playback starts anyway (pages without a splash, or a missed event) |

---

## 4. How a rendition is chosen

1. The element is inserted → it loads its HTML/CSS template (fetched once, then cached) and builds its Shadow DOM.
2. It requests the manifest from the server.
3. It reuses the cached speed measurement if one exists (less than 10 minutes old). Otherwise it downloads `probe.bin` with `no-store`, times it and caches the result in `sessionStorage`.
4. It picks a rendition:
   - If `navigator.connection.saveData` is on, the lowest tier is used (the video still plays).
   - **Resolution ceiling:** needed width = `max(viewportWidth, viewportHeight × aspectRatio) × min(devicePixelRatio, 2)`. The ceiling is the smallest tier whose width covers that. The `max()` matters because the video uses `object-fit: cover`: a portrait phone scales the video until its height fills the screen.
   - **Bandwidth:** among tiers up to the ceiling, the highest one whose `bitrate × 1.5` fits the measured speed wins. If none fits, the lowest tier is used.
5. It sets the video source right away, so the file buffers while the splash still covers the page. The host shows `data-state="waiting"`.
6. When `splash-outro-start` fires, it calls `play()` and the video starts from 0:00. If the event has already fired by the time the rendition is ready, it plays immediately. If the event never arrives, a fallback timer starts playback anyway (`START_FALLBACK_MS`).

Examples:

- 1920×1080 screen, DPR 1 → ceiling 1080p. Fast connection gets 1080p, never 4K.
- 1440×900 laptop, DPR 2 → needed 3200 px → ceiling 2160p. Bandwidth decides.
- Probe timeout (very slow connection) → 480p.

The selection is made once at start. There is no mid-playback switching.

---

## 5. Events

Events are triggered with jQuery on the `<hero-video>` element and bubble through the DOM. Listen with jQuery; **native `addEventListener` will not receive them**. Handlers receive `(event, detail)`.

| Event | Detail | Fired when |
|-------|--------|------------|
| `hero-video:rendition-selected` | `{ rendition, mbps }` | A rendition has been chosen, before playback starts |
| `hero-video:playing` | `{ rendition }` | The first frame is actually playing |
| `hero-video:autoplay-blocked` | `{ rendition }` | The browser refused autoplay; playback retries on the first tap/click |
| `hero-video:error` | `{ error }` | Template, manifest, probe or playback setup failed |

```js
$(document).on('hero-video:rendition-selected', 'hero-video', function (e, detail) {
  console.log('Chosen:', detail.rendition.name, 'at', detail.mbps.toFixed(1), 'Mbps');
});

$(document).on('hero-video:playing', 'hero-video', function () {
  // e.g. fade in page content once the video is running
});
```

Delegating from `document` (as above) survives htmx swaps, because the element itself is replaced on every navigation.

### State attribute

The host carries `data-state`, so you can style from outside the component:

| Value | Meaning |
|-------|---------|
| `loading` | Template, manifest and speed measurement in progress |
| `waiting` | Rendition chosen and buffering; waiting for the start event |
| `playing` | The first frame is playing |
| `error` | Something failed |

```css
hero-video[data-state="error"] { background: #111; }
```

---

## 6. Styling

Everything is inside the Shadow DOM. Two intentional hooks are exposed:

```css
/* Background shown until the first frame appears (default: #000) */
hero-video { --hero-video-background: #0b1220; }

/* Style the inner <video> element */
hero-video::part(video) { filter: brightness(0.7); }
```

To change the internal styles, edit `hero-video.scss` **and** the compiled `hero-video.css` (the JS loads the `.css`).

---

## 7. Behaviour with navigation, splash and localization

- **htmx swaps:** every swap inserts a fresh element, which restarts the video. Removing the old page aborts the probe and cancels the video download. If two pages briefly coexist during a swap, each instance uses its own event namespace, so they do not interfere.
- **Back/forward (`hx-history-elt`):** htmx snapshots HTML, which does not include Shadow DOM content. The restored element builds its own shadow root and resets `data-state` to `loading`.
- **Abort-and-adopt navigation:** an abandoned navigation never inserts the element, so nothing needs cleanup.
- **Splash:** the video is loaded behind the splash and starts playing from 0:00 when the splash fires `splash-outro-start` (the moment the video is uncovered). The component listens for the event in two ways, so it works whether the splash triggers it with jQuery (`$(...).trigger('splash-outro-start')`) or dispatches a native `CustomEvent`, bubbling or not. If the event never arrives (a page without a splash, or the event fired before the element existed), playback starts anyway after `START_FALLBACK_MS` (default 10 s). Change `START_EVENT` in `hero-video.js` if the event is ever renamed.
- **Localization:** the component contains no text and no `data-i18n` attributes, so i18next has nothing to translate and the typography SCSS does not reach it.

---

## 8. Testing

1. **Throttle the network.** In DevTools → Network, choose *Fast 4G* / *Slow 4G* and reload. Clear the cache first so the measurement is redone:
   ```js
   sessionStorage.removeItem('heroVideo.mbps');
   ```
2. **Simulate a speed without throttling.** Seed the cache with a fake measurement, then reload:
   ```js
   sessionStorage.setItem('heroVideo.mbps', JSON.stringify({ mbps: 3, at: Date.now() }));
   ```
3. **Check the choice.** Add the `rendition-selected` listener from section 5 and watch the console. The Network tab also shows which `hero-*.mp4` was requested.
4. **Check navigation.** Navigate away and back: the video should restart from 0:00, and the Network tab should show the previous download cancelled.
5. **Check the manifest.** Open `/api/method/tcf_web.api.hero_video.get_manifest` in the browser; you should see the renditions with `size_mb` and `bitrate_kbps`.
6. **Check the start gate.** While the splash covers the page, the element should show `data-state="waiting"` and the Network tab should show the video downloading. It should switch to `playing` when the splash fires `splash-outro-starts`. To test without the splash, run `$(document).trigger('splash-outro-starts')` in the console.

---

## 9. Troubleshooting

| Symptom | Likely cause and fix |
|---------|----------------------|
| Black area, nothing plays | Check `data-state` on the element and the console (`hero-video:` warnings). Usually a 404 on the manifest, a video file, or `probe.bin`. |
| `data-state="error"` | The `hero-video:error` detail holds the exception. Common: wrong `MANIFEST_URL` (app name), missing `probe.bin`, or the file is not under `public/`. |
| Always picks the lowest tier | A cached slow measurement (clear `heroVideo.mbps`), a probe slower than 4 s, or the browser has Data Saver on. Check the `mbps` in the selected event. |
| Never picks 2160p | The viewport ceiling is lower (a 1080p screen at DPR 1 caps at 1080p), or the measured speed is below the 5.14 Mbps threshold. |
| Playback starts late, or only after the full download | The MP4 was not encoded with `-movflags +faststart`. Re-encode. |
| Does not autoplay on iPhone | Low Power Mode blocks autoplay. The component fires `hero-video:autoplay-blocked` and retries on the first tap. |
| Stays on `waiting`, then starts about 10 s late | The start event was not received. Check `START_EVENT` matches the splash's event name, and that the splash fires it after the element exists. Test with `$(document).trigger('splash-outro-start')`. |
| New sizes/durations have no effect | Python changes need a bench restart. Also check the manifest URL output (section 8, step 5). |
| New files return 404 | Files under `public/` must be reachable at `/assets/tcf_web/components/hero-video/...`. Check the assets symlink or run `bench build`. |
| Video appears blurry | The ceiling or bandwidth selected a lower tier. Raise quality by lowering `HEADROOM`, or check the viewport DPR cap (`MAX_DPR`). |
| Click-through does not work | The host sets `pointer-events: none`; make sure no other overlay is intercepting clicks. |

---

## 10. Limitations

- The tier is chosen once per page load; there is no adaptive switching during playback.
- The probe is a single 512 KB download, which includes latency and TCP slow start, so it tends to underestimate very fast connections. With the current tier thresholds (max about 5 Mbps) this does not matter in practice.
- Events are jQuery-only (see section 5).
- Playback starts on the first `splash-outro-start` received after the element connects. An event fired before that is missed, and the fallback timer covers it with a delay.
- The video must be 16:9, or `aspect_ratio` in the Python file must be updated to match.