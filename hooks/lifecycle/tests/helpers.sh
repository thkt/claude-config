#!/usr/bin/env bash
# Shared test helpers for hook tests
# Usage: source "$SCRIPT_DIR/helpers.sh"

PASS=0
FAIL=0

assert_eq() {
  local name="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then
    echo "  PASS: $name"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $name"
    echo "    expected: $expected"
    echo "    actual:   $actual"
    FAIL=$((FAIL + 1))
  fi
}

assert_contains() {
  local name="$1" pattern="$2" text="$3"
  if echo "$text" | grep -qF "$pattern"; then
    echo "  PASS: $name"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $name (pattern '$pattern' not found)"
    echo "    text: $(echo "$text" | head -3)"
    FAIL=$((FAIL + 1))
  fi
}

assert_empty() {
  local name="$1" text="$2"
  if [[ -z "$text" ]]; then
    echo "  PASS: $name"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $name (expected empty, got: $(echo "$text" | head -1))"
    FAIL=$((FAIL + 1))
  fi
}

report_results() {
  echo ""
  if [[ $((PASS + FAIL)) -eq 0 ]]; then
    echo "ERROR: No assertions ran"
    exit 1
  fi
  echo "Results: $PASS passed, $FAIL failed"
  if [[ $FAIL -gt 0 ]]; then exit 1; fi
}
