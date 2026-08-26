# Research: apple-container-claude-code-sandbox

Generated: 2026-07-21
Session: 61c2adce-224b-4a57-89ae-bbdcf2650e5c
Intent: Understanding
Domain: Infrastructure
Prior research: none found

## Purpose

Investigate whether apple/container can host Claude Code (CC) plus a working repository inside a container-internal Linux VM so that bypassPermissions autonomous execution cannot affect the host (a devcontainer-equivalent sandbox), across macOS/Silicon requirements, egress control, volume mount mechanism and performance, image composition, and comparison with Docker/OrbStack devcontainers.

## Verdict

Feasible on macOS 26 + Apple Silicon, and the VM-per-container isolation is stronger than a shared-VM Docker/OrbStack setup. But for this specific goal apple/container is currently the highest-effort and lowest-bind-mount-performance option, because it is not a Dev Containers runtime (no `devcontainer.json`) and the official CC egress firewall does not port unchanged. The central tension: the only native egress lever (`--internal`) is host-only, so CC cannot reach `api.anthropic.com` under it, which makes an in-guest allowlist firewall mandatory, and that is exactly the piece needing adaptation.

## Key Findings

| Priority | Finding                                                                                                                                                                                                                                                                                                                                                                 | Source                                                                                                                                                                                                                             | Next Action                                                                                                                                                                    |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| High     | Requires macOS 26 and an Apple Silicon Mac. macOS 15 runs it with degraded networking (no container-to-container, `container network` commands unavailable, IP-assignment race). Host here is macOS 26.5.2 / arm64, so the requirement is met                                                                                                                           | apple/container README (repo-overview) + docs/technical-overview.md:61-75                                                                                                                                                          | none, requirement satisfied                                                                                                                                                    |
| High     | Native egress control is coarse and all-or-nothing. `container network create --internal` = "Restrict to host-only network", and networks are mutually isolated, but there is no native per-domain egress allowlist. Under `--internal` CC cannot reach `api.anthropic.com`, so `--internal` alone cannot host CC                                                       | cmdref.md:786 (`--internal`), how-to.md:326 (isolated networks); grep for egress/firewall/allowlist found only `--internal`                                                                                                        | Decide egress model: in-guest allowlist (below) or host-side proxy                                                                                                             |
| High     | Fine-grained egress must run inside the guest via iptables/nftables, which needs `--cap-add NET_ADMIN`. The default cap set excludes NET_ADMIN (it grants NET_RAW and NET_BIND_SERVICE only). The official CC devcontainer already adds it via runArgs                                                                                                                  | how-to.md:475-478 (default caps), anthropics/claude-code .devcontainer/devcontainer.json runArgs `--cap-add=NET_ADMIN`                                                                                                             | Add `--cap-add NET_ADMIN` on `container run`                                                                                                                                   |
| High     | The guest kernel supports netfilter/iptables/ipset, so an in-guest allowlist firewall is viable in principle. Verified in the default kernel config: NETFILTER, NF_TABLES, NETFILTER_XTABLES, IP_NF_IPTABLES/FILTER/TARGET_REJECT, IP_SET, XT_MATCH_STATE/CONNTRACK/SET, VETH, BRIDGE all `=y`                                                                          | apple/containerization kernel/config-arm64 (lines 1070-1256, 1321-1330)                                                                                                                                                            | none, capability confirmed                                                                                                                                                     |
| High     | The official CC `init-firewall.sh` will not run unchanged. It calls `ipset create allowed-domains hash:net`, but the default kernel config has `# CONFIG_IP_SET_HASH_NET is not set` (only HASH_IP=y). GitHub CIDR ranges need hash:net, so the create step is expected to fail                                                                                         | anthropics/claude-code .devcontainer/init-firewall.sh:39 (`hash:net`); apple/containerization kernel/config-arm64:1253 (`# CONFIG_IP_SET_HASH_NET is not set`). Failure itself is inferred, requires runtime check                 | Run `container run --rm --cap-add NET_ADMIN alpine sh -c 'apk add ipset && ipset create t hash:net'` to confirm; then port to nft sets or supply a custom kernel with HASH_NET |
| High     | The firewall script also bakes in Docker-bridge assumptions beyond hash:net. It greps `iptables-save` for Docker's embedded DNS at `127.0.0.11` and derives the host network from the default route. On vmnet (192.168.64.x) these differ, so porting is multi-axis, not one line                                                                                       | anthropics/claude-code .devcontainer/init-firewall.sh:8, 116-120                                                                                                                                                                   | Rewrite DNS/host-network handling for vmnet when porting                                                                                                                       |
| High     | apple/container is not a Dev Containers runtime. It does not consume `devcontainer.json`; the official CC sandbox that "just works" targets VS Code Dev Containers over Docker. Apple's own VS Code path is Remote-SSH into a persistent `container machine`, not Dev Containers. "devcontainer equivalent" here means hand-replicating run-args, mounts, and postStart | apple/container examples/container-machine-vscode/README.md (Remote-SSH flow); absence of any devcontainer.json handling in cmdref.md                                                                                              | Hand-author a run script instead of reusing devcontainer.json                                                                                                                  |
| High     | Bind-mounted repos are slow. Model is 1:1 container:VM. Bind mounts use virtiofs (~3x slower than the virtioblk named-volume path, which is ~2-3x slower than native, so bind mounts land ~6-9x below native). Heavy-I/O users report 7-14x slower random r/w and image pulls of 5+ min vs 20-30s bare metal                                                            | apple/container discussion #1516 (maintainer jglogan benchmarks)                                                                                                                                                                   | For build/test-heavy repos, prefer a named volume for hot paths (node_modules, .build) over bind mount                                                                         |
| Medium   | Docker-compatible volumes exist. `container volume create`, `-v name:/path`, anonymous `-v /path`. So the devcontainer's named-volume mounts for `/home/node/.claude` and history map cleanly, and named volumes ride the faster virtioblk path                                                                                                                         | cmdref.md:858-996                                                                                                                                                                                                                  | Use named volume for `~/.claude` config persistence                                                                                                                            |
| Medium   | Image composition is straightforward. CC runs on `node:20` + `npm i -g @anthropic-ai/claude-code`, plus iptables/ipset/iproute2/dnsutils for the firewall. apple/container consumes standard OCI images, so the existing CC Dockerfile builds and runs directly                                                                                                         | anthropics/claude-code .devcontainer/Dockerfile:1-90; docs/technical-overview.md:32 (OCI)                                                                                                                                          | Reuse the CC Dockerfile, add `hash:net`-free firewall or custom kernel                                                                                                         |
| Medium   | Credential import needs a deliberate choice. On Linux CC has no macOS Keychain, so options are: authenticate once inside the guest with `CLAUDE_CONFIG_DIR` on a persistent named volume (devcontainer pattern), pass `ANTHROPIC_API_KEY` via `--env`, or bind-mount host `~/.claude`. Host macOS Keychain credentials cannot be bind-mounted into Linux                | anthropics/claude-code devcontainer.json (`CLAUDE_CONFIG_DIR=/home/node/.claude` on a volume); inferred from CC storing creds in Keychain on macOS vs file on Linux, requires confirmation of the on-disk `.credentials.json` path | Pick API key env for autonomous runs, or pre-auth into a named volume                                                                                                          |
| Medium   | "No host impact" holds only outside the mounted workspace and forwarded sockets. VM isolation is strong, but the bind-mounted workspace is writable by design, and `--ssh` forwards the host SSH agent socket into the guest. Under bypassPermissions, agent actions can rewrite mounted repo files and use forwarded host SSH keys                                     | how-to.md:36-58 (writable `--volume`), how-to.md:256-300 (`--ssh` forwards `SSH_AUTH_SOCK`)                                                                                                                                        | Mount only the target repo; omit `--ssh` unless private-repo clone is required                                                                                                 |
| Low      | Memory is not released back to the host. Freed guest pages are not relinquished (partial ballooning), so long-lived autonomous containers may need periodic restart under memory-intensive work                                                                                                                                                                         | docs/technical-overview.md:55-59                                                                                                                                                                                                   | Restart container between long autonomous sessions if RSS climbs                                                                                                               |
| Low      | apple/container is pre-1.0 with breaking changes possible between minor versions, and 458 open issues. Stability is guaranteed only within patch versions                                                                                                                                                                                                               | repo-overview (Project Status, open issues 458)                                                                                                                                                                                    | Pin a specific release; expect churn                                                                                                                                           |

## Available Data

| Type   | Item                                                                                   | Note                                                  |
| ------ | -------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Tech   | apple/container 0.4.x, Swift, Apache-2.0, 48k stars                                    | VM-per-container via apple/containerization package   |
| Config | Default guest kernel config-arm64 (containerization 0.5.0)                             | netfilter full, ipset hash:net absent                 |
| Config | Default Linux caps                                                                     | NET_RAW + NET_BIND_SERVICE present, NET_ADMIN absent  |
| File   | anthropics/claude-code .devcontainer (Dockerfile, devcontainer.json, init-firewall.sh) | Reference image + egress model to port                |
| Env    | Host macOS 26.5.2, arm64, no local `container` CLI                                     | Requirement met; runtime checks not executed locally  |
| Tech   | `container network create --internal`, `container volume create`                       | Native host-only network + Docker-style named volumes |

## Constraints

| Category    | Constraint                                                                                                                  |
| ----------- | --------------------------------------------------------------------------------------------------------------------------- |
| Technical   | macOS 26 + Apple Silicon required for full functionality                                                                    |
| Technical   | Default kernel lacks CONFIG_IP_SET_HASH_NET; CIDR allowlist via ipset hash:net needs a custom kernel or an nftables rewrite |
| Technical   | No native per-domain egress allowlist; only host-only (`--internal`) or in-guest netfilter                                  |
| Technical   | Bind mounts are ~6-9x slower than native (virtiofs)                                                                         |
| Operational | Pre-1.0, breaking changes between minor versions; pin a release                                                             |
| Security    | Writable workspace mount and any `--ssh` forwarded socket are inside the trust boundary under bypassPermissions             |

## Disconfirmation Check

Claim under test: apple/container has no native fine-grained (per-domain) egress control.

Command: `grep -niE 'egress|firewall|--internal|no-internet|isolate|block.*(outbound|internet)|offline' cmdref.md how-to.md`

Raw output:

```
cmdref.md:599:  596 Saves an image to a tar archive on disk. Useful for exporting images for offline transport.
cmdref.md:780:  777 container network create [--internal] [--label <label> ...] [--option <option> ...] [--plugin <plugin>] [--subnet <subnet>] [--subnet-v6 <subnet-v6>] [--debug] <name>
cmdref.md:789:  786 *   `--internal`: Restrict to host-only network
how-to.md:305:  302 ## Create and use a separate isolated network
how-to.md:326:  323 The `foo` network, the default network, and any other networks you create are isolated from one another. A container on one network has no connectivity to containers on other networks.
```

Cross-check: the only egress-affecting option is `--internal` (host-only, all-or-nothing), and network-to-network isolation is lateral, not egress. Non-zero hits confirm the grep matched the network surface, so 0-hit tool misuse is ruled out. No native per-domain allowlist exists, which is why the in-guest iptables model is required.

Second claim (kernel netfilter support): verified positively against apple/containerization kernel/config-arm64 (`CONFIG_NETFILTER=y`, `CONFIG_IP_NF_IPTABLES=y`, `CONFIG_IP_SET=y`, `CONFIG_NETFILTER_XT_MATCH_STATE=y`), and the one absent symbol (`# CONFIG_IP_SET_HASH_NET is not set`) is the load-bearing gap.

## References

| Path                                                                                     | Description                                                                    |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| github.com/apple/container docs/technical-overview.md                                    | VM-per-container model, macOS 15 limits, memory ballooning                     |
| github.com/apple/container docs/how-to.md                                                | Volumes, --ssh, caps, isolated networks, publish                               |
| github.com/apple/container docs/command-reference.md                                     | `volume create`, `network create --internal`                                   |
| github.com/apple/container docs/container-machine.md + examples/container-machine-vscode | Persistent Linux env, Remote-SSH VS Code path                                  |
| github.com/apple/containerization kernel/config-arm64 (0.5.0)                            | Guest kernel netfilter/ipset config                                            |
| github.com/anthropics/claude-code .devcontainer/\*                                       | CC Dockerfile, devcontainer.json runArgs/mounts, init-firewall.sh egress model |
| github.com/apple/container/discussions/1516                                              | Bind-mount (virtiofs) vs named-volume (virtioblk) benchmarks                   |
| orbstack.dev/blog/fast-filesystem                                                        | OrbStack 75-95% native FS perf, comparison baseline                            |

## 実機検証 (2026-07-21 追記)

container 1.1.0 を本機にインストールして検証した結果、hash:net 非対応の推測は棄却。

- 初回 `container system start` が取得する default kernel は kata-containers 3.28.0 の static kernel (guest `uname -r` = 6.18.15)。本文が参照した apple/containerization の `kernel/config-arm64` (0.5.0) とは別物で、そちらの `# CONFIG_IP_SET_HASH_NET is not set` は現行リリースに適用されない
- `container run --rm --cap-add NET_ADMIN alpine` 内で `ipset create hash:net` / `hash:ip` / `iptables -A OUTPUT` すべて exit=0
- 帰結: 公式 init-firewall.sh の guest 内移植から kernel 制約が消える。残る移植軸は Docker-bridge 前提 (127.0.0.11 DNS、default route) のみ

同日の追加検証で残りの未知項目も解消:

| 項目                       | 結果                                                                                                                             |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| guest ネットワーク構成     | DNS・default route とも vmnet gateway (192.168.64.1) 直指し。127.0.0.11 問題は「gateway 宛て udp/53 許可」への置換で済む         |
| allowlist firewall 実効性  | ipset + iptables OUTPUT DROP 構成で api.anthropic.com のみ疎通 (http 404)、example.com は timeout 遮断。移植方式は成立           |
| `--internal` ネットワーク  | 外部は直 IP でも遮断、gateway 上の host リスナー (:8899) には到達可。host 側 proxy fallback の前提成立                           |
| bind mount (virtiofs) 性能 | 順次書込 449MB/s vs named volume/rootfs 2.1GB/s (約 1/4.7)。2000 小ファイル作成は 0.89s vs 0.33s (約 2.7 倍) で git 作業は実用圏 |
| CC 起動                    | node:20 guest (arm64) に `npm i -g @anthropic-ai/claude-code` で 2.1.197 が正常起動                                              |

未検証で残るのは認証情報の永続化 (named volume の `CLAUDE_CONFIG_DIR` に事前ログイン) の実運用確認のみ。

## Coverage Notes

- ~~Unknown: whether `ipset create ... hash:net` actually fails on the shipped release kernel.~~ → 実機検証で解消 (上記)。hash:net は動作する。
- Unknown: CC's exact on-disk credential path and whether a pre-authenticated `~/.claude` from macOS is portable into Linux. Close it by inspecting `CLAUDE_CONFIG_DIR` contents after a Linux `claude` login, or default to `ANTHROPIC_API_KEY`.
- Candidate not tested: a host-side filtering proxy (CC via `HTTPS_PROXY`) on a locked or `--internal` network, moving the egress chokepoint out of the guest kernel and sidestepping the hash:net gap. Requires verification that a container on `--internal` can still reach a host proxy and that CC honors proxy env for all egress.
- Tool disagreement: none. scout fetch returned empty on several GitHub/blog URLs; those points were re-sourced via WebFetch and direct repo-read of primary files.
- Advisor: invoked; flagged lead-with-verdict, the `--internal` central tension, hedging the hash:net inference, the broader Docker-bridge assumptions in the firewall script, the not-a-devcontainer-runtime delta, and scoping "no host impact". All integrated above.

## Next Steps

| Intent             | Next Command |
| ------------------ | ------------ |
| Understanding only | complete     |
