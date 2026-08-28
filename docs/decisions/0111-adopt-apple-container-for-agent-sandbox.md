---
status: "accepted"
date: "2026-08-28"
decision-makers: thkt
---

# Adopt Apple container for agent sandbox

## Context and Problem Statement

`claude --dangerously-skip-permissions` and `codex --dangerously-bypass-approvals-and-sandbox` (agents.sh) run autonomously with no per-action approval, so the only backstop against a host-affecting mistake or a compromised dependency is the execution boundary around the process itself. OUTCOME.md's Behavior line requires the AI agent to run where the harness's gates cannot be bypassed by discretion, and this line asks the same of the execution boundary: the agent's own process must not be able to reach outside it. `.claude/workspace/research/2026-07-21-apple-container-claude-code-sandbox.md` investigated whether apple/container can host this boundary on this repository's host (macOS 26.5.2, Apple Silicon), and confirmed on the real release (container 1.1.0, not the 0.5.0 kernel config the research started from) that a hand-authored in-guest allowlist firewall is viable. Which sandbox runtime carries that boundary, and can the vendored devcontainer assets it requires be reconciled with OUTCOME.md's "fork や patch はしない" constraint?

## Decision Drivers

- The boundary must hold under both agents' permission-skipping flags, not only under ordinary use
- OUTCOME.md Constraints bar forking or patching Claude Code; the interpretation this DR adopts is that this bars modifying the agent binaries, not vendoring reference devcontainer assets the agents ship as documentation of their own trusted run shape. sandbox/hako/Dockerfile, init-firewall.sh, and entrypoint.sh are vendored copies of anthropics/claude-code's `.devcontainer/*`, adapted for apple/container's guest network and for the second agent; nothing here forks or patches the `claude` or `codex` binary itself
- The host already meets apple/container's macOS 26 + Apple Silicon requirement, so no host upgrade is a precondition

## Considered Options

- apple/container: VM-per-container via apple/containerization, with a hand-authored in-guest iptables/ipset firewall standing in for the native per-domain egress control apple/container does not have
- Docker Desktop / OrbStack devcontainer: shared-VM isolation, consumes `devcontainer.json` and the official CC firewall script closer to unchanged
- Host-side filtering proxy (`HTTPS_PROXY` into a `--internal` apple/container network): moves the egress chokepoint out of the guest kernel, sidestepping any guest firewall port entirely

## Decision Outcome

Chosen option: "apple/container", with the guest firewall adapted from anthropics/claude-code's `.devcontainer/init-firewall.sh` (sandbox/hako/init-firewall.sh), because it is the option native to this host that needs no separate hypervisor product and gives VM-per-container isolation stronger than either alternative's shared-VM or shared-kernel model. The research's central risk, that the guest kernel lacks `ipset hash:net` and so cannot reproduce the official firewall's CIDR allowlisting, did not hold on the release actually installed: `container 1.1.0`'s kata-containers-based guest kernel (`uname -r` 6.18.15) supports `hash:net`, `hash:ip`, and `iptables -A OUTPUT` without modification, confirmed by running each inside a live guest. The remaining porting axis, Docker-bridge assumptions (`127.0.0.11` DNS, a `/24` host network) not matching apple/container's vmnet gateway, is resolved in init-firewall.sh by reading the nameserver from `/etc/resolv.conf` and allowing only the single default-route gateway host.

### Consequences

- Good, because VM-per-container isolation holds even if the guest kernel (Linux) is fully compromised; the host macOS kernel and every other agent's guest are separate VMs
- Good, because the image, volumes, and firewall shape stay close to anthropics/claude-code's own devcontainer, so a future upstream change is a diff against a known baseline rather than a rewrite
- Bad, because apple/container has no native per-domain egress control, so correctness of the sandbox rests on a hand-maintained iptables/ipset script instead of a single `--internal` flag (see Accepted Constraints)
- Bad, because bind-mounted workspaces run over virtiofs, measured at roughly 1/4.7 the throughput of the guest's own rootfs/named-volume path; large working trees under `--live` pay this cost directly

### Confirmation

- `for t in sandbox/hako/tests/*.test.sh; do bash "$t" || exit 1; done` passes: entrypoint refuses to exec an agent when the firewall fails (T-008, T-017), the demoted user cannot run `iptables` (T-009), and the real init-firewall.sh reaches only the resolved allowlist (T-016, `init-firewall.sh` tests T-005/T-006)
- `container run --rm --cap-add NET_ADMIN alpine sh -c 'apk add ipset && ipset create t hash:net'` exits 0 on the pinned host release, confirming the kernel gap the research opened with does not apply

## Pros and Cons of the Options

### apple/container

VM-per-container via apple/containerization; no native per-domain egress allowlist, so the boundary needs a vendored in-guest firewall.

- Good, because isolation is VM-level per container, stronger than a shared-VM or shared-kernel model
- Good, because it is native to macOS 26 on Apple Silicon; no separate hypervisor product to install or license
- Bad, because it is pre-1.0 with breaking changes possible between minor versions, and the guest kernel a given release ships is not part of its documented interface (the research's own hash:net assumption broke between the docs it read and the release installed)
- Bad, because bind mounts run over virtiofs, well below the guest's own rootfs/volume throughput

### Docker Desktop / OrbStack devcontainer

Shared-VM isolation; consumes `devcontainer.json` directly, so the official CC firewall script needs little to no porting.

- Good, because the official CC firewall and devcontainer.json apply closer to unchanged, shrinking the vendored-and-adapted surface this DR accepts for apple/container
- Bad, because isolation is a shared VM across all containers on the host, not one VM per agent
- Bad, because Docker Desktop carries licensing terms for this scale of use, and OrbStack is a third product this repository would depend on beyond what macOS already ships

### Host-side filtering proxy

`HTTPS_PROXY` into a `container run --network` set to `--internal`, so egress filtering happens on the host, outside the guest kernel entirely.

- Good, because it sidesteps the guest-kernel firewall-porting axis (ipset support, DNS/host-network assumptions) altogether
- Bad, because it requires every agent CLI to honor proxy env vars for all of its egress, which the research left unverified for both `claude` and `codex`
- Bad, because a proxy that fails open or is bypassed by an agent ignoring `HTTPS_PROXY` has no second gate; the in-guest firewall's default-DROP policy has no such single point of failure

## More Information

### Accepted Constraints

Each item below is a limitation this decision accepts as the cost of the chosen option, not a defect the implementation missed. A future change that removes one should update this DR rather than leave it stale.

- **DNS トンネリング残余**: init-firewall.sh opens `udp/53` outbound/inbound to the resolved nameserver before any domain allowlist, so query content is not filtered. An agent process could exfiltrate data by encoding it into DNS queries even though the IP allowlist blocks every other outbound path. Filtering DNS payloads needs a resolving proxy, which this decision does not introduce
- **rotating IP のセッション中失効**: `init-firewall.sh` resolves each allowlisted domain once via `dig` at container start and adds those literal addresses to the `allowed-domains` ipset. A domain served by a CDN or load balancer that rotates its IPs mid-session can return addresses outside that snapshot later in the same run, and those requests are then dropped by the default-DROP OUTPUT policy until the container restarts and re-resolves
- **`--live` 時の workspace が信頼境界内**: `hako.sh`'s `resolve_workspace_src` mounts the host `$PWD` itself under `--live`, instead of the default throwaway clone under `$TMPDIR`. Any file the agent writes under `--live` lands directly on the host working tree, inside the agent's own trust boundary, by design for the case the agent's changes must land there directly
- **container のバージョン pin**: apple/container is pre-1.0 (`Available Data` row, research doc), and no script here pins or checks its version. The research's own `hash:net` finding reversed between the docs it read and the release actually installed, so an upgrade can change guest kernel behavior the firewall depends on without any signal from this repository's scripts
- **vendored 資産の agent 更新時 re-diff**: sandbox/hako/Dockerfile, init-firewall.sh, and entrypoint.sh are vendored from anthropics/claude-code's `.devcontainer/*` (Dockerfile header). When Claude Code's own devcontainer changes upstream, or when Codex's equivalent reference changes, this vendored copy does not follow automatically; reconciling it is a manual re-diff against the current upstream source, done at the point an agent's version bump is next taken

### Migration Strategy

The image already carries two agents (`agents.sh` AGENT_TABLE: claude, codex), added one at a time onto the same Dockerfile/entrypoint.sh/init-firewall.sh triple without changing any of the three. A third agent follows the same path; the procedure is recorded in `sandbox/hako/README.md` so it does not have to be re-derived from the source each time.

### Rollback Plan

Falling back to a Docker Desktop / OrbStack devcontainer reuses the same `Dockerfile`, `agents.sh`, `entrypoint.sh`, and `init-firewall.sh` largely unchanged, since the image is a standard OCI image and the firewall's remaining apple/container-specific piece is the vmnet gateway/DNS detection in init-firewall.sh (`RESOLV_CONF`, default-route gateway lookup). Only `hako.sh`'s `container run` invocation and volume commands are apple/container-CLI-specific and would need a `docker run`/`docker volume` equivalent.

### Success Criteria

- A non-allowlisted domain (`https://example.com`) stays unreachable from inside the guest, and the first allowlisted domain stays reachable, both verified by init-firewall.sh's own post-check on every run (T-004 through T-007)
- The demoted `node` user cannot run `iptables` after entrypoint.sh's demotion step (T-009), so a compromised agent process cannot reopen the firewall it started under
- Adding a second agent (codex) required no change to entrypoint.sh, hako.sh, or init-firewall.sh, only a new `agents.sh` row and Dockerfile install step; a third agent is expected to hold to the same shape (§ Migration Strategy)

### Reassessment Triggers

- An apple/container release drops or changes `ipset hash:net` support in its shipped guest kernel, invalidating the Confirmation check this DR recorded against `container 1.1.0`
- A host-side filtering proxy is verified to work for every onboarded agent's egress, removing the DNS-tunneling and rotating-IP constraints this DR currently accepts as residual
- `--live` usage becomes routine rather than the rare case hako.sh's own comment describes it as, which would call for revisiting whether the host working tree should sit inside the trust boundary by default
