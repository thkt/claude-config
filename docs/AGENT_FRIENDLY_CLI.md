# Agent-Friendly CLI Guidelines

Practical rules for CLIs that should work well for both humans and agents.

This document captures the input-contract and help-contract patterns now aligned
across `xr`, `sae`, and `notch` as of 2026-04-02. It is intentionally
opinionated. Prefer consistency over local cleverness.

[DR-0060](decisions/0060-adopt-agent-friendly-cli-design-principles.md) owns the
decision of what is mandatory. It defines three required axes (machine-readable
/ next step / self-discovery), and this document gives the concrete input, help,
and test shapes that satisfy them. When the two disagree, DR-0060 wins.

## Why

- Agents need predictable input contracts, not shortcuts they must guess.
- `--help` should be sufficient to discover the correct invocation pattern.
- A CLI should fail before auth or network calls when local input is invalid.
- The same command should work in direct invocation, pipelines, and scripts.

## Baseline

Use these as the default unless there is a strong, explicit reason not to.

1. Non-interactive first.
2. Canonical syntax before sugar.
3. `stdin` support for resource-like inputs.
4. Concrete `Examples:` in help.
5. Fail-fast local validation.
6. Test the help contract, not just the implementation.

## Canonical Input Contracts

### 1. Single input values

Use this pattern for IDs, URLs, screen names, search queries, and similar
single-value inputs.

#### Canonical form

```text
tool subcommand [ARG]
```

#### Behavior

- If `ARG` is present and not `-`, use it as-is.
- If `ARG` is `-`, read from `stdin` even when attached to a terminal.
- If `ARG` is omitted and `stdin` is piped, read from `stdin`.
- If `ARG` is omitted and `stdin` is a terminal, return a local error with a
  concrete fix.

#### Canonical error shape

```text
Missing <label>. Pass <PLACEHOLDER>, pipe it via stdin, or use `-` to read stdin interactively
```

#### Canonical empty-stdin shape

```text
No <label> provided. Pass <PLACEHOLDER>, pipe it via stdin, or use `-` to read stdin interactively
```

#### Recommended Rust shape

```rust
fn resolve_input(
    value: Option<String>,
    mut stdin: impl Read,
    stdin_is_terminal: bool,
    label: &str,
    placeholder: &str,
) -> Result<String, AppError> {
    match value {
        Some(value) if value != "-" => Ok(value),
        Some(_) => read_stdin_value(&mut stdin, label, placeholder),
        None if stdin_is_terminal => Err(format!(
            "Missing {label}. Pass {placeholder}, pipe it via stdin, or use `-` to read stdin interactively"
        ).into()),
        None => read_stdin_value(&mut stdin, label, placeholder),
    }
}
```

### 2. Long-form payloads

Use this pattern for post bodies, document content, prompts, or any input that
is naturally file-sized.

#### Canonical form

```text
tool subcommand --body "..."
tool subcommand --body-file draft.md
cat draft.md | tool subcommand --body-file -
```

#### Rules

- Support inline text only when it is realistically short.
- Support `--body-file <path>` for real content.
- Support `--body-file -` for `stdin`.
- Use `clap` `conflicts_with` for mutually exclusive payload inputs.

#### Best-of-best split

- Single value input: optional positional + `stdin` fallback.
- Long payload input: explicit `--body-file -`.

### 3. Shorthand forms

Shorthand is optional sugar, never the primary contract.

#### Rules

- The canonical syntax must appear in help.
- Shorthand may exist for backward compatibility.
- Do not require shorthand knowledge to use the tool.
- Do not let shorthand make parsing ambiguous.

#### Current example

- `sae "query"` may remain as compatibility sugar.
- The canonical form is still `sae search [QUERY]`.

## Help Contract

Every subcommand should have `Examples:` in `after_help`.

### Rules

- Use 2-4 examples per subcommand.
- Show the canonical direct invocation first.
- Include `stdin` examples whenever the command supports it.
- Include the `-` form whenever it is supported.
- Include one realistic flag combination when flags materially change behavior.

Root help should include operator-level information that affects automation, for
### example

- exit codes
- auth prerequisites
- output mode expectations

Example root addition. This shape mirrors `xr` as it stands today. New CLIs use
the group-specific sysexits.h subset from
[DR-0066](decisions/0066-cli-exit-code-policy-grouped-by-error-topology.md).

```text
Exit codes:
  1  Auth
  2  NotFound
  3  Transport
  4  Api
```

## Validation Order

Validate the cheapest, most local things first.

### Preferred order

1. Parse CLI args
2. Resolve input source
3. Validate local syntax or shape
4. Initialize auth/client
5. Make network or DB calls

### Examples

- Parse tweet ID before cookie extraction.
- Reject missing search query before opening a client.
- Reject conflicting payload flags at parse time.

## Error Contract

Agent-friendly errors should be concrete and actionable.

### Rules

- Say what is missing or invalid.
- Say how to fix it.
- Avoid generic "invalid input" without context.
- Prefer stable wording for common operator errors.

### Good

```text
Missing tweet ID or URL. Pass ID_OR_URL, pipe it via stdin, or use `-` to read stdin interactively
```

### Bad

```text
invalid input
```

## Output Contract

### Rules

- Success output should be directly usable, not padded with narration.
- Warnings should go to `stderr`.
- Errors should go to `stderr`.
- If JSON mode exists, keep it stable and opt-in.

## Test Minimum Bar

Every CLI that adopts this guideline should test the contract, not only the
happy path.

### Required tests

1. Root help includes operator information, if defined.
2. Every subcommand includes `Examples:` in `after_help`.
3. Subcommands with `stdin` support show `stdin` examples in help.
4. Optional positional input parses as `None` when omitted.
5. `ARG` wins over piped `stdin`.
6. Omitted `ARG` reads piped `stdin`.
7. `-` reads `stdin` on a terminal.
8. Missing terminal input returns the canonical fail-fast error.
9. Local validation fails before auth/network for malformed identifiers.
10. Mutually exclusive payload flags fail at parse time.

### Nice-to-have tests

- Backward-compatible shorthand still parses.
- JSON/global flags do not break shorthand expansion.
- Every subcommand is covered by a help-content assertion.

## Canonical Examples

### Read-only resource CLI

```text
notch fetch https://notion.so/My-Page-abc123
echo "page-id" | notch fetch
notch fetch -
```

### Read-only search CLI

```text
sae search "keyword"
echo "keyword" | sae search
sae search -
```

### Mutation CLI with long payload

```text
sae create --name "Title" --body "Content"
sae create --name "Title" --body-file draft.md
cat draft.md | sae create --name "Title" --body-file -
```

## Adoption Checklist

Before calling a CLI "agent-friendly", verify all of the following.

- Commands use explicit subcommands.
- Canonical usage is visible in `--help`.
- Resource-like inputs support `[ARG]`, piped `stdin`, and `-`.
- Long-form content supports file input and `stdin` via `-`.
- Missing local input errors are actionable.
- Invalid local syntax fails before auth/network.
- Warnings and errors are separated from success output.
- Help examples are tested.
- `stdin` behavior is tested.
- Exit codes are documented if they are semantically meaningful.

## Current Reference Implementations

- `xr`: read-only X/Twitter CLI with root exit codes and broad optional-input
  support.
- `notch`: cleanest minimal pattern for resource input resolution.
- `sae`: same resource-input pattern for search, plus the best current pattern
  for long-form payload input via `--body-file -`.

## Decision Summary

Use this default unless there is a stronger domain-specific requirement:

- For single-value inputs, copy the `notch` / `xr` pattern.
- For long-form payloads, copy the `sae --body-file -` pattern.
- If shorthand exists, keep it secondary and undocumented as the primary path.
