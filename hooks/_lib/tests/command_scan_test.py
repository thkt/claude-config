"""Tests for hooks/_lib/command_scan.py.

Run: python3 hooks/_lib/tests/command_scan_test.py
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import command_scan


class TestCommands(unittest.TestCase):
    def names(self, text: str) -> list[str]:
        return [c[0] for c in command_scan.commands(text)]

    def test_splits_on_separators(self) -> None:
        """T-001 Splits into one command per separator"""
        self.assertEqual(self.names("cd /tmp && rm -rf x"), ["cd", "rm"])
        self.assertEqual(self.names("a; b | c"), ["a", "b", "c"])

    def test_newline_is_a_separator(self) -> None:
        """T-002 A newline counts as a command separator too"""
        self.assertEqual(self.names("cd /tmp\nrm -rf x"), ["cd", "rm"])

    def test_heredoc_body_is_not_scanned(self) -> None:
        """T-003 A heredoc body is not read as a command line"""
        text = "cat > /tmp/m.txt << 'EOF'\ngh issue create --title x\nEOF\ngit commit -F /tmp/m.txt"
        self.assertEqual(self.names(text), ["cat", "git"])

    def test_heredoc_with_dash_and_bare_delimiter(self) -> None:
        """T-004 <<- and an unquoted delimiter are skipped as body too"""
        text = "cat <<-END\nrm -rf /\nEND\necho done"
        self.assertEqual(self.names(text), ["cat", "echo"])

    def test_marker_without_a_closing_line_is_not_a_heredoc(self) -> None:
        """T-016 A << with no closing line is a word inside quotes and drops no later line"""
        # Dropping them keeps the deletion that follows out of the scan, and the security hook
        # lets it through.
        self.assertEqual(
            self.names("git commit -m 'see << EOF\nfor details'\nrm -rf x"), ["git", "rm"]
        )
        self.assertEqual(self.names("echo '<< END'\nrm -rf x"), ["echo", "rm"])

    def test_quotes_spanning_lines_hold_together(self) -> None:
        """T-015 A quote spanning lines still holds as one token"""
        # A multiline commit message takes this shape. Splitting per line before lexing leaves
        # the quote unclosed on every line, and nothing parses.
        text = "git commit -m 'fix: 1 行目\n\ngh issue create を本文で説明する行'"
        self.assertEqual(self.names(text), ["git"])

    def test_quoted_text_is_not_a_command(self) -> None:
        """T-005 A word inside quotes never stands in command position"""
        self.assertEqual(self.names("git commit -m 'remove rm calls'"), ["git"])
        self.assertEqual(self.names("sed -i '' 's|rm -rf x|y|g' f"), ["sed"])

    def test_wrappers_are_transparent(self) -> None:
        """T-006 A wrapper word is seen through, returning the real command behind it"""
        self.assertEqual(self.names("sudo rm -rf /tmp/x"), ["rm"])
        self.assertEqual(self.names("env rm /tmp/x"), ["rm"])
        self.assertEqual(self.names("time rm -rf /tmp/x"), ["rm"])

    def test_wrapper_flags_are_skipped(self) -> None:
        """T-007 Flags between the wrapper word and the command are skipped"""
        self.assertEqual(self.names("find . -print0 | xargs -0 rm"), ["find", "rm"])
        self.assertEqual(self.names("sudo -u root rm x"), ["rm"])

    def test_path_reduces_to_basename(self) -> None:
        """T-008 Written as an absolute path, it still returns the executable name"""
        self.assertEqual(self.names("/bin/rm -rf /tmp/x"), ["rm"])

    def test_find_exec_runs_a_command(self) -> None:
        """T-009 What find -exec and -execdir point at counts as a command too"""
        self.assertEqual(self.names("find . -name '*.tmp' -exec rm {} \\;"), ["find", "rm"])
        self.assertEqual(self.names("find . -execdir rm {} +"), ["find", "rm"])

    def test_a_second_exec_names_its_command(self) -> None:
        """T-011 With two or more -exec, it returns the command name rather than the flag"""
        # The shell unescapes `\;`, so every -exec after the first lands at the head of what the
        # separator cut off. Counting the flag name as a command throws off a caller reading counts.
        self.assertEqual(
            self.names("find . -exec echo {} \\; -exec rm {} \\;"),
            ["find", "echo", "rm"],
        )

    def test_unparsable_input_raises(self) -> None:
        """T-010 An unterminated quote raises, letting the caller choose fail-closed"""
        with self.assertRaises(ValueError):
            _ = list(command_scan.commands("echo 'unterminated"))

    def test_env_assignment_is_not_the_command(self) -> None:
        """T-020 A leading environment assignment is not read as the command name"""
        # Keeping the assignment makes `FOO=1 rm -rf x` miss rm, and the hook stopping rm lets
        # it through.
        self.assertEqual(self.names("FOO=1 rm -rf x"), ["rm"])
        self.assertEqual(self.names("FOO=1 BAR=2 npm install"), ["npm"])
        self.assertEqual(self.names("GH_TOKEN=x gh issue create"), ["gh"])

    def test_env_assignment_keeps_the_arguments(self) -> None:
        """T-021 Dropping the assignment keeps the arguments that follow"""
        found = list(command_scan.commands("FOO=1 gh issue create --title x"))
        self.assertEqual(found, [["gh", "issue", "create", "--title", "x"]])

    def test_a_bare_word_with_equals_is_not_an_assignment(self) -> None:
        """T-022 A word holding `=` that is not an assignment stays the command name"""
        # An assignment opens with a letter or underscore and puts no space before the `=`.
        self.assertEqual(self.names("./a=b --flag"), ["a=b"])
        self.assertEqual(self.names("1FOO=x rm -rf y"), ["1FOO=x"])

    def test_a_line_continuation_does_not_split_a_command(self) -> None:
        """T-023 A backslash before a newline joins the two lines into one command"""
        # Split at the continuation, the security hook is handed an rm carrying no path.
        self.assertEqual(
            list(command_scan.commands("rm -rf \\\n  /tmp/x")), [["rm", "-rf", "/tmp/x"]]
        )
        # The other direction: an argument whose basename is destructive would stand in command
        # position and be denied for a deletion the line never runs.
        self.assertEqual(self.names("cp x \\\n  /some/dir/rm"), ["cp"])

    def test_a_continuation_before_a_flag_keeps_it_on_the_same_command(self) -> None:
        """T-024 A flag written after a continuation stays readable on the command it belongs to"""
        # Split here, --title falls off the gh call and the gate denies a command carrying one.
        found = list(command_scan.commands('gh issue create --repo r \\\n  --title "[Bug] x"'))
        self.assertEqual(found, [["gh", "issue", "create", "--repo", "r", "--title", "[Bug] x"]])
        self.assertEqual(command_scan.flag_value(found[0], "--title"), "[Bug] x")

    def test_a_continuation_inside_a_command_prefix_keeps_it_matchable(self) -> None:
        """T-025 A continuation between gh and its subcommand leaves the prefix still matching"""
        # Split here, starts_with misses and the filing gate skips its check and exits 0.
        found = list(command_scan.commands('gh \\\n  issue create --title "[Bug] x"'))
        self.assertEqual(len(found), 1)
        self.assertTrue(command_scan.starts_with(found[0], ["gh", "issue", "create"]))

    def test_a_continuation_inside_a_word_joins_the_halves(self) -> None:
        """T-026 A continuation with no space around it leaves no gap in the token"""
        self.assertEqual(list(command_scan.commands("ec\\\nho hi")), [["echo", "hi"]])

    def test_a_backslash_newline_inside_quotes_stays_literal(self) -> None:
        """T-027 Inside quotes the backslash and the newline are text, not a continuation"""
        # A commit message can hold both characters. Dropping them there rewrites the message.
        self.assertEqual(
            list(command_scan.commands("git commit -m 'a \\\nb'")),
            [["git", "commit", "-m", "a \\\nb"]],
        )

    def test_a_continued_line_reads_the_same_as_the_joined_one(self) -> None:
        """T-028 Taking a continuation out of the input never changes the token stream"""
        # Every step ahead of shlex works on lines and cannot see quoting, which is where this
        # bug came from. The property holds across all of them, so a later step cannot reopen it.
        for continued in [
            "rm -rf \\\n  /tmp/x",
            'gh issue create --repo r \\\n  --title "[Bug] x"',
            "cat > /tmp/m.txt << 'EOF'\nbody\nEOF\ngit commit \\\n  -F /tmp/m.txt",
            "find . -type f \\\n  -exec rm {} \\;",
        ]:
            joined = continued.replace("\\\n  ", " ").replace("\\\n", "")
            self.assertEqual(
                list(command_scan.commands(continued)),
                list(command_scan.commands(joined)),
                continued,
            )


class TestFlagValue(unittest.TestCase):
    def test_reads_the_value_after_a_flag(self) -> None:
        """T-011 Returns the token after the flag as its value"""
        tokens = ["gh", "issue", "create", "--title", "[Bug] x", "--body-file", "/tmp/b.md"]
        self.assertEqual(command_scan.flag_value(tokens, "--title"), "[Bug] x")
        self.assertEqual(command_scan.flag_value(tokens, "--body-file"), "/tmp/b.md")

    def test_reads_an_equals_form(self) -> None:
        """T-012 Reads the --flag=value shape too"""
        self.assertEqual(command_scan.flag_value(["gh", "--title=x"], "--title"), "x")

    def test_returns_none_when_absent(self) -> None:
        """T-013 None when the flag is absent and when no value follows"""
        self.assertIsNone(command_scan.flag_value(["gh", "issue", "create"], "--title"))
        self.assertIsNone(command_scan.flag_value(["gh", "--title"], "--title"))


class TestGitSubcommand(unittest.TestCase):
    def test_reads_the_subcommand_and_its_arguments(self) -> None:
        """T-017 Returns the word standing right after git as the subcommand"""
        self.assertEqual(command_scan.git_subcommand(["git", "clean", "-fd"]), ("clean", ["-fd"]))
        self.assertEqual(command_scan.git_subcommand(["git", "status"]), ("status", []))

    def test_skips_gits_own_options(self) -> None:
        """T-018 Skips git's own options to land on the subcommand"""
        # A valued flag swallows the next token, so skipping it wrong makes /tmp the subcommand.
        self.assertEqual(command_scan.git_subcommand(["git", "-C", "/tmp", "clean"]), ("clean", []))
        self.assertEqual(command_scan.git_subcommand(["git", "--no-pager", "log"]), ("log", []))

    def test_returns_none_when_no_subcommand_follows(self) -> None:
        """T-019 None when no subcommand follows"""
        self.assertEqual(command_scan.git_subcommand(["git"]), (None, []))
        self.assertEqual(command_scan.git_subcommand(["git", "-C", "/tmp"]), (None, []))


class TestStartsWith(unittest.TestCase):
    def test_matches_a_leading_token_sequence(self) -> None:
        """T-014 Matches against the leading run of tokens"""
        cmd = ["gh", "issue", "create", "--title", "x"]
        self.assertTrue(command_scan.starts_with(cmd, ["gh", "issue", "create"]))
        self.assertFalse(command_scan.starts_with(cmd, ["gh", "pr", "create"]))
        self.assertFalse(command_scan.starts_with(["gh", "issue"], ["gh", "issue", "create"]))


class TestGitCleanOnlyLists(unittest.TestCase):
    """Pinned here rather than in either hook's suite: rm_to_trash passes the raw arguments
    and git_sandbox_guard passes them already truncated at `--`, and the two must land alike."""

    def test_dry_run_forms_only_list(self) -> None:
        """T-020 The long flag and the short bit, alone or combined, only list"""
        self.assertTrue(command_scan.git_clean_only_lists(["--dry-run"]))
        self.assertTrue(command_scan.git_clean_only_lists(["-n"]))
        self.assertTrue(command_scan.git_clean_only_lists(["-nd"]))

    def test_force_deletes(self) -> None:
        """T-021 Without the dry-run bit the call removes files"""
        self.assertFalse(command_scan.git_clean_only_lists(["-fd"]))
        self.assertFalse(command_scan.git_clean_only_lists([]))

    def test_a_pathspec_shaped_like_a_flag_does_not_clear_it(self) -> None:
        """T-022 A file named past `--` is a pathspec, never the dry-run flag"""
        self.assertFalse(command_scan.git_clean_only_lists(["-fd", "--", "-notes"]))
        self.assertFalse(command_scan.git_clean_only_lists(["-fd", "--", "-n"]))
        self.assertTrue(command_scan.git_clean_only_lists(["-n", "--", "-notes"]))


if __name__ == "__main__":
    _ = unittest.main(verbosity=2)
