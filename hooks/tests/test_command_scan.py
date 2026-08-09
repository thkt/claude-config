"""Tests for hooks/lib/command_scan.py.

Run: python3 hooks/tests/test_command_scan.py
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "lib"))

import command_scan  # noqa: E402


class TestCommands(unittest.TestCase):
    def names(self, text):
        return [c[0] for c in command_scan.commands(text)]

    def test_splits_on_separators(self):
        """T-001 セパレータごとに 1 コマンドへ切る"""
        self.assertEqual(self.names("cd /tmp && rm -rf x"), ["cd", "rm"])
        self.assertEqual(self.names("a; b | c"), ["a", "b", "c"])

    def test_newline_is_a_separator(self):
        """T-002 改行もコマンドの区切りとして数える"""
        self.assertEqual(self.names("cd /tmp\nrm -rf x"), ["cd", "rm"])

    def test_heredoc_body_is_not_scanned(self):
        """T-003 heredoc の本文はコマンド列として読まない"""
        text = "cat > /tmp/m.txt << 'EOF'\ngh issue create --title x\nEOF\ngit commit -F /tmp/m.txt"
        self.assertEqual(self.names(text), ["cat", "git"])

    def test_heredoc_with_dash_and_bare_delimiter(self):
        """T-004 <<- と引用符なしのデリミタも本文として読み飛ばす"""
        text = "cat <<-END\nrm -rf /\nEND\necho done"
        self.assertEqual(self.names(text), ["cat", "echo"])

    def test_quotes_spanning_lines_hold_together(self):
        """T-015 引用符が行をまたいでも 1 トークンにまとめる"""
        # 複数行のコミットメッセージがこの形。行ごとに切ってから字句解析すると、
        # どの行でも引用符が閉じず解析不能になる。
        text = "git commit -m 'fix: 1 行目\n\ngh issue create を本文で説明する行'"
        self.assertEqual(self.names(text), ["git"])

    def test_quoted_text_is_not_a_command(self):
        """T-005 引用符の内側にある語はコマンド位置に立たない"""
        self.assertEqual(self.names("git commit -m 'remove rm calls'"), ["git"])
        self.assertEqual(self.names("sed -i '' 's|rm -rf x|y|g' f"), ["sed"])

    def test_wrappers_are_transparent(self):
        """T-006 ラッパー語は透過して、その先の実コマンドを返す"""
        self.assertEqual(self.names("sudo rm -rf /tmp/x"), ["rm"])
        self.assertEqual(self.names("env rm /tmp/x"), ["rm"])
        self.assertEqual(self.names("time rm -rf /tmp/x"), ["rm"])

    def test_wrapper_flags_are_skipped(self):
        """T-007 ラッパー語とコマンドの間のフラグを飛ばす"""
        self.assertEqual(self.names("find . -print0 | xargs -0 rm"), ["find", "rm"])
        self.assertEqual(self.names("sudo -u root rm x"), ["rm"])

    def test_path_reduces_to_basename(self):
        """T-008 絶対パスで書かれても実行ファイル名で返す"""
        self.assertEqual(self.names("/bin/rm -rf /tmp/x"), ["rm"])

    def test_find_exec_runs_a_command(self):
        """T-009 find の -exec と -execdir が指す先もコマンドとして数える"""
        self.assertEqual(self.names("find . -name '*.tmp' -exec rm {} \\;"), ["find", "rm"])
        self.assertEqual(self.names("find . -execdir rm {} +"), ["find", "rm"])

    def test_unparsable_input_raises(self):
        """T-010 閉じない引用符は例外にする。呼び出し側が fail-closed を選べる"""
        with self.assertRaises(ValueError):
            list(command_scan.commands("echo 'unterminated"))


class TestFlagValue(unittest.TestCase):
    def test_reads_the_value_after_a_flag(self):
        """T-011 フラグの次のトークンを値として返す"""
        tokens = ["gh", "issue", "create", "--title", "[Bug] x", "--body-file", "/tmp/b.md"]
        self.assertEqual(command_scan.flag_value(tokens, "--title"), "[Bug] x")
        self.assertEqual(command_scan.flag_value(tokens, "--body-file"), "/tmp/b.md")

    def test_reads_an_equals_form(self):
        """T-012 --flag=value の形も読む"""
        self.assertEqual(command_scan.flag_value(["gh", "--title=x"], "--title"), "x")

    def test_returns_none_when_absent(self):
        """T-013 フラグが無いときと値が続かないときは None"""
        self.assertIsNone(command_scan.flag_value(["gh", "issue", "create"], "--title"))
        self.assertIsNone(command_scan.flag_value(["gh", "--title"], "--title"))


class TestStartsWith(unittest.TestCase):
    def test_matches_a_leading_token_sequence(self):
        """T-014 先頭のトークン列で照合する"""
        cmd = ["gh", "issue", "create", "--title", "x"]
        self.assertTrue(command_scan.starts_with(cmd, ["gh", "issue", "create"]))
        self.assertFalse(command_scan.starts_with(cmd, ["gh", "pr", "create"]))
        self.assertFalse(command_scan.starts_with(["gh", "issue"], ["gh", "issue", "create"]))


if __name__ == "__main__":
    unittest.main(verbosity=2)
