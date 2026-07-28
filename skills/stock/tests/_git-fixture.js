// Shared git-fixture helpers for check-index.cli.test.js and e2e.test.js. Both spin up a
// throwaway git repo to drive check-index.js as a real CLI process; the init/commit steps
// are identical setup, not test-specific behavior, so they live here once.
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function initRepo(prefix) {
  const dir = mkdtempSync(join(tmpdir(), `check-index-${prefix}-`));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
  return dir;
}

export function commitAll(dir) {
  execFileSync("git", ["add", "-A"], { cwd: dir });
  execFileSync("git", ["commit", "-q", "-m", "fixture"], { cwd: dir });
}
