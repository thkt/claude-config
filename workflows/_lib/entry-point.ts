/** Whether the module at metaUrl is the script the process was started with.
 *
 * Both sides are resolved before the comparison. A path reaching argv[1] through a symlink
 * (macOS hands out /var/... for /private/var/...) never equals the resolved module path, and a
 * CLI whose guard compares the two as given exits 0 having printed nothing at all.
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
