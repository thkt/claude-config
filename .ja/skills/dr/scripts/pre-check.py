#!/usr/bin/env python3
"""Usage: pre-check.py "DR Title"

stdout: status, number, filename, slug, date, dr_dir, similar_drs を持つ JSON
stderr: 検証に落ちた内容。exit 1
"""

import json
import os
import re
import sys
from datetime import datetime

from dr_common import fail, guard_skill_dir, resolve_dr_dir


def similarity(title_a, title_b):
    """2 つのタイトルで共通する語の異なり数を、title_a の語数で割った値。"""
    words_a = title_a.lower().split()
    if not words_a:
        return 0.0
    return len(set(words_a) & set(title_b.lower().split())) / len(words_a)


def first_heading(path):
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("# "):
            return line[2:]
    return ""


def main():
    title = sys.argv[1] if len(sys.argv) > 1 else ""
    dr_dir = resolve_dr_dir()
    threshold = float(os.environ.get("DUPLICATE_THRESHOLD", "0.7"))

    if not 5 <= len(title) <= 64:
        fail(f"Error: title length {len(title)} chars (required 5-64)")
    if re.search(r'[/:*?"<>|]', title):
        fail('Error: forbidden characters in title (/:*?"<>|)')
    guard_skill_dir(
        dr_dir,
        "Set DR_DIR env var or run from a project root where"
        " docs/decisions/ is the archive.",
    )

    dr_dir.mkdir(parents=True, exist_ok=True)
    if not os.access(dr_dir, os.W_OK):
        fail(f"Error: no write permission: {dr_dir}")

    numbers = [
        int(m.group(1))
        for name in os.listdir(dr_dir)
        if (m := re.match(r"(\d{4})-", name))
    ]
    next_num = f"{max(numbers, default=0) + 1:04d}"

    slug = re.sub(r"[^a-z0-9-]", "", title.lower().replace(" ", "-"))
    slug = re.sub(r"-{2,}", "-", slug).strip("-")

    similar_drs = []
    for dr_file in sorted(dr_dir.rglob("*.md")):
        existing = first_heading(dr_file)
        if not existing:
            continue
        score = similarity(title, existing)
        if score >= threshold:
            similar_drs.append(
                {"file": dr_file.name, "similarity": f"{score:.2f}", "title": existing}
            )

    print(json.dumps({
        "status": "ok",
        "number": next_num,
        "filename": f"{next_num}-{slug}.md",
        "slug": slug,
        "date": datetime.now().astimezone().date().isoformat(),
        "dr_dir": str(dr_dir),
        "similar_drs": similar_drs,
    }, indent=2))


if __name__ == "__main__":
    main()
