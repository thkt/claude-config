// check-index.cli.test.js と e2e.test.js が共有する git fixture。init / commit はどちらも
// 同一の下ごしらえでテスト固有の振る舞いを持たないので、ここに 1 つだけ置く。
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
