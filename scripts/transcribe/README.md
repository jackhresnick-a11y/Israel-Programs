# Local transcription pipeline (Windows)

Turns your program videos into `.txt` transcripts on your own machine, then you
upload the `.txt` files at `/admin/transcripts`. **Whisper never runs on the site's
servers, and no video file is ever uploaded anywhere** — only the text you upload
at the end crosses to the site. `fetch-videos.py` (below) *downloads* each
program's own video from wherever it's linked (YouTube, Vimeo, Facebook, Instagram,
or TikTok — same five platforms the site's video embeds support) straight to this
machine; that doesn't change the "nothing is ever uploaded" guarantee, since
nothing goes the other direction.

This can only run locally, not on Vercel — Instagram and Facebook block requests
from datacenter IPs and require a real logged-in browser session's cookies, which
only makes sense from your own machine anyway.

The filename of every video must be the **exact** program slug — `aish-hatorah.mp4`
for the program whose slug is `aish-hatorah`. No spaces, no different casing, no
extra words. A file whose name doesn't exactly match a slug is skipped and listed
as unmatched — it is never guessed at. `fetch-videos.py` already names files this
way automatically; this only matters by hand if you're placing a video manually
(step 2 below).

## One-time setup

### 1. Install Python 3.11

Download from https://www.python.org/downloads/ (3.11.x specifically — the
`ctranslate2` package faster-whisper depends on doesn't always have wheels for the
very latest Python version yet). During install, check **"Add python.exe to PATH"**.

Verify:
```
py -3.11 --version
```

### 2. Install FFmpeg

```
winget install Gyan.FFmpeg
```
Close and reopen your terminal afterward so PATH updates take effect, then verify:
```
ffmpeg -version
```
If `winget` isn't available, download a build from https://www.gyan.dev/ffmpeg/builds/
and add its `bin` folder to your PATH manually.

### 3. Create a virtual environment and install dependencies

From this folder (`scripts/transcribe/`):
```
py -3.11 -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```
You'll need to run `.venv\Scripts\activate` again every time you open a new
terminal to work on this. (`yt-dlp` — used by `fetch-videos.py`, step 2 below —
installs from the same `requirements.txt`, no separate install needed. It reuses
the FFmpeg you installed in step 2 above, the same way `winget install
Gyan.FFmpeg` step already served `transcribe.py`.)

## Every time you have new videos to transcribe

### 1. Download the slug list

Go to `/admin/transcripts` (signed in as an admin) and click **"Download slug
list"**. Save the file as `slugs.json` directly in this folder
(`scripts/transcribe/slugs.json`). Besides `slug`/`name`, each row now also
carries `provider`/`watchUrl` (derived server-side from that program's own
`videoUrl`, or `null` if it has none / isn't one of the five supported platforms)
and `websiteLanguage` (a hint only — see step 2).

### 2. Fetch videos automatically (optional)

For any program with a parseable `videoUrl`, this downloads it for you instead of
you finding and saving the file by hand:

```
python fetch-videos.py --lang en
```

`--lang en|he` is **required, never inferred** — same rule as `transcribe.py`'s
folder-forced language below. `slugs.json` prints each program's
`websiteLanguage` next to it so you can decide which pass a program belongs in;
run the command twice (once per language) rather than letting the script guess.

**Instagram and Facebook need your own login.** Without it you'll get a
"login required" / rate-limit error — pass your logged-in browser's cookies:

```
python fetch-videos.py --lang en --cookies-from-browser chrome
```

(`chrome`, `firefox`, `edge`, etc. — whichever browser you're logged into
Instagram/Facebook with. YouTube and Vimeo don't need this.)

Other flags, same shape as `transcribe.py`'s:
- `--only <slug>` — only fetch one specific program.
- `--force <slug>` — re-download one even though it already succeeded.
- `--dry-run` — show what would be downloaded without running yt-dlp.

This writes `videos/<lang>/<slug>.mp4` (see step 3) and its own
`videos/fetch-state.json` so re-running skips anything already downloaded. A
program with no `videoUrl`, or one yt-dlp/Instagram/Facebook refuses even with
cookies (private post, deleted video, etc.), is reported and skipped — it never
blocks the rest of the batch, and never blocks placing that one video manually
(step 3) instead.

### 3. Lay out your video files

```
scripts/transcribe/
  videos/
    en/
      some-english-program.mp4
      another-one.mp4
    he/
      some-hebrew-program.mp4
  slugs.json
```

If you ran `fetch-videos.py` above, this is already done for everything it
found — this step is only for filling in the rest by hand (a program with no
`videoUrl`, one on a platform it doesn't cover, or one you'd rather source
yourself).

Everything under `videos/en/` is transcribed as **English**; everything under
`videos/he/` is transcribed as **Hebrew**. The language is forced from the folder
— it is never auto-detected, so put each file in the right folder. A file dropped
directly in `videos/` (not inside `en/` or `he/`) is reported as unmatched and
skipped.

Each filename (minus its extension) must be byte-for-byte identical to a slug in
`slugs.json`. Check the slug on `/admin/transcripts` or `/admin/programs` if
you're not sure of the exact spelling.

### 4. Run it

```
python transcribe.py
```

This will:
- load `slugs.json`,
- find every video under `videos/en/` and `videos/he/`,
- skip anything that doesn't exactly match a slug (printed as "Unmatched"),
- transcribe everything else with Whisper (`large-v3`, int8, on CPU),
- write `out/<slug>.txt` for each one,
- write `out/manifest.json` summarizing filenames, slugs, language, duration, word
  count, and any quality warnings,
- write `out/state.json` so a second run **skips anything already done** and only
  retries files that previously failed.

**Useful flags:**
- `--only <slug>` — only process one specific file.
- `--force <slug>` — re-run one file even though it already succeeded (e.g. you
  fixed a bad source file).
- `--dry-run` — show what would be processed without actually running Whisper.

### 5. Check the manifest for warnings

Open `out/manifest.json`. Two warning types can appear per file, and neither one
blocks the `.txt` from being written — they're a flag to go listen to that part of
the video yourself before uploading:

- **`repeated_line`** — the same line came out 3+ times. Whisper does this on
  silence, background music, or a long stretch of noise.
- **`low_word_rate`** — far fewer words than expected for the video's length,
  another silence/hallucination symptom. (Tunable via `MIN_WORDS_PER_MINUTE` near
  the top of `transcribe.py` if you find it too strict or too loose for your
  content.)

### 6. Upload the transcripts

Go to `/admin/transcripts`, use the multi-file upload, and select every `.txt`
file in `out/`. You'll get a preview (which program each matches, word count,
new vs. overwrite) before anything is saved — nothing is written until you
confirm.

## Performance expectations

`large-v3` on CPU with `int8` is slow — roughly **0.3–0.6x realtime** on a typical
laptop (a 30-minute video takes ~50–100 minutes). Run it overnight for a large
batch. If your machine has an NVIDIA GPU and you want it faster, install a CUDA
build of `ctranslate2`/PyTorch separately and pass `device="cuda"` — this isn't
set up by default since it requires matching CUDA/cuDNN versions to your specific
GPU.

## Offline / no re-download

The first time you run this, `faster-whisper` downloads the `large-v3` model
weights (a few GB) from Hugging Face and caches them locally (typically under
`%USERPROFILE%\.cache\huggingface`). Every run after that is fully offline. To
force offline mode explicitly (fails loudly instead of trying to reach the
network if the cache is missing something):
```
set HF_HUB_OFFLINE=1
python transcribe.py
```
You can also point `--model` at a local folder containing a pre-downloaded
CTranslate2 model instead of a Hugging Face model name.

## Troubleshooting

- **`ffmpeg` not found** — reopen your terminal after installing (PATH changes
  don't apply to already-open windows), or verify with `ffmpeg -version`.
- **A file doesn't show up / is "unmatched"** — the filename (minus extension)
  must exactly match a slug in `slugs.json`. Check for extra spaces, different
  casing, or a stale `slugs.json` (re-download it if programs changed recently).
- **Re-running does nothing** — that's expected if everything already succeeded;
  `state.json` tracks completed files by content hash. Use `--force <slug>` to
  redo one on purpose, or delete `state.json` to redo everything.
- **`fetch-videos.py` fails with "login required" / rate-limit error** — this is
  Instagram or Facebook blocking the request; pass `--cookies-from-browser
  <browser>` (see step 2 above). YouTube/Vimeo should never need this.
- **`fetch-videos.py` re-downloads nothing on a second run** — same idea as
  `transcribe.py`'s `state.json`, but its own file: `videos/fetch-state.json`
  tracks completed downloads by slug + source URL. Use `--force <slug>` to redo
  one, or delete `videos/fetch-state.json` to redo everything.
- **A program's `provider` is `null` in `slugs.json`** — that program either has
  no `videoUrl` set, or its `videoUrl` isn't one of the five supported platforms
  (YouTube, Vimeo, Facebook, Instagram, TikTok). `fetch-videos.py` reports it and
  skips it; place that video manually (step 3) if you have it some other way.
