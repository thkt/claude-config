---
session_id: 25dee4f3-1fc0-41c9-8eb1-971ee1d22e16
created: 2026-06-16
intent: Feature planning
domain: API
---

# Research: Slack Fetch Cap/Truncate and ADR-0003 Degradation Channel

## Prior research

None found for slack-fetch-cap-truncate slug.

## Key Findings

### Q1: fetch_message signature and cap detection metadata

| Finding | Evidence | Status |
|---------|----------|--------|
| `fetch_message()` returns bare `String` only | src/slack/client.rs:382 `pub async fn fetch_message(&self, slack_url: &SlackUrl) -> Result<String, SlackError>` | Confirmed |
| Four cap loci exist but only one surfaces to caller | src/slack/client.rs:334-339 (reply pages), src/slack/client.rs:412-416 (user lookups), src/slack/client.rs:199-209 (API response bytes), src/tools/query.rs:116 (output bytes) | Confirmed |
| Three caps produce `warn!()` only, zero JSON signal | src/slack/client.rs:334-339 `warn!(channel, ts, max_pages, "conversations.replies hit the page cap, thread truncated")`, src/slack/client.rs:413-416 `warn!(distinct_users, cap, "too many distinct user IDs; capping users.info lookups...")` | Confirmed |
| Fourth cap (output truncation) produces inline text only | src/markdown.rs:84 `write!(out, "\n\n(truncated: showing {end} / {total} bytes)")`, src/tools/query.rs:116 applies to returned String | Confirmed |
| No programmatic metadata returned | `fetch_message` return type is `Result<String, SlackError>` with no cap-signal wrapper | Confirmed |

**Implication for (1)**: A signature change to `fetch_message()` must return a wrapper struct containing both the rendered String *and* cap-detection metadata (three internal bools for reply/user/response caps, plus optional truncation byte counts). The fourth locus (output-byte truncation) occurs *after* `fetch_message()` returns in `truncate_with_note()`, so it requires separate handling (see advisor note).

---

### Q2: into_markdown blast radius — generic vs Slack-local

| Finding | Evidence | Status |
|---------|----------|--------|
| `into_markdown()` unconditionally drops notes | src/envelope.rs:127-129 `pub(crate) fn into_markdown(self) -> String { self.markdown }` | Confirmed |
| `repo_overview` manually appends degradation notes to markdown string *before* `CommandOutput::with_degradation()` | src/tools/repo.rs:195-198 `if !degradation.is_empty() { markdown.push_str("\n> **Note:** "); markdown.push_str(&degradation.notes().join(". ")); markdown.push_str(".\n"); }` then calls `CommandOutput::with_degradation()` | Confirmed |
| Both paths use `with_degradation()` so notes still reach JSON via `into_envelope()` | src/envelope.rs:133-140 `into_envelope()` moves `self.notes` and `self.degraded_reasons` to JSON | Confirmed |
| No reusable markdown-note-append helper exists | repo.rs 195-198 is the only location; no helper function | Confirmed |
| `fetch_slack()` uses `CommandOutput::ok()` (no degradation) | src/tools/query.rs:121 `Ok(CommandOutput::ok(markdown, data))` | Confirmed |

**Implication for (2)**: Two design options exist:

- **Option A (generic markdown rendering)**: Modify `into_markdown()` to append notes from `self.notes` generically. *Blast radius*: Would double-render notes in `repo_overview` (already appended to markdown string + notes in degradation) unless you also strip repo.rs:195-198. That creates cross-module coupling and requires modifying repo.rs as part of the Slack fix.

- **Option B (Slack-local pattern)**: Have `fetch_slack()` mirror the repo_overview pattern: append notes to markdown manually, then call `with_degradation()`. *Blast radius*: Zero to other commands. Precedent exists (repo_overview pattern). No coupling. Replicates ~3 lines of code inline.

**Recommendation**: Option B. It's the lower-risk path, follows existing precedent, and incurs minimal code duplication at callsite (not in a helper anyway). Generic rendering (Option A) would require surveying all existing `CommandOutput::with_degradation()` callers to check whether they already append notes manually — that's the real scope of "generic A". Option B scopes to Slack only.

---

### Q3: msg.user=None (no-author) handling

| Finding | Evidence | Status |
|---------|----------|--------|
| msg.user=None falls back to `"(no author)"` literal | src/slack.rs:258-266 `None => { debug!("msg.user is None, falling back to \"(no author)\""); "(no author)".into() }` | Confirmed |
| no-author messages consume zero user-lookup slots | src/slack/client.rs:401-405 author-collection loop: `if let Some(uid) = &msg.user && seen.insert(uid.clone()) { authors.push(uid.clone()); }`, so None is skipped | Confirmed |
| SF-4 does not exist in codebase | grep -rn "SF-4" src/ docs/ returns empty | Confirmed |
| ADR-0003 precedent: "README 404 is not degraded" | docs/decisions/0003...md:61 "「README が存在しない repo」は scout として degraded ではない (overview は他フィールドだけで成立)" | Reference |

**Implication for (3)**: No-author is handled gracefully (fallback literal, no slot consumption, zero error). It does *not* degrade the output in the ADR-0003 sense. Parallel: README 404 is not degraded because "overview still works without README." Similarly, Slack messages without author still render legibly with `"(no author)"` literal, and notes can still be fetched (reply_count is separate from user.user). 

**Recommendation**: Do not route msg.user=None through the degradation channel. It is not a cap that requires signaling—it's a graceful fallback. If the issue comments cite an external spec that disagrees (SF-4 was possibly a working reference you're using), provide that spec and re-evaluate. But absent that, the codebase pattern is: degradation = partial functionality loss; no-author = complete message legible with fallback string.

---

### Q4: ADR-0003 degradation channel contract

| Finding | Evidence | Status |
|---------|----------|--------|
| `DegradedReason` enum has 9 typed variants | src/envelope.rs:15-25 `IssuesFetchFailed`, `PullsFetchFailed`, `ReleasesFetchFailed`, `ReadmeFetchFailed`, `ReadmeBlobFetchFailed`, `ReadmeDecodeFailed`, `UrlFetchFailed`, `ReadabilityFallback`, `BraveSearchFailed` | Confirmed |
| Slack has no existing variants | Enum is closed and domain-specific (GitHub, fetch, readability, search); no Slack variant | Confirmed |
| `Degradation::push(message, reason)` enforces (notes[i], reasons[i]) pairing | src/envelope.rs:59-62 `pub fn push(&mut self, message: String, reason: DegradedReason) { self.notes.push(message); self.reasons.push(reason); }` | Confirmed |
| JSON serialization omits empty `degraded_reasons` | src/envelope.rs has `#[serde(skip_serializing_if = "Vec::is_empty")]` pattern per ADR-0003 Note 2026-05-13 | Confirmed |
| `repo_overview` is the exemplar of the degradation path | src/tools/repo.rs:220 `CommandOutput::with_degradation(markdown, data, degradation)` with 4 distinct `DegradedReason` variants pushed at lines 177, 180, 183, and spread through error handlers | Confirmed |

**Implication**: Slack caps (reply pages, user lookups, response bytes) are *new* failure modes. They require either:
1. New `DegradedReason` variants (e.g., `SlackReplyCapHit`, `SlackUserLookupCapped`, `SlackResponseTooBig`)
2. Or reuse existing variants if they fit semantically

Since Slack API response-too-large already bubbles `SlackError::Decode("response too large")`, it's arguably a response problem similar to `UrlFetchFailed` (generic fetch error). Reply cap and user-lookup cap are Slack-specific behavioral artifacts (not failures, but truncations). *New* variants or overloaded semantics?

**Recommendation**: If this is a follow-up to issue #222, check whether the issue specifies which variants to use or whether new ones are required. The architecture supports either path (DegradedReason is an open-for-extension enum if variants are added). For now, map:
- Reply-page cap → new `SlackReplyThreadTruncated` variant (Slack-specific, describes degraded-because-truncated, not a fetch error)
- User-lookup cap → new `SlackUserLookupCapped` variant (same reasoning)
- Response-size limit → reuse `UrlFetchFailed` (generic "fetch limit hit")
- Output-byte truncation → new `OutputTruncated` variant (generic, could apply to any command)

But validate these names against issue #222 requirements before implementation.

---

### Q5: Output-byte truncation (fourth cap locus)

| Finding | Evidence | Status |
|---------|----------|--------|
| `truncate_with_note()` returns `Cow<'_, str>` | src/markdown.rs:76 `pub(crate) fn truncate_with_note(s: &str, max_bytes: usize) -> Cow<'_, str>` | Confirmed |
| Already emits inline note on truncation | src/markdown.rs:84 `write!(out, "\n\n(truncated: showing {end} / {total} bytes)")` | Confirmed |
| `Cow::Borrowed` = no truncation, `Cow::Owned` = truncated | src/markdown.rs:78 `Cow::Borrowed(s)` if fits, src/markdown.rs:85 `Cow::Owned(out)` if truncated | Confirmed |
| Applied after `fetch_message()` returns | src/tools/query.rs:116 `let markdown = truncate_with_note(&output, MAX_FETCH_OUTPUT_BYTES).into_owned()` | Confirmed |
| Currently only signals via markdown inline text | No programmatic return or degradation path | Confirmed |

**Implication**: The fourth cap (output-byte truncation) is orthogonal to `fetch_message()` signature. It's applied downstream in query.rs. To route it through ADR-0003 degradation, you have two paths:
1. Return a flag from `truncate_with_note()` and wire that into `Degradation::push()` in fetch_slack
2. Split `truncate_with_note()` into a version that returns `(Cow, bool)` for "was truncated"

Option 2 is cleaner and mimics the pattern for the three internal caps (return metadata alongside the string).

---

## Audit trail

**Phase 3 searches (explorer-feature):**
- Entry points: src/tools/query.rs:94-122, src/slack/client.rs:382-447
- Execution flow: traced from URL routing → fetch → cap detection → output
- All four cap loci identified and located
- Cross-method verification: grep confirmed warn!() locations and signature

**Phase 5 advisor checkpoint:**
- Confirmed repo.rs:195-198 manual note append (blast radius decision)
- Confirmed SF-4 does not exist in codebase (no-author decision)
- Identified need for programmatic truncation signal (fourth locus)

---

## Constraints

- DegradedReason enum is extensible (additive variants); no breaking changes
- `into_markdown()` is a production boundary (used in lib.rs:163); generic modification affects all commands
- `truncate_with_note()` is shared by fetch_slack; changes here must not regress other callers (only fetch_slack uses it currently per grep)
- Slack timeout and API rate-limit handling already in place; focus on partial-success caps only

---

## Next Steps

1. **Validate variant names against issue #222**: Confirm whether `SlackReplyThreadTruncated`, `SlackUserLookupCapped`, `OutputTruncated` are acceptable or if issue specifies different names/variants.

2. **Implement fetch_message signature change** (Point 1):
   - Define a wrapper struct (e.g., `FetchedMessage { markdown: String, reply_cap_hit: bool, user_lookup_capped: bool, response_size_limit_hit: bool }`)
   - Return `Result<FetchedMessage, SlackError>` from fetch_message
   - Update all callers in fetch_slack to unpack the struct and route caps to degradation

3. **Wire caps into degradation** (Points 1 & 2):
   - Add variants to DegradedReason enum (or reuse UrlFetchFailed for response-size)
   - In fetch_slack, after unwrap of fetch_message result, call `degradation.push(message, reason)` for each cap that hit
   - Append notes to markdown manually (Option B pattern from repo_overview:195-198)
   - Call `CommandOutput::with_degradation()` instead of `::ok()`

4. **Handle output-byte truncation** (Point 2 continuation):
   - Modify `truncate_with_note()` to return `(Cow, bool)` or add a sibling function `truncate_with_signal()`
   - In fetch_slack, check the truncation flag and push to degradation if hit

5. **Test coverage**:
   - Unit test: fetch_message with each cap scenario and verify metadata returned
   - Integration test: fetch_slack with degradation hit, verify `--json` output contains typed reasons and notes

---

## Coverage check

| Question | Answer | Verification |
|----------|--------|--------------|
| Where does fetch_message return metadata? | Signature change required; wrapper struct or tuple return | src/slack/client.rs:382 read |
| Is into_markdown_blast_radius generic or local? | Local (Option B pattern) to avoid double-render in repo_overview | src/tools/repo.rs:195-198 read |
| Should no-author route through degradation? | No, it's a graceful fallback not a partial-failure | src/slack.rs:258-266 read + ADR-0003 precedent |
| What variants are needed? | Depends on issue #222 spec; recommend SlackReplyThreadTruncated, SlackUserLookupCapped, OutputTruncated | src/envelope.rs:15-25 variants identified |
| How to signal output truncation? | Return boolean from truncate_with_note or sibling function | src/markdown.rs:76-86 structure confirmed |
