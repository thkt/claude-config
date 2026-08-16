"""Integration tests for hooks/security/rm_to_trash.py (PreToolUse hook).

Run: python3 hooks/security/tests/rm_to_trash_test.py
"""

import json
import subprocess
import sys
import unittest
from pathlib import Path

HOOK = Path(__file__).resolve().parents[1] / "rm_to_trash.py"


def run_hook(command):
    payload = json.dumps({"tool_name": "Bash", "tool_input": {"command": command}})
    result = subprocess.run(
        [sys.executable, str(HOOK)],
        input=payload,
        capture_output=True,
        text=True,
        check=False,
    )
    return result.stdout


class TestRmToTrash(unittest.TestCase):
    # subTest で 1 件ずつ包む。包まないと最初の失敗で残りが走らず、どのコマンドが通り
    # どれが止まったかが 1 件しか見えなくなる。
    def assert_denied(self, command):
        with self.subTest(command=command):
            self.assertIn('"deny"', run_hook(command), "deny を返さない")

    def assert_allowed(self, command):
        with self.subTest(command=command):
            self.assertNotIn('"deny"', run_hook(command), "deny を返す")

    def test_direct_deletion(self):
        """T-001 コマンド先頭の削除は止める"""
        self.assert_denied("rm -rf /tmp/x")
        self.assert_denied("rmdir /tmp/x")
        self.assert_denied("unlink /tmp/x")
        self.assert_denied("shred /tmp/x")

    def test_second_line_deletion(self):
        """T-002 2 行目以降に置かれた削除も止める"""
        self.assert_denied("cd /tmp\nrm -rf x")

    def test_wrapped_deletion(self):
        """T-003 ラッパー語ごしの削除も止める"""
        self.assert_denied("sudo rm -rf /tmp/x")
        self.assert_denied("env rm /tmp/x")
        self.assert_denied("time rm -rf /tmp/x")
        self.assert_denied("/bin/rm -rf /tmp/x")

    def test_indirect_deletion(self):
        """T-004 find と xargs 経由の削除も止める"""
        self.assert_denied('find . -name "*.tmp" -exec rm {} \\;')
        self.assert_denied("find . -print0 | xargs -0 rm")

    def test_quoted_text_is_not_a_deletion(self):
        """T-005 引用符の内側にある語は削除として扱わない"""
        self.assert_allowed("sed -i '' 's|rm -rf x|y|g' f")
        self.assert_allowed("git commit -m 'remove rm calls from the test'")
        self.assert_allowed("echo 'rm -rf danger' > note.txt")

    def test_heredoc_body_is_not_a_deletion(self):
        """T-006 heredoc の本文にある削除語では止めない"""
        self.assert_allowed(
            "cat > /tmp/m.txt << 'EOF'\nrm -rf /tmp/x\nEOF\ngit commit -F /tmp/m.txt"
        )

    def test_unparsable_input_is_denied(self):
        """T-007 解析できないコマンドは止める側へ倒す"""
        # 閉じない引用符では、どこがコマンド位置なのか決められない。security hook なので
        # 判断できないときは通さない。
        self.assert_denied('rm -rf "/tmp/x')

    def test_unrelated_command_skipped(self):
        """T-008 削除語を含まないコマンドは何も返さない"""
        self.assertEqual(run_hook("git status"), "")

    def test_deletion_through_a_flag(self):
        """T-009 削除語を出さずにファイルを消す形も止める"""
        # find -delete も git clean も、行のどのトークンも削除コマンドを名乗らない。
        self.assert_denied('find . -name "*.tmp" -delete')
        self.assert_denied("git clean -fd")
        self.assert_denied("git -C /tmp clean -fd")

    def test_listing_is_not_a_deletion(self):
        """T-010 消さずに一覧を出す形は通す"""
        self.assert_allowed("git clean -n")
        self.assert_allowed("git clean -nd")
        self.assert_allowed("git clean --dry-run")
        self.assert_allowed('find . -name "*.tmp"')

    def test_env_assignment_does_not_hide_a_deletion(self):
        """T-011 先頭の環境変数代入を挟んでも削除は止める"""
        # 代入をコマンド名として読むと rm と一致せず、削除がそのまま走る。
        self.assert_denied("FOO=1 rm -rf /tmp/x")
        self.assert_denied("FOO=1 BAR=2 rm -rf /tmp/x")


if __name__ == "__main__":
    unittest.main(verbosity=2)
