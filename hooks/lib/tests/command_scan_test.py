"""Tests for hooks/lib/command_scan.py.

Run: python3 hooks/lib/tests/command_scan_test.py
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import command_scan


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

    def test_marker_without_a_closing_line_is_not_a_heredoc(self):
        """T-016 終端行の無い << は引用符の中の語なので、後続の行を落とさない"""
        # 落としてしまうと、この後に続く削除がスキャンに届かず security hook が素通しする。
        self.assertEqual(self.names("git commit -m 'see << EOF\nfor details'\nrm -rf x"), ["git", "rm"])
        self.assertEqual(self.names("echo '<< END'\nrm -rf x"), ["echo", "rm"])

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

    def test_a_second_exec_names_its_command(self):
        """T-011 -exec が 2 つ以上あっても、フラグでなくコマンドの名前で返す"""
        # シェルが `\;` のエスケープを解くので、2 つ目以降の -exec は区切りで切られた側の
        # 先頭に来る。フラグ名をコマンドとして数えると、件数を見る呼び出し側が狂う。
        self.assertEqual(
            self.names("find . -exec echo {} \\; -exec rm {} \\;"),
            ["find", "echo", "rm"],
        )

    def test_unparsable_input_raises(self):
        """T-010 閉じない引用符は例外にする。呼び出し側が fail-closed を選べる"""
        with self.assertRaises(ValueError):
            list(command_scan.commands("echo 'unterminated"))


    def test_env_assignment_is_not_the_command(self):
        """T-020 先頭の環境変数代入はコマンド名として読まない"""
        # 代入を残すと `FOO=1 rm -rf x` が rm と一致せず、rm を止める hook が素通しする。
        self.assertEqual(self.names("FOO=1 rm -rf x"), ["rm"])
        self.assertEqual(self.names("FOO=1 BAR=2 npm install"), ["npm"])
        self.assertEqual(self.names("GH_TOKEN=x gh issue create"), ["gh"])

    def test_env_assignment_keeps_the_arguments(self):
        """T-021 環境変数代入を落としても後続の引数は残す"""
        found = list(command_scan.commands("FOO=1 gh issue create --title x"))
        self.assertEqual(found, [["gh", "issue", "create", "--title", "x"]])

    def test_a_bare_word_with_equals_is_not_an_assignment(self):
        """T-022 代入に見えない `=` を含む語はコマンド名として残す"""
        # 代入は先頭が英字か下線で、`=` の前に空白を挟まない形に限る。
        self.assertEqual(self.names("./a=b --flag"), ["a=b"])
        self.assertEqual(self.names("1FOO=x rm -rf y"), ["1FOO=x"])


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


class TestGitSubcommand(unittest.TestCase):
    def test_reads_the_subcommand_and_its_arguments(self):
        """T-017 git の直後に立つ語を subcommand として返す"""
        self.assertEqual(command_scan.git_subcommand(["git", "clean", "-fd"]), ("clean", ["-fd"]))
        self.assertEqual(command_scan.git_subcommand(["git", "status"]), ("status", []))

    def test_skips_gits_own_options(self):
        """T-018 git 自身のオプションを飛ばして subcommand へ着く"""
        # 値を取るフラグは次のトークンを飲むので、飛ばし方を誤ると /tmp が subcommand になる。
        self.assertEqual(command_scan.git_subcommand(["git", "-C", "/tmp", "clean"]), ("clean", []))
        self.assertEqual(command_scan.git_subcommand(["git", "--no-pager", "log"]), ("log", []))

    def test_returns_none_when_no_subcommand_follows(self):
        """T-019 subcommand が続かないときは None"""
        self.assertEqual(command_scan.git_subcommand(["git"]), (None, []))
        self.assertEqual(command_scan.git_subcommand(["git", "-C", "/tmp"]), (None, []))


class TestStartsWith(unittest.TestCase):
    def test_matches_a_leading_token_sequence(self):
        """T-014 先頭のトークン列で照合する"""
        cmd = ["gh", "issue", "create", "--title", "x"]
        self.assertTrue(command_scan.starts_with(cmd, ["gh", "issue", "create"]))
        self.assertFalse(command_scan.starts_with(cmd, ["gh", "pr", "create"]))
        self.assertFalse(command_scan.starts_with(["gh", "issue"], ["gh", "issue", "create"]))


if __name__ == "__main__":
    unittest.main(verbosity=2)
