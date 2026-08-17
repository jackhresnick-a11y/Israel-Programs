#!/usr/bin/env python3
"""Local-only video-download companion to transcribe.py, for israel-programs.

Downloads each PUBLISHED program's own video (Program.videoUrl -- YouTube, Vimeo,
Facebook, Instagram, or TikTok) to videos/<lang>/<slug>.<ext>, using yt-dlp, so
transcribe.py's existing exact-slug matching picks the files up with ZERO changes to
that script. This exists purely to remove "download the video by hand" from the
pipeline PR #28 shipped -- everything downstream (transcribe.py, the manifest, the
/admin/transcripts upload+preview+overwrite flow) is untouched.

This does NOT run on Vercel and never will: Instagram/Facebook block requests from
datacenter IPs and require a real logged-in session's cookies, which only makes sense
from an operator's own machine. See the feasibility writeup that preceded this script
for the full reasoning.

--lang is REQUIRED, never inferred, for the same reason transcribe.py forces language
per folder rather than auto-detecting: guessing a program's video language from
websiteLanguage would be exactly that kind of guess. slugs.json prints each program's
websiteLanguage as a hint only -- run this once per language, same two-pass shape
transcribe.py already expects (videos/en/, videos/he/).

Usage (from this directory, with the venv active):
    python fetch-videos.py --lang en
    python fetch-videos.py --lang en --only aish-hatorah
    python fetch-videos.py --lang en --force aish-hatorah
    python fetch-videos.py --lang en --cookies-from-browser chrome
    python fetch-videos.py --lang en --dry-run

See README.md for full setup instructions.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

STATE_FILENAME = "fetch-state.json"

# Matches transcribe.py's VIDEO_EXTENSIONS -- forcing this merge format keeps every
# downloaded file's extension predictable regardless of what a given provider serves,
# so transcribe.py's discover_files() always recognizes it.
MERGE_FORMAT = "mp4"


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def load_slugs(slugs_path: Path) -> list[dict]:
    """slugs.json is [{id, slug, name, provider, watchUrl, websiteLanguage}, ...],
    exported by /admin/transcripts. provider/watchUrl are None for a program with no
    videoUrl, or one that didn't parse against any of the five known providers --
    those rows are reported as unmatched, never guessed at."""
    if not slugs_path.exists():
        print(f"ERROR: {slugs_path} not found. Download it from /admin/transcripts first.")
        sys.exit(1)
    return json.loads(slugs_path.read_text(encoding="utf-8"))


def load_state(videos_dir: Path) -> dict:
    state_path = videos_dir / STATE_FILENAME
    if not state_path.exists():
        return {"files": {}}
    return json.loads(state_path.read_text(encoding="utf-8"))


def save_state(videos_dir: Path, state: dict) -> None:
    videos_dir.mkdir(parents=True, exist_ok=True)
    (videos_dir / STATE_FILENAME).write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")


def download_one(watch_url: str, dest_dir: Path, slug: str, cookies_from_browser: str | None) -> Path:
    import yt_dlp

    dest_dir.mkdir(parents=True, exist_ok=True)
    ydl_opts: dict = {
        "outtmpl": str(dest_dir / f"{slug}.%(ext)s"),
        "merge_output_format": MERGE_FORMAT,
        "quiet": False,
        "no_warnings": False,
        # A program's own overview video is a single asset, not a playlist entry --
        # never follow into a channel/profile if the URL happens to resolve that way.
        "noplaylist": True,
    }
    if cookies_from_browser:
        ydl_opts["cookiesfrombrowser"] = (cookies_from_browser,)

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([watch_url])

    produced = dest_dir / f"{slug}.{MERGE_FORMAT}"
    if not produced.exists():
        # Some sources (e.g. a source that's already a single progressive stream with
        # no audio/video split) never go through the merge step, so yt-dlp may have
        # kept its native extension instead of MERGE_FORMAT -- find whatever it wrote.
        matches = sorted(dest_dir.glob(f"{slug}.*"))
        matches = [m for m in matches if m.name != f"{slug}.{MERGE_FORMAT}.part"]
        if not matches:
            raise RuntimeError(f"yt-dlp reported success but no {slug}.* file was found in {dest_dir}")
        produced = matches[0]
    return produced


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--lang", required=True, choices=["en", "he"], help="Language folder to download into (required -- never inferred)")
    parser.add_argument("--videos-dir", default="videos", help="Folder to write en/ and he/ subfolders into (default: videos, same as transcribe.py)")
    parser.add_argument("--slugs", default="slugs.json", help="Path to slugs.json exported from /admin/transcripts (default: slugs.json)")
    parser.add_argument("--only", default=None, help="Only process this exact slug")
    parser.add_argument("--force", default=None, help="Re-download this exact slug even if already downloaded")
    parser.add_argument("--cookies-from-browser", default=None, metavar="BROWSER", help="Passed to yt-dlp as cookiesfrombrowser -- needed for Instagram/Facebook, not for YouTube/Vimeo (e.g. chrome, firefox, edge)")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be downloaded without running yt-dlp")
    args = parser.parse_args()

    videos_dir = Path(args.videos_dir)
    dest_dir = videos_dir / args.lang

    rows = load_slugs(Path(args.slugs))
    state = load_state(videos_dir)

    to_process: list[dict] = []
    unmatched: list[dict] = []

    for row in rows:
        slug = row["slug"]
        if args.only and slug != args.only:
            continue
        if not row.get("provider") or not row.get("watchUrl"):
            unmatched.append({"slug": slug, "name": row.get("name", slug), "reason": "no parseable videoUrl (provider is null)"})
            continue
        to_process.append(row)

    if unmatched:
        print(f"No video to fetch ({len(unmatched)}):")
        for u in unmatched:
            print(f"  - {u['slug']} ({u['name']}): {u['reason']}")
        print()

    if not to_process:
        print("Nothing to download.")
        return

    print(f"Language: {args.lang}  ->  {dest_dir}/")
    if args.cookies_from_browser:
        print(f"Using cookies from: {args.cookies_from_browser}")
    print()

    if args.dry_run:
        print(f"Dry run: {len(to_process)} file(s) would be downloaded.")
        for row in to_process:
            hint = f" (websiteLanguage: {row['websiteLanguage']})" if row.get("websiteLanguage") else ""
            print(f"  {row['slug']} <- {row['provider']}: {row['watchUrl']}{hint}")
        return

    done_count = 0
    skip_count = 0
    fail_count = 0
    total = len(to_process)

    for i, row in enumerate(to_process, start=1):
        slug = row["slug"]
        watch_url = row["watchUrl"]
        provider = row["provider"]
        force_this = args.force == slug

        print(f"[{i}/{total}] {slug} ({provider})")

        existing = state["files"].get(slug)
        if (
            existing
            and not force_this
            and existing.get("status") == "completed"
            and existing.get("watchUrl") == watch_url
            and existing.get("language") == args.lang
            and Path(existing.get("path", "")).exists()
        ):
            print(f"  skip (already downloaded: {existing['path']})")
            skip_count += 1
            continue

        try:
            produced = download_one(watch_url, dest_dir, slug, args.cookies_from_browser)
            state["files"][slug] = {
                "slug": slug,
                "watchUrl": watch_url,
                "provider": provider,
                "language": args.lang,
                "path": str(produced),
                "status": "completed",
                "error": None,
                "downloaded_at": now_iso(),
            }
            save_state(videos_dir, state)
            done_count += 1
            print(f"  done: {produced.name}")
        except Exception as e:  # noqa: BLE001 -- one video's failure must never stop the batch
            state["files"][slug] = {
                "slug": slug,
                "watchUrl": watch_url,
                "provider": provider,
                "language": args.lang,
                "path": None,
                "status": "failed",
                "error": str(e),
                "downloaded_at": now_iso(),
            }
            save_state(videos_dir, state)
            fail_count += 1
            print(f"  FAILED: {e}")
            if provider in ("instagram", "facebook") and not args.cookies_from_browser:
                print("    (Instagram/Facebook usually need --cookies-from-browser -- see README.md)")

    print()
    print(f"Summary: {done_count} downloaded, {skip_count} skipped, {fail_count} failed, {len(unmatched)} with no video.")
    print("Next: python transcribe.py")


if __name__ == "__main__":
    main()
