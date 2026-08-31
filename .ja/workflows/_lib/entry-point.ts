/** metaUrl のモジュールが、プロセスの起動に使われたスクリプトかどうか。
 *
 * 比較の前に両側を解決する。argv[1] がシンボリックリンク経由で届くパス (macOS は
 * /private/var/... を /var/... として渡す) は解決済みのモジュールパスと決して一致せず、
 * 両者をそのまま比べるガードを持つ CLI は、何も出力しないまま exit 0 で終わる。
 */
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function isMainModule(
  metaUrl: string,
  entry: string | undefined = process.argv[1],
): boolean {
  if (!entry) return false;
  const modulePath = fileURLToPath(metaUrl);
  try {
    return realpathSync(resolve(entry)) === realpathSync(modulePath);
  } catch {
    return resolve(entry) === modulePath;
  }
}
