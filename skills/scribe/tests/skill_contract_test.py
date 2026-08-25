"""Contract tests between skills/scribe's SKILL.md, its templates, and triage.py.

Run: python3 skills/scribe/tests/skill_contract_test.py
"""

import json
import re
import subprocess
import sys
import unittest
from pathlib import Path
from typing import cast

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE.parent / "scripts"))

from triage import triage  # noqa: E402

TRIAGE = HERE.parent / "scripts" / "triage.py"

LANGS = ["ja", "en"]

# The store this repository keeps, which is also what a scribe run reads back and rewrites.
CANDIDATES = ROOT / "docs" / "wiki" / "_candidates.md"

# The two headings Phase 3 sorts into. Both stay even while empty, or a carried-over line has
# nowhere to land.
SECTIONS = ("## 昇格待ち", "## 単発")


def at(lang: str, *parts: str) -> Path:
    return ROOT.joinpath(*(([".ja"] if lang == "ja" else []) + list(parts)))


def skill(lang: str) -> str:
    return at(lang, "skills", "scribe", "SKILL.md").read_text(encoding="utf-8")


class SkillContract(unittest.TestCase):
    def test_the_existing_values_the_skill_names_are_the_ones_triage_branches_on(self) -> None:
        """A value only one side knows falls to the none branch, filing an existing page as new."""
        for lang in LANGS:
            doc = skill(lang)
            for value in ("page", "candidate", "none"):
                self.assertIn(f"`{value}`", doc, f"{lang}: {value}")
        report = triage([{"name": "x", "evidence": ["#1", "#2"], "existing": "page"}])
        self.assertEqual(report["pages"][0]["action"], "update")

    def test_the_line_format_the_skill_defines_is_the_one_the_store_already_uses(self) -> None:
        """A shape only the skill knows makes the next run rewrite every line it appends beside.
        The store is the other half of the contract, so both sides are read here."""
        expected = {"ja": "`- <内容 1 行> <根拠>`", "en": "`- <one-line content> <evidence>`"}
        for lang in LANGS:
            self.assertIn(expected[lang], skill(lang), lang)
        lines = [
            line
            for line in CANDIDATES.read_text(encoding="utf-8").split("\n")
            if line.startswith("- ")
        ]
        self.assertTrue(lines, "the store holds candidate lines to check against")
        for line in lines:
            self.assertRegex(line, r"^- \S.*?(?: (?:#\d+|\(research\)))+$", line)

    def test_the_call_the_skill_writes_hands_triage_the_store(self) -> None:
        """A line the cap deferred reaches a page again only if the store is in the ranking.
        The skill's call and the script's arity are the two halves; either alone reads green
        while the store sits out, which is what #504 was."""
        for lang in LANGS:
            doc = skill(lang)
            phase3 = doc[doc.index("## Phase 3") : doc.index("## Phase 4")]
            self.assertIn("triage.py '<", phase3, f"{lang}: Phase 3 names the triage call")
            call = phase3[phase3.index("triage.py '<") :]
            call = call[: call.index("`")]
            self.assertIn(
                "docs/wiki/_candidates.md",
                call,
                f"{lang}: the call hands triage the store",
            )
        proc = subprocess.run(
            [sys.executable, str(TRIAGE), json.dumps([])],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(proc.returncode, 2, "the script refuses the call without the store")
        report = triage([{"name": "carried", "evidence": ["#1", "#2"], "existing": "candidate"}])
        self.assertEqual(report["pages"][0]["action"], "promote")

    def test_phase_2_goes_on_when_only_the_store_holds_anything(self) -> None:
        """With the scope empty and the store full, stopping at Phase 2 would strand every
        carried-over row."""
        runs_anyway = {"ja": "0 件でも", "en": "Even with PRs, issues, and research all empty"}
        for lang in LANGS:
            doc = skill(lang)
            phase2 = doc[doc.index("## Phase 2") : doc.index("## Phase 3")]
            self.assertIn(runs_anyway[lang], phase2, f"{lang}: Phase 2 runs on the store alone")

    def test_the_store_template_carries_both_sections_the_skill_writes_into(self) -> None:
        """Phase 3 sorts candidates and deferred into two named sections. A skeleton missing one
        leaves the run writing into a heading that is not there."""
        for lang in LANGS:
            template = at(lang, "skills", "scribe", "templates", "candidates.md").read_text(
                encoding="utf-8"
            )
            for section in SECTIONS:
                self.assertIn(section, template, f"{lang}: {section}")
        store = CANDIDATES.read_text(encoding="utf-8")
        for section in SECTIONS:
            self.assertIn(section, store, f"the store carries {section}")

    def test_the_readme_template_describes_both_routes_to_a_page(self) -> None:
        """A README naming only the promotion route describes a rule the tool does not follow."""
        for lang in LANGS:
            template = at(lang, "skills", "scribe", "templates", "readme.md").read_text(
                encoding="utf-8"
            )
            self.assertIn("2 件目が現れたらページへ昇格", template, lang)
            self.assertIn("初出でも根拠が 2 件揃っていれば直接ページ", template, lang)
        report = triage(
            [
                {"name": "promoted", "evidence": ["#1", "#2"], "existing": "candidate"},
                {"name": "fresh", "evidence": ["#3", "#4"], "existing": "none"},
            ]
        )
        self.assertEqual(sorted(p["action"] for p in report["pages"]), ["create", "promote"])

    def test_the_skill_runs_the_script_through_python(self) -> None:
        """The grant and the command have to name the same runtime, or the call is refused."""
        for lang in LANGS:
            doc = skill(lang)
            self.assertIn("scripts/triage.py", doc, lang)
            grant = re.search(r"^allowed-tools:.*$", doc, re.MULTILINE)
            assert grant is not None, f"{lang}: allowed-tools line"
            self.assertIn("Bash(python3:*)", grant.group(0), lang)

    def test_every_phase_before_six_defers_its_write_to_the_worktree(self) -> None:
        """The worktree is created in Phase 6. An earlier Phase that writes touches the user's tree,
        which is the one thing the invariant table forbids. Each writing Phase has to say so, since
        one section carrying the note does not stop another from writing. Phase 1 is on the list
        because it is where the README and the store get created on a fresh repository."""
        defers = {"ja": "書き込みは Phase 6", "en": "happens inside Phase 6"}
        for lang in LANGS:
            doc = skill(lang)
            for phase in (1, 3, 4, 5):
                body = doc[doc.index(f"## Phase {phase}") : doc.index(f"## Phase {phase + 1}")]
                self.assertIn(defers[lang], body, f"{lang}: Phase {phase} defers its write")

    def test_the_worktree_step_writes_every_kind(self) -> None:
        """A kind of write missing from the step that holds the worktree has nowhere else it can
        legally land. The step alone is the anchor: Phase 6's opening prose names the repairs too,
        so scanning the whole Phase would pass on a step that dropped them."""
        repairs = {"ja": "参照修理と由来修理", "en": "reference and 由来 repairs"}
        for lang in LANGS:
            doc = skill(lang)
            phase6 = doc[doc.index("## Phase 6") :]
            step = next(line for line in phase6.split("\n") if line.startswith("2. "))
            for needle in ("templates/page.md", "_candidates.md", repairs[lang]):
                self.assertIn(needle, step, f"{lang}: {needle}")

    def test_the_page_reaches_a_plan_through_thinks_finder(self) -> None:
        """The page a run writes reaches an implementation only by think citing it. No index and
        no lookup at implementation time stand between the two, so this is the whole path."""
        finder = ROOT / "skills" / "scribe" / "scripts" / "find_wiki_rule.py"
        self.assertTrue(finder.exists(), "the finder scribe owns exists")
        for lang in LANGS:
            think = at(lang, "skills", "think", "SKILL.md").read_text(encoding="utf-8")
            self.assertIn("find_wiki_rule.py", think, f"{lang}: think runs the finder")


class WikiPageFormat(unittest.TestCase):
    """The pages live in docs/wiki of this repository, which is also scribe's own output."""

    def pages(self) -> list[Path]:
        # README and _candidates are not rule pages, so they carry no globs.
        return sorted(
            p
            for p in (ROOT / "docs" / "wiki").glob("*.md")
            if p.name not in {"README.md", "_candidates.md"}
        )

    def origins(self, page: Path) -> list[str]:
        """The DR filenames a page's 由来 section names, empty when it carries no section."""
        body = page.read_text(encoding="utf-8").split("\n## 由来\n", 1)
        if len(body) == 1:
            return []
        section = re.split(r"\n## ", body[1], maxsplit=1)[0]
        return re.findall(r"docs/decisions/([0-9]{4}-[a-z0-9-]+\.md)", section)

    def test_every_rule_page_declares_the_files_it_bears_on(self) -> None:
        """A page with no globs key cannot be told apart from one that bears on no file, and the
        consumer would have to guess which it is."""
        for page in self.pages():
            head = page.read_text(encoding="utf-8").split("\n", 3)
            self.assertEqual(head[0], "---", f"{page.name}: frontmatter opens the page")
            self.assertTrue(head[1].startswith("globs: "), f"{page.name}: globs is declared")

    def test_every_glob_parses_as_a_json_array(self) -> None:
        """The globs are read by a script, so a hand-written form that only looks like a list
        would fail at read time rather than here."""
        import json

        for page in self.pages():
            line = page.read_text(encoding="utf-8").split("\n")[1]
            value = cast(object, json.loads(line[len("globs: ") :]))
            self.assertIsInstance(value, list, f"{page.name}: globs is a list")
            for glob in cast(list[object], value):
                self.assertIsInstance(glob, str, f"{page.name}: each glob is a string")

    def test_a_page_carries_only_the_sections_of_its_kind(self) -> None:
        """A page carrying both kinds' sections leaves think's citation form undecidable."""
        for page in self.pages():
            text = page.read_text(encoding="utf-8")
            structure = "\nkind: structure\n" in text.split("---", 2)[1]
            headings = [ln for ln in text.split("\n") if ln.startswith("## ")]
            if structure:
                self.assertEqual(
                    headings,
                    ["## 内容", "## 境界", "## 契約", "## 要求", "## 参照コード", "## 由来"],
                    f"{page.name}: a structure page carries the six in order",
                )
            else:
                self.assertIn("## 定型手順", headings, f"{page.name}: a rule page carries 定型手順")
                self.assertEqual(
                    set(headings) & {"## 境界", "## 契約", "## 要求"},
                    set(),
                    f"{page.name}: a rule page carries none of the structure sections",
                )

    def test_no_page_traces_its_由来_to_a_retired_dr(self) -> None:
        """A page whose 由来 names a retired DR states a shape the successor already replaced,
        and think copies that shape into a plan verbatim."""
        retired = ("superseded by", "deprecated", "rejected")
        for page in self.pages():
            for dr in self.origins(page):
                path = ROOT / "docs" / "decisions" / dr
                self.assertTrue(path.exists(), f"{page.name}: 由来 names {dr}, which is missing")
                text = path.read_text(encoding="utf-8")
                status = re.search(r'^status:\s*"?([^"\n]+)', text, re.M)
                self.assertIsNotNone(status, f"{dr}: carries no status")
                head = cast(re.Match[str], status).group(1)
                self.assertFalse(
                    head.startswith(retired),
                    f"{page.name}: 由来 names {dr}, whose status is {head!r}",
                )

    def test_the_template_shows_the_globs_frontmatter(self) -> None:
        """A page written from a skeleton without it would carry no globs at all."""
        for lang in LANGS:
            template = at(lang, "skills", "scribe", "templates", "page.md").read_text(
                encoding="utf-8"
            )
            self.assertIn("globs:", template, f"{lang}: the skeleton carries globs")


if __name__ == "__main__":
    _ = unittest.main(verbosity=2)
