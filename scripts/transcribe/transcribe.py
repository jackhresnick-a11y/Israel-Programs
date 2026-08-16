#!/usr/bin/env python3
"""Local-only Whisper transcription pipeline for israel-programs.

Turns videos/en/<slug>.mp4 and videos/he/<slug>.mp4 into out/<slug>.txt, using
faster-whisper with the language FORCED per folder (never auto-detected) and the
filename matched to a program slug EXACTLY (no fuzzy matching, ever -- a misnamed
file is reported as unmatched and skipped, never guessed).

This script makes no network call of its own -- it only reads slugs.json (exported
from /admin/transcripts) and local video files. The one exception is faster-whisper
downloading model weights from HuggingFace on first run; see README.md for how to
avoid that too.

Usage (from this directory, with the venv active):
    python transcribe.py
    python transcribe.py --only aish-hatorah
    python transcribe.py --force aish-hatorah
    python transcribe.py --dry-run

See README.md for full setup instructions.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

# Folder name -> forced Whisper language code. A file is only ever transcribed with
# one of these -- there is no third "detect" path.
LANGUAGE_BY_FOLDER = {"en": "en", "he": "he"}

MODEL_NAME_DEFAULT = "large-v3"
COMPUTE_TYPE = "int8"
DEVICE = "cpu"

VIDEO_EXTENSIONS = {".mp4", ".mov", ".m4a", ".mkv", ".webm"}

# Whisper hallucinates on silence/noise -- these are advisory floors, not hard
# failures. Hebrew is more morphologically dense than English (each token tends to
# carry more meaning), so its floor is lower. Tune here if real transcripts trip
# false positives.
MIN_WORDS_PER_MINUTE = {"en": 60, "he": 40}
REPEATED_LINE_THRESHOLD = 3

STATE_FILENAME = "state.json"
MANIFEST_FILENAME = "manifest.json"


@dataclass
class FileResult:
    filename: str
    slug: str
    language: str
    sha256: str
    duration_seconds: float = 0.0
    word_count: int = 0
    warnings: list[str] = field(default_factory=list)
    status: str = "completed"  # or "failed"
    error: str | None = None
    attempts: int = 1
    completed_at: str | None = None
    last_attempt_at: str | None = None


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def load_slugs(slugs_path: Path) -> dict[str, str]:
    """slugs.json is [{id, slug, name}, ...], exported by /admin/transcripts.
    Returns {slug: name}. Never mutated, never guessed against."""
    if not slugs_path.exists():
        print(f"ERROR: {slugs_path} not found. Download it from /admin/transcripts first.")
        sys.exit(1)
    raw = json.loads(slugs_path.read_text(encoding="utf-8"))
    slugs: dict[str, str] = {}
    for row in raw:
        slugs[row["slug"]] = row.get("name", row["slug"])
    return slugs


def load_state(out_dir: Path) -> dict:
    state_path = out_dir / STATE_FILENAME
    if not state_path.exists():
        return {"files": {}}
    return json.loads(state_path.read_text(encoding="utf-8"))


def save_state(out_dir: Path, state: dict) -> None:
    (out_dir / STATE_FILENAME).write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")


def discover_files(videos_dir: Path) -> tuple[list[tuple[Path, str]], list[tuple[Path, str]]]:
    """Returns (matched_by_folder, out_of_scope). matched_by_folder is
    [(path, language)] for files directly under a recognized language folder.
    out_of_scope is [(path, reason)] for anything else under videos_dir (loose
    files at the root, or a third folder) -- these are unmatched regardless of
    filename, since there is no folder to force a language from."""
    matched: list[tuple[Path, str]] = []
    out_of_scope: list[tuple[Path, str]] = []

    if not videos_dir.exists():
        return matched, out_of_scope

    for entry in sorted(videos_dir.iterdir()):
        if entry.is_file():
            if entry.suffix.lower() in VIDEO_EXTENSIONS:
                out_of_scope.append((entry, "not in en/ or he/"))
            continue
        if entry.is_dir():
            folder_lang = LANGUAGE_BY_FOLDER.get(entry.name)
            for f in sorted(entry.iterdir()):
                if not f.is_file() or f.suffix.lower() not in VIDEO_EXTENSIONS:
                    continue
                if folder_lang:
                    matched.append((f, folder_lang))
                else:
                    out_of_scope.append((f, f"unrecognized folder '{entry.name}' (expected en/ or he/)"))
    return matched, out_of_scope


def compute_quality_warnings(lines: list[str], word_count: int, duration_seconds: float, language: str) -> list[str]:
    warnings: list[str] = []

    if word_count == 0:
        warnings.append("empty_output: no words transcribed")
        return warnings

    counts: dict[str, int] = {}
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        counts[stripped] = counts.get(stripped, 0) + 1
    for text, count in counts.items():
        if count >= REPEATED_LINE_THRESHOLD:
            preview = text if len(text) <= 80 else text[:77] + "..."
            warnings.append(f'repeated_line: "{preview}" repeated {count} times')

    duration_minutes = duration_seconds / 60.0
    if duration_minutes > 0:
        rate = word_count / duration_minutes
        floor = MIN_WORDS_PER_MINUTE.get(language, MIN_WORDS_PER_MINUTE["en"])
        if rate < floor:
            warnings.append(
                f"low_word_rate: {rate:.1f} words/min is below the {floor} words/min floor for '{language}' "
                "(possible silence/hallucination)"
            )

    return warnings


def transcribe_one(model, path: Path, language: str, out_dir: Path, slug: str) -> FileResult:
    sha = sha256_of(path)
    print(f"  hashing... {sha[:12]}")

    segments, info = model.transcribe(str(path), language=language, vad_filter=True)

    lines: list[str] = []
    last_pct_printed = -1
    for seg in segments:
        text = seg.text.strip()
        if text:
            lines.append(text)
        if info.duration > 0:
            pct = int((seg.end / info.duration) * 100)
            if pct >= last_pct_printed + 10:
                print(f"  ... {pct}%")
                last_pct_printed = pct

    full_text = "\n".join(lines)
    word_count = len(full_text.split())
    duration_seconds = float(info.duration or 0.0)

    (out_dir / f"{slug}.txt").write_text(full_text, encoding="utf-8")

    warnings = compute_quality_warnings(lines, word_count, duration_seconds, language)

    return FileResult(
        filename=path.name,
        slug=slug,
        language=language,
        sha256=sha,
        duration_seconds=duration_seconds,
        word_count=word_count,
        warnings=warnings,
        status="completed",
        completed_at=now_iso(),
        last_attempt_at=now_iso(),
    )


def write_manifest(out_dir: Path, model_name: str, state: dict, unmatched: list[dict]) -> None:
    files = []
    failed = []
    for entry in state["files"].values():
        if entry["status"] == "completed":
            files.append(
                {
                    "filename": entry["filename"],
                    "slug": entry["slug"],
                    "language": entry["language"],
                    "durationSeconds": entry["duration_seconds"],
                    "wordCount": entry["word_count"],
                    "sha256": entry["sha256"],
                    "warnings": entry["warnings"],
                    "completedAt": entry["completed_at"],
                }
            )
        else:
            failed.append(
                {
                    "filename": entry["filename"],
                    "error": entry["error"],
                    "attempts": entry["attempts"],
                }
            )

    manifest = {
        "generatedAt": now_iso(),
        "model": model_name,
        "computeType": COMPUTE_TYPE,
        "files": files,
        "unmatched": unmatched,
        "failed": failed,
    }
    (out_dir / MANIFEST_FILENAME).write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--videos-dir", default="videos", help="Folder containing en/ and he/ subfolders (default: videos)")
    parser.add_argument("--out-dir", default="out", help="Output folder for .txt files + manifest.json (default: out)")
    parser.add_argument("--slugs", default="slugs.json", help="Path to slugs.json exported from /admin/transcripts (default: slugs.json)")
    parser.add_argument("--model", default=MODEL_NAME_DEFAULT, help=f"faster-whisper model name or local path (default: {MODEL_NAME_DEFAULT})")
    parser.add_argument("--only", default=None, help="Only process this exact slug")
    parser.add_argument("--force", default=None, help="Re-process this exact slug even if already completed")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be processed without running Whisper")
    args = parser.parse_args()

    videos_dir = Path(args.videos_dir)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    slugs = load_slugs(Path(args.slugs))
    state = load_state(out_dir)

    matched, out_of_scope = discover_files(videos_dir)

    to_process: list[tuple[Path, str, str]] = []  # (path, language, slug)
    unmatched: list[dict] = []

    for path, reason in out_of_scope:
        unmatched.append({"filename": path.name, "reason": reason})

    for path, language in matched:
        slug = path.stem
        if slug not in slugs:
            unmatched.append({"filename": path.name, "reason": "no exact slug match"})
            continue
        if args.only and slug != args.only:
            continue
        to_process.append((path, language, slug))

    if unmatched:
        print(f"Unmatched ({len(unmatched)}):")
        for u in unmatched:
            print(f"  - {u['filename']}: {u['reason']}")
        print()

    if args.dry_run:
        print(f"Dry run: {len(to_process)} file(s) would be processed.")
        for path, language, slug in to_process:
            print(f"  {path.name} -> {slug}.txt ({language})")
        return

    if not to_process:
        print("Nothing to process.")
        write_manifest(out_dir, args.model, state, unmatched)
        return

    print(f"Loading model '{args.model}' ({DEVICE}, {COMPUTE_TYPE})...")
    from faster_whisper import WhisperModel

    model = WhisperModel(args.model, device=DEVICE, compute_type=COMPUTE_TYPE)

    done_count = 0
    skip_count = 0
    fail_count = 0
    total = len(to_process)

    for i, (path, language, slug) in enumerate(to_process, start=1):
        print(f"[{i}/{total}] {path.name} ({language})")

        sha = sha256_of(path)
        existing = state["files"].get(sha)
        force_this = args.force == slug

        if existing and existing["status"] == "completed" and not force_this:
            txt_path = out_dir / f"{existing['slug']}.txt"
            if txt_path.exists():
                print(f"  skip (already completed, {existing['word_count']} words)")
                skip_count += 1
                continue
            print("  previously completed but output .txt is missing -- re-running")

        attempts = (existing["attempts"] + 1) if existing else 1

        try:
            result = transcribe_one(model, path, language, out_dir, slug)
            result.attempts = attempts
            state["files"][sha] = result.__dict__
            save_state(out_dir, state)
            done_count += 1
            warn_note = f", {len(result.warnings)} warning(s)" if result.warnings else ""
            print(f"  done: {result.word_count} words, {result.duration_seconds:.0f}s{warn_note}")
            for w in result.warnings:
                print(f"    ! {w}")
        except Exception as e:  # noqa: BLE001 -- one file's failure must never stop the batch
            state["files"][sha] = {
                "filename": path.name,
                "slug": slug,
                "language": language,
                "sha256": sha,
                "duration_seconds": 0.0,
                "word_count": 0,
                "warnings": [],
                "status": "failed",
                "error": str(e),
                "attempts": attempts,
                "completed_at": None,
                "last_attempt_at": now_iso(),
            }
            save_state(out_dir, state)
            fail_count += 1
            print(f"  FAILED: {e}")

    write_manifest(out_dir, args.model, state, unmatched)

    print()
    print(f"Summary: {done_count} done, {skip_count} skipped, {fail_count} failed, {len(unmatched)} unmatched.")
    print(f"Output: {out_dir}/  (manifest.json has full details)")


if __name__ == "__main__":
    main()
