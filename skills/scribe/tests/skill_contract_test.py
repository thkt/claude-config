"""Contract tests between skills/scribe's SKILL.md, its templates, and triage.py.

Run: python3 skills/scribe/tests/skill_contract_test.py
"""

import json
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import cast

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE.parent / "scripts"))

from triage import merge, read_store, triage  # noqa: E402
from verify_run_test import _git, _report, _rows, _run_verify  # noqa: E402

TRIAGE = HERE.parent / "scripts" / "triage.py"

LANGS = ["ja", "en"]

# The store this repository keeps, which is also what a scribe run reads back and rewrites.
CANDIDATES = ROOT / "docs" / "wiki" / "_candidates.md"

# The two headings Phase 3 sorts into. Both stay even while empty, or a carried-over line has
# nowhere to land.
SECTIONS = ("## 昇格待ち", "## 単発", "## 棄却")


def at(lang: str, *parts: str) -> Path:
    return ROOT.joinpath(*(([".ja"] if lang == "ja" else []) + list(parts)))


def skill(lang: str) -> str:
    return at(lang, "skills", "scribe", "SKILL.md").read_text(encoding="utf-8")


def phase_4_steps_naming_the_store(lang: str) -> str:
    """Every Phase 4 step naming the store, joined. Empty when no Phase 4 step names it."""
    doc = skill(lang)
    phase4 = doc[doc.index("## Phase 4") : doc.index("## Phase 5")]
    steps = [line for line in phase4.split("\n") if re.match(r"^\d+\. ", line)]
    return "\n".join(step for step in steps if "_candidates.md" in step)


def phase_4_steps(lang: str) -> list[str]:
    """Every numbered Phase 4 step line, in order."""
    doc = skill(lang)
    phase4 = doc[doc.index("## Phase 4") : doc.index("## Phase 5")]
    return [line for line in phase4.split("\n") if re.match(r"^\d+\. ", line)]


# The words that name a structure page and a broken reference, per language. The Phase 4 table
# row "Does a structure page match the current implementation?" must be drawn by a step that
# fires regardless of whether a reference is broken, so a step that only fires under a broken
# reference does not satisfy T-001.
STRUCTURE_PAGE_WORD = {"ja": "構造ページ", "en": "structure page"}
BROKEN_REFERENCE_WORD = {"ja": "壊れ", "en": "broken"}

# The three structure-page section headings the cross-check must name, per language.
STRUCTURE_ROW_WORDS = {
    "ja": ("境界", "契約", "要求"),
    "en": ("boundary", "contract", "requirement"),
}


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

    def test_phase_4_moves_the_candidate_line_of_an_item_it_drops(self) -> None:
        """Phase 3 step 7 prepared the deletion of the candidate line, so an item Phase 4 drops
        loses its line without reaching a page."""
        # Stems, so 移す and 移し both match.
        moves = {"ja": "移", "en": "move"}
        for lang in LANGS:
            steps = phase_4_steps_naming_the_store(lang)
            self.assertIn("_candidates.md", steps, f"{lang}: a Phase 4 step names the store")
            self.assertIn(moves[lang], steps, f"{lang}: that step moves the line")

    def test_phase_4_carries_a_structure_page_cross_check_independent_of_broken_references(
        self,
    ) -> None:
        """T-001: both trees' Phase 4 carries a step that cross-checks a structure page's rows
        without depending on a broken reference."""
        for lang in LANGS:
            steps = phase_4_steps(lang)
            hits = [step for step in steps if STRUCTURE_PAGE_WORD[lang] in step]
            self.assertTrue(
                hits, f"{lang}: Phase 4 carries a step naming a structure page"
            )
            self.assertFalse(
                any(BROKEN_REFERENCE_WORD[lang] in step for step in hits),
                f"{lang}: the structure-page step must not gate on a broken reference",
            )

    def test_phase_4_structure_page_step_names_the_boundary_contract_requirement_rows(
        self,
    ) -> None:
        """T-002: both trees' Phase 4 step names the boundary, contract, and requirement rows
        as what gets cross-checked."""
        for lang in LANGS:
            steps = phase_4_steps(lang)
            hits = [step for step in steps if STRUCTURE_PAGE_WORD[lang] in step]
            self.assertTrue(
                hits, f"{lang}: Phase 4 carries a step naming a structure page"
            )
            step_text = "\n".join(hits)
            for word in STRUCTURE_ROW_WORDS[lang]:
                self.assertIn(
                    word, step_text, f"{lang}: the structure-page step names {word}"
                )

    def test_the_line_phase_4_moves_carries_why_it_was_dropped(self) -> None:
        """The 棄却 section is outside what read_store ranks, so a line landing there without a
        reason leaves no way to tell a dropped item from one nobody looked at."""
        reason = {"ja": "理由", "en": "reason"}
        for lang in LANGS:
            steps = phase_4_steps_naming_the_store(lang)
            self.assertIn("棄却", steps, f"{lang}: the step names the 棄却 section")
            self.assertIn(reason[lang], steps, f"{lang}: the step writes the reason down")

    def test_read_store_leaves_the_棄却_section_out_of_the_ranking(self) -> None:
        """A dropped item ranked again takes a page slot every run and loses it every run, since
        the reasons on record are all cases the code will not turn back into a fit."""
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "_candidates.md"
            _ = path.write_text(
                "# candidates\n\n## 昇格待ち\n\n- kept #1 #2\n\n"
                "## 単発\n\n## 棄却\n\n- dropped #3 #4 #5\n  すでに lint が強制する\n",
                encoding="utf-8",
            )
            proc = subprocess.run(
                [sys.executable, str(TRIAGE), json.dumps([]), str(path)],
                capture_output=True,
                text=True,
                check=False,
            )
        self.assertEqual(proc.returncode, 0)
        report = cast(dict[str, list[dict[str, object]]], json.loads(proc.stdout))
        self.assertEqual([p["name"] for p in report["pages"]], ["kept"])

    def test_phase_2_goes_on_when_only_the_store_holds_anything(self) -> None:
        """With the scope empty and the store full, stopping at Phase 2 would strand every
        carried-over row."""
        runs_anyway = {"ja": "0 件でも", "en": "Even with PRs, issues, and research all empty"}
        for lang in LANGS:
            doc = skill(lang)
            phase2 = doc[doc.index("## Phase 2") : doc.index("## Phase 3")]
            self.assertIn(runs_anyway[lang], phase2, f"{lang}: Phase 2 runs on the store alone")

    def test_the_store_template_carries_every_section_the_skill_writes_into(self) -> None:
        """Phase 3 sorts candidates and deferred into two named sections and Phase 4 moves what it
        drops into a third. A skeleton missing one leaves the run writing into a heading that is
        not there."""
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

    def phase_6(self, lang: str) -> str:
        doc = skill(lang)
        return doc[doc.index("## Phase 6") :]

    def phase_6_steps(self, lang: str) -> str:
        """The numbered steps alone. The opening prose names the same commands in a different
        order, so scanning the whole Phase reads an order the steps do not carry."""
        lines = self.phase_6(lang).split("\n")
        return "\n".join(line for line in lines if re.match(r"^\d+\. ", line))

    def test_phase_6_commits_each_element_of_commits(self) -> None:
        """T-008 両ツリーの Phase 6 が commits の各要素をコミットする手順を持つ"""
        commit_verb = {"ja": "コミット", "en": "commit"}
        for lang in LANGS:
            phase6 = self.phase_6(lang)
            self.assertIn("commits", phase6, f"{lang}: Phase 6 names triage.py's commits field")
            steps = [line for line in phase6.split("\n") if re.match(r"^\d+\. ", line)]
            self.assertTrue(
                any("commits" in step and commit_verb[lang] in step for step in steps),
                f"{lang}: a step commits each element of commits",
            )

    def test_phase_6_lists_per_commit_pages_in_the_pr_body(self) -> None:
        """T-009 両ツリーの Phase 6 が、PR 本文へコミットごとに動かしたページを並べる手順を持つ"""
        per_commit = {"ja": "コミットごと", "en": "per commit"}
        for lang in LANGS:
            steps = self.phase_6_steps(lang)
            body_step = next(line for line in steps.split("\n") if "gh pr create" in line)
            self.assertIn(
                per_commit[lang],
                body_step,
                f"{lang}: the PR body groups the pages per commit",
            )

    def test_phase_6_runs_verify_run_before_pr_creation(self) -> None:
        """T-010 両ツリーの Phase 6 が `verify_run.py` を PR 作成前に通す手順を持つ"""
        for lang in LANGS:
            steps = self.phase_6_steps(lang)
            self.assertIn("verify_run.py", steps, f"{lang}: a numbered step runs verify_run.py")
            self.assertIn("gh pr create", steps, f"{lang}: a numbered step creates the PR")
            self.assertLess(
                steps.index("verify_run.py"),
                steps.index("gh pr create"),
                f"{lang}: verify_run.py runs before PR creation",
            )

    def test_phase_6_step_4_calls_verify_run_without_self_reported_counts(self) -> None:
        """T-008 両ツリーの SKILL.md 手順 4 が、自己申告の件数を渡さない形で verify_run.py を呼ぶ"""
        for lang in LANGS:
            steps = self.phase_6_steps(lang)
            step4 = next(line for line in steps.split("\n") if "verify_run.py" in line)
            # Not an absence check on the old placeholder names: renaming them alone would pass
            # while the caller still counts both itself. The argument list is what settles it.
            call = re.search(r"verify_run\.py((?: <[a-z-]+>)*)`", step4)
            self.assertIsNotNone(call, f"{lang}: step 4 names verify_run.py's argument list")
            assert call is not None
            self.assertEqual(
                call.group(1).split(),
                ["<worktree>", "<base>"],
                f"{lang}: step 4 passes the worktree and the base, and nothing it counted itself",
            )
            self.assertIn("stdin", step4, f"{lang}: step 4 feeds the report on stdin")
            self.assertNotIn(
                "_candidates.md",
                step4,
                f"{lang}: step 4 does not read the store with a raw git command of its own",
            )

    def test_triage_commits_length_fed_to_verify_run_is_ok_true_and_a_one_off_shift_is_false(
        self,
    ) -> None:
        """T-011 `triage.py` が返す commits の要素数を `verify_run.py` へ渡すと ok が true になり、
        1 本ずらすと false になる。この接続自体は U-001/U-002 が済ませているので、この境界テスト
        単体は現状で通る"""
        names = [f"item{i}" for i in range(7)]

        def store(waiting: list[str]) -> str:
            rows = "".join(f"- {n} #1 #2\n" for n in waiting)
            return f"# candidates\n\n## 昇格待ち\n\n{rows}\n## 単発\n\n## 棄却\n"

        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp) / "worktree"
            wiki = repo / "docs" / "wiki"
            wiki.mkdir(parents=True)
            _ = (wiki / "_candidates.md").write_text(store(names), encoding="utf-8")
            # The same composition triage.py's own CLI runs: the store rows carry which section
            # each row waited in, which is what tells a committed row apart from a fresh one.
            report = triage(merge(read_store(wiki / "_candidates.md"), []))
            commits = report["commits"]
            self.assertTrue(commits, "triage splits 7 qualifying patterns into 2+ commits")
            _git(repo, "init", "-q")
            _git(repo, "add", "-A")
            _git(repo, "commit", "-q", "-m", "chore: seed candidates")
            _ = (wiki / "an-earlier-page.md").write_text("# earlier\n", encoding="utf-8")
            _git(repo, "add", "-A")
            _git(repo, "commit", "-q", "-m", "docs(wiki): an-earlier-page を追加/更新")
            base = subprocess.run(
                ["git", "-C", str(repo), "rev-parse", "HEAD"],
                check=True,
                capture_output=True,
                text=True,
            ).stdout.strip()

            remaining = list(names)
            for commit_items in commits:
                committed = [cast(str, item["name"]) for item in commit_items]
                for n in committed:
                    _ = (wiki / f"{n}.md").write_text(f"# {n}\n", encoding="utf-8")
                remaining = [n for n in remaining if n not in committed]
                _ = (wiki / "_candidates.md").write_text(store(remaining), encoding="utf-8")
                _git(repo, "add", "-A")
                _git(repo, "commit", "-q", "-m", f"docs(wiki): {', '.join(committed)} を追加/更新")

            def verify(payload: dict[str, object]) -> tuple[int, dict[str, object]]:
                proc = _run_verify(repo, base, payload)
                return proc.returncode, cast(dict[str, object], json.loads(proc.stdout))

            code, matched = verify(cast(dict[str, object], report))
            self.assertEqual(code, 0)
            self.assertEqual(matched["ok"], True)

            # One extra element than the run actually committed, with no name in it, so only the
            # commit count moves.
            shifted_report = _report([*cast("list[list[dict[str, object]]]", commits), _rows([])])
            code, shifted = verify(shifted_report)
            self.assertEqual(code, 1)
            self.assertEqual(shifted["ok"], False)


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

    def frontmatter_lines(self, page: Path) -> list[str]:
        """The lines between the opening and closing `---` delimiters. Scanning to the closing
        delimiter, rather than assuming a fixed position, is what lets `scenes` sit ahead of or
        behind `globs` without either line falling out of view."""
        lines = page.read_text(encoding="utf-8").split("\n")
        for i, line in enumerate(lines[1:], start=1):
            if line == "---":
                return lines[1:i]
        return []

    def test_every_wiki_page_declares_a_scenes_key_in_its_frontmatter(self) -> None:
        """T-005: A page with no scenes key cannot be told apart from one whose scene axis is
        empty on purpose, and a --scene query would have no explicit signal to read."""
        for page in self.pages():
            lines = self.frontmatter_lines(page)
            self.assertTrue(
                any(line.startswith("scenes:") for line in lines),
                f"{page.name}: scenes is declared",
            )

    def test_every_declared_scene_value_belongs_to_the_scenes_constant_imported_from_find_wiki_rule(
        self,
    ) -> None:
        """T-006: A scene value that only one page spells stays undetected until a --scene query
        for the misspelling silently returns nothing. Importing SCENES here, rather than
        restating the list, is what keeps this test and find_wiki_rule.py's own validation from
        drifting to two different closed sets."""
        from find_wiki_rule import SCENES, read_scenes

        for page in self.pages():
            for scene in read_scenes(page):
                self.assertIn(scene, SCENES, f"{page.name}: {scene!r} is not in SCENES")

    def test_scene_issue_close_returns_exactly_the_five_issue_close_pages(
        self,
    ) -> None:
        """T-007: The five pages whose content is the decision to close an issue a given way."""
        from find_wiki_rule import find

        report = find(str(ROOT / "docs" / "wiki"), "issue-close", [], scene="issue-close")
        self.assertEqual(
            sorted(cast(list[str], report["scenes"])),
            sorted(
                [
                    "incident-driven-deferral.md",
                    "premise-collapse-not-planned.md",
                    "runtime-bug-wontfix.md",
                    "umbrella-issue-recut.md",
                    "untracked-output-manual-close.md",
                ]
            ),
        )

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

    def test_the_page_template_carries_the_scenes_frontmatter_line(self) -> None:
        """T-008: A page written from a skeleton without it would carry no scenes at all,
        the same gap `test_the_template_shows_the_globs_frontmatter` guards for globs."""
        for lang in LANGS:
            template = at(lang, "skills", "scribe", "templates", "page.md").read_text(
                encoding="utf-8"
            )
            self.assertIn("scenes:", template, f"{lang}: the skeleton carries scenes")


if __name__ == "__main__":
    _ = unittest.main(verbosity=2)
