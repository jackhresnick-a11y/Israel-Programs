# Local transcription pipeline (Windows)

Turns your program videos into `.txt` transcripts on your own machine, then you
upload the `.txt` files at `/admin/transcripts`. **Whisper never runs on the site's
servers, and no video file is ever uploaded anywhere** — only the text you upload
at the end crosses to the site.

The filename of every video must be the **exact** program slug — `aish-hatorah.mp4`
for the program whose slug is `aish-hatorah`. No spaces, no different casing, no
extra words. A file whose name doesn't exactly match a slug is skipped and listed
as unmatched — it is never guessed at.

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
terminal to work on this.

## Every time you have new videos to transcribe

### 1. Download the slug list

Go to `/admin/transcripts` (signed in as an admin) and click **"Download slug
list"**. Save the file as `slugs.json` directly in this folder
(`scripts/transcribe/slugs.json`).

### 2. Lay out your video files

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

Everything under `videos/en/` is transcribed as **English**; everything under
`videos/he/` is transcribed as **Hebrew**. The language is forced from the folder
— it is never auto-detected, so put each file in the right folder. A file dropped
directly in `videos/` (not inside `en/` or `he/`) is reported as unmatched and
skipped.

Each filename (minus its extension) must be byte-for-byte identical to a slug in
`slugs.json`. Check the slug on `/admin/transcripts` or `/admin/programs` if
you're not sure of the exact spelling.

### 3. Run it

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

### 4. Check the manifest for warnings

Open `out/manifest.json`. Two warning types can appear per file, and neither one
blocks the `.txt` from being written — they're a flag to go listen to that part of
the video yourself before uploading:

- **`repeated_line`** — the same line came out 3+ times. Whisper does this on
  silence, background music, or a long stretch of noise.
- **`low_word_rate`** — far fewer words than expected for the video's length,
  another silence/hallucination symptom. (Tunable via `MIN_WORDS_PER_MINUTE` near
  the top of `transcribe.py` if you find it too strict or too loose for your
  content.)

### 5. Upload the transcripts

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
