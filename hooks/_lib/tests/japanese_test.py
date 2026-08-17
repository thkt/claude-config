"""Tests for hooks/_lib/japanese.py.

Run: python3 hooks/_lib/tests/japanese_test.py

The threshold decides which hook fires, so the boundary is the whole behaviour: one below
leaves a file alone and one above rewrites or warns about it.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from japanese import DEFAULT_THRESHOLD, has_japanese


class Threshold(unittest.TestCase):
    def test_the_count_at_the_threshold_passes(self) -> None:
        self.assertTrue(has_japanese("あ" * 10, 10))

    def test_one_below_the_threshold_fails(self) -> None:
        self.assertFalse(has_japanese("あ" * 9, 10))

    def test_a_single_character_answers_the_lowest_threshold(self) -> None:
        self.assertTrue(has_japanese("English text with 保 in it", 1))
        self.assertFalse(has_japanese("English text only", 1))

    def test_no_threshold_takes_the_default(self) -> None:
        self.assertTrue(has_japanese("あ" * DEFAULT_THRESHOLD))
        self.assertFalse(has_japanese("あ" * (DEFAULT_THRESHOLD - 1)))

    def test_none_takes_the_default_as_well(self) -> None:
        # textlint passes the mode's optional threshold straight through.
        self.assertTrue(has_japanese("あ" * DEFAULT_THRESHOLD, None))


class CharacterClass(unittest.TestCase):
    def test_each_script_counts(self) -> None:
        self.assertTrue(has_japanese("ひらがな" + "カタカナ" + "漢字" + "ー", 1))

    def test_punctuation_alone_is_not_prose(self) -> None:
        # A line of 、。 carries no words, so counting it would clear the guard on an
        # otherwise English file.
        self.assertFalse(has_japanese("、。！？（）「」" * 20, 1))

    def test_english_and_digits_do_not_count(self) -> None:
        self.assertFalse(has_japanese("The quick brown fox 12345" * 10, 1))


if __name__ == "__main__":
    _ = unittest.main(verbosity=2)
