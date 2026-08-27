# hako

`hako.sh` runs one coding agent (`claude` or `codex`) inside an apple/container guest VM, network-locked to that agent's own allowlist, so a `--dangerously-skip-permissions` / `--dangerously-bypass-approvals-and-sandbox` run cannot reach the host or the network beyond what the agent needs. The runtime choice, the options it was weighed against, and the constraints this design accepts are recorded in [DR-0111](../../docs/decisions/0111-adopt-apple-container-for-agent-sandbox.md); this file covers running it and extending it.

## Usage

```bash
hako.sh <agent-name> [--live]
hako.sh login <agent-name>
```

`<agent-name>` is a row in `agents.sh`'s `AGENT_TABLE` (`claude`, `codex`). The default run mounts a throwaway `git clone` of the host repo under `$TMPDIR`, so the guest cannot write back into the host tree; `--live` mounts the host `$PWD` itself instead, for the case the agent's changes must land there directly (DR-0111 Accepted Constraints: this puts the host working tree inside the agent's trust boundary, so use it deliberately). `login` opens an interactive session for that agent's own auth flow, persisting into the agent's own named volume.

## Architecture

| File               | Role                                                                                                                                |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `agents.sh`        | Single source of truth for the per-agent table: exec command, auth directory, allowlist domains (U-001)                             |
| `hako.sh`          | Host-side CLI; assembles the `container run` invocation (U-005) and the `login` session (U-006)                                     |
| `Dockerfile`       | Vendored from anthropics/claude-code's `.devcontainer/Dockerfile` (U-004), installs every onboarded agent's CLI                     |
| `entrypoint.sh`    | Container root ENTRYPOINT: applies the firewall, then demotes to `node` and execs the agent (U-003)                                 |
| `init-firewall.sh` | Guest-side allowlist firewall, adapted from anthropics/claude-code's `init-firewall.sh` for apple/container's guest network (U-002) |

`entrypoint.sh`, `hako.sh`, and `init-firewall.sh` all read `agents.sh` as a sibling subprocess (`agents.sh exec|auth-dir|allowlist <name>`) rather than sourcing it in-process, so none of the three names an agent literally; adding or changing an agent never touches them.

## Adding a third agent

1. **`agents.sh`**: add a row to `AGENT_TABLE`, `name|guest exec command|auth
directory|allowlist domains`. `SHARED_ALLOWLIST` already carries `github.com
api.github.com registry.npmjs.org`; put only the new agent's own domains in its row (see
   the `claude` and `codex` rows for the shape, and cite the source the domains came from in
   a comment above the table the way the existing two do).
2. **`Dockerfile`**: add an `ARG <AGENT>_VERSION=latest` and an `npm install -g
<package>@${<AGENT>_VERSION}` step, in the `USER node` block alongside the Claude/Codex
   install steps.
3. **`Dockerfile`**: add the new agent's auth directory to the `mkdir -p ... && chown -R
node:node ...` block that currently lists `/workspace /home/node/.claude
/home/node/.codex`. Skipping this leaves the agent's named volume mounted on a
   root-owned directory.
4. **Tests**: add a test file mirroring `tests/agents-codex.test.sh`'s shape (exec/auth-dir/
   allowlist resolution, then the full `hako.sh` -> `container` -> `entrypoint.sh` ->
   `init-firewall.sh` -> `agents.sh` chain with the new agent's stub) so the new row's
   behavior is under the same coverage the existing two rows have.

No change to `hako.sh`, `entrypoint.sh`, or `init-firewall.sh` is expected; if one turns out
to be necessary, that is a signal the third agent needs something the table-driven design
does not yet express, worth a comment or a DR update rather than a one-off carve-out.

## Tests

```bash
for t in sandbox/hako/tests/*.test.sh; do bash "$t" || exit 1; done
```
