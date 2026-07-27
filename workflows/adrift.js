export const meta = {
  name: "adrift",
  description:
    "Deterministic workflow that scans for drift between DR Decision Outcomes and the current code. Per DR, it pipelines symbol extraction -> reference search -> semantic matching by manifest-routed reviewers, and writes a report with file:line + fix direction + priority to docs/audit/. Exhaustive per-DR listing and the reviewer routing table are enforced by the script.",
  whenToUse:
    'When you want to check DR-code consistency or surface decayed decisions. For repositories without DRs, run census first. args is a DR directory path string, a DR id list string (e.g. "0061, 0073"), or {dir, repo, focus}. focus is an array or string of ids / keywords narrowing the target DRs. When omitted, every DR under docs/decisions/ is in scope.',
  phases: [{ title: "Detect" }, { title: "Scan" }, { title: "Report" }],
};

// Four design points.
// 1. The manifest -> reviewer routing table becomes a script constant. Letting the LLM choose
//    lets it skip reviewer routing; the workflow looks it up mechanically from the manifest verdict.
// 2. Per-DR extract -> search -> review runs through pipeline() independently (the slowest DR
//    does not block the rest). An extract stall is recorded as unverifiable so it never drops
//    out of the exhaustive Per-DR listing (fail-close).
// 3. Finding dedup, priority merge, and Summary counts are computed by the script.
// 4. No external assets. External DR references are classified by a raw agent search + a
//    script set difference, and the report structure is embedded in the Report prompt.
//
// H-priority findings cannot be confirmed for /issue filing (interactive) mid-workflow, so they
// are recorded in the report's Follow-up Issue Candidates and the return value for human triage.

const isIdList = (s) => {
  const tokens = s.split(/[\s,]+/).filter(Boolean);
  return tokens.length > 0 && tokens.every((t) => /^(a?dr-?)?\d+$/i.test(t));
};

const parseArgs = () => {
  if (typeof args === "string") {
    try {
      const parsed = JSON.parse(args);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // a non-JSON string is shorthand: an id list like "0061" or
      // "DR-0061, 0073" means focus, anything else means dir
    }
    return isIdList(args) ? { focus: args } : { dir: args };
  }
  return args && typeof args === "object" ? args : {};
};
const opts = parseArgs();
const dir = typeof opts.dir === "string" ? opts.dir.trim() : "";
const repo = typeof opts.repo === "string" ? opts.repo : "";

// focus is a list of ids ("0061" / "DR-0061") or keywords, accepted as array or string.
// Ids match numerically; non-numeric tokens substring-match against file name / title.
const focus = (Array.isArray(opts.focus) ? opts.focus : String(opts.focus || "").split(/[\s,]+/))
  .map((t) =>
    String(t)
      .trim()
      .replace(/^a?dr-?/i, ""),
  )
  .filter(Boolean);
const matchesFocus = (a) =>
  focus.some((t) =>
    /^\d+$/.test(t)
      ? parseInt(t, 10) === parseInt(a.id, 10)
      : `${a.file} ${a.title}`.toLowerCase().includes(t.toLowerCase()),
  );

const anchor = (p) =>
  repo
    ? `Run every git / file / search command from the ${repo} repository (start each shell command with \`cd ${repo} && \`).\n\n${p}`
    : p;

// Routing table that looks up reviewer subagents mechanically from the manifest verdict.
const REVIEWERS = {
  rust: ["reviewer-rust", "reviewer-design"],
  ts: ["reviewer-design"],
  tsx: ["reviewer-react-pattern"],
  other: ["reviewer-design"],
};

// Criteria embedded into reviewer prompts (kept as plain string consts because guardrails
// sqli-concat false-positives on keyword words inside interpolated template call arguments).
const DIRECTION_RULES =
  "code-fix when the DR is the correct current contract and the code has drifted / " +
  "dr-update when the code is the correct current contract and the DR is stale / " +
  "accept when the drift is trivial, already marked deprecated in a comment, or documented";
const PRIORITY_RULES =
  "H when it affects a public API or 2+ downstream consumers / " +
  "M when it affects an internal API with 1 downstream consumer / " +
  "L when it is comment / docstring only, or an invalid reference";
const PRIORITY_RANK = { H: 3, M: 2, L: 1 };

const DETECT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["found", "dr_dir", "drs", "manifest", "dr_refs"],
  properties: {
    found: { type: "boolean" },
    dr_dir: { type: "string" },
    drs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "file", "title"],
        properties: {
          id: { type: "string" },
          file: { type: "string" },
          title: { type: "string" },
        },
      },
    },
    manifest: { type: "string", enum: ["rust", "ts", "tsx", "other"] },
    dr_refs: {
      type: "array",
      description:
        "Raw list of decision-record references (legacy A-prefixed and DR-NNNN) found outside the DR directory (the script classifies them)",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["file", "line", "id"],
        properties: {
          file: { type: "string" },
          line: { type: "number" },
          id: { type: "string", description: "NNNN (4 digits)" },
        },
      },
    },
    reason: { type: "string" },
  },
};

const EXTRACT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["status", "verifiable", "outcome_text", "symbols", "candidates"],
  properties: {
    status: { type: "string", description: "Accepted / Superseded etc." },
    superseded_by: { type: "string" },
    verifiable: { type: "boolean", description: "false for prose-only DRs" },
    outcome_text: {
      type: "string",
      description: "Decision Outcome section body",
    },
    symbols: { type: "array", items: { type: "string" } },
    candidates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["symbol", "file", "line"],
        properties: {
          symbol: { type: "string" },
          file: { type: "string" },
          line: { type: "number" },
        },
      },
    },
    notes: { type: "string" },
  },
};

const FINDINGS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["findings"],
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["file", "line", "summary", "direction", "priority"],
        properties: {
          file: { type: "string" },
          line: { type: "number" },
          summary: { type: "string" },
          direction: {
            type: "string",
            enum: ["code-fix", "dr-update", "accept"],
          },
          priority: { type: "string", enum: ["H", "M", "L"] },
        },
      },
    },
  },
};

const REPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["written", "report_path"],
  properties: {
    written: { type: "boolean" },
    report_path: { type: "string" },
  },
};

const mergeFindings = (lists) => {
  const map = new Map();
  for (const f of lists.flat()) {
    const k = `${f.file}:${f.line}`;
    const prev = map.get(k);
    if (!prev || PRIORITY_RANK[f.priority] > PRIORITY_RANK[prev.priority]) map.set(k, f);
  }
  return [...map.values()].sort(
    (a, b) =>
      PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] ||
      String(a.file).localeCompare(String(b.file)) ||
      a.line - b.line,
  );
};

// ---- Detect: find the DR directory / manifest / DR references ----
phase("Detect");
const dirInstr = dir
  ? `The DR directory is "${dir}" (relative to the repository root). If it does not exist, return found: false and say why in reason.`
  : `Only docs/decisions/ is in scope as the DR directory. If it does not exist, return found: false.`;
const detect = (await agent(
  anchor(
    `You handle the Detect stage of adrift.\n` +
      `1. ${dirInstr}\n` +
      `2. List the NNNN-*.md files in the directory and record id (NNNN), file (relative path), and title (heading) in drs.\n` +
      `3. Decide the manifest verdict. rust if Cargo.toml exists. If package.json exists, tsx when *.tsx files exist, otherwise ts. Otherwise other.\n` +
      `4. Search the whole repository for decision-record references with \`ugrep -rniw '(A?DR)-[0-9]{4}'\` (this matches both the legacy A-prefixed form and the DR-NNNN form) and record the hits in dr_refs (file, line, id as 4-digit NNNN), excluding the DR directory itself, fixtures, and node_modules / target / dist / build / vendor. Do not classify against local DRs.\n` +
      `Do not analyze DR bodies. This stage's job is detection and listing only.`,
  ),
  {
    agentType: "general-purpose",
    phase: "Detect",
    label: "detect",
    model: "sonnet",
    schema: DETECT_SCHEMA,
  },
)) || {
  found: false,
  dr_dir: "",
  drs: [],
  manifest: "other",
  dr_refs: [],
  reason: "the detect agent returned no output",
};

if (!detect.found || !detect.drs.length) {
  return {
    stopped: "no-drs",
    why: detect.reason || "No DRs found, run /census first",
  };
}
// External-reference classification is a script set difference (referenced ids − local ids).
// The Detect agent searches, this code classifies.
const localIds = new Set(detect.drs.map((a) => parseInt(a.id, 10)));
const externalRefs = (() => {
  const byRef = new Map();
  for (const r of detect.dr_refs) {
    if (localIds.has(parseInt(r.id, 10))) continue;
    const ref = `DR-${String(r.id).padStart(4, "0")}`;
    if (!byRef.has(ref)) byRef.set(ref, []);
    byRef.get(ref).push(`${r.file}:${r.line}`);
  }
  return [...byRef.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ref, locations]) => ({ ref, locations }));
})();
// With focus set, the script narrows deterministically. The Detect agent always lists
// everything (listing is cheap, and returning `available` on a zero match needs the full list).
const targets = focus.length ? detect.drs.filter(matchesFocus) : detect.drs;
if (!targets.length) {
  return {
    stopped: "no-matching-drs",
    why: `no DR matches focus [${focus.join(", ")}]`,
    available: detect.drs.map((a) => `${a.id}: ${a.title}`),
  };
}
const reviewers = REVIEWERS[detect.manifest] || REVIEWERS.other;
log(
  `Detect: ${targets.length}/${detect.drs.length} DRs (${detect.dr_dir}${
    focus.length ? `, focus=${focus.join("+")}` : ""
  }), manifest=${detect.manifest} -> ${reviewers.join(" + ")}, external_refs=${externalRefs.length}`,
);

// ---- Scan: per DR, run extract -> reviewer matching independently ----
const perDr = await pipeline(
  targets,
  // stage 1: status / symbol extraction and reference search
  (a) =>
    agent(
      anchor(
        `You handle the extraction stage of adrift. Read DR ${a.file} and do the following.\n` +
          `1. Parse status from the front matter or opening section. If a superseded-by link exists, copy the successor DR id into superseded_by.\n` +
          `2. From the Decision Outcome section, extract code identifiers (function / type / module names, file paths) and bullet-level decisions, and copy the section body into outcome_text. For a prose-only DR with no identifiers, set verifiable: false and write "prose-only" in notes.\n` +
          `3. Search each symbol with \`ugrep -rn\`, excluding the DR files themselves and test fixtures, and record the hits in candidates (symbol, file, line).\n` +
          `Do not judge drift. This stage's job is extraction and search only.`,
      ),
      {
        agentType: "general-purpose",
        phase: "Scan",
        label: `extract:${a.id}`,
        model: "sonnet",
        schema: EXTRACT_SCHEMA,
      },
    ),
  // stage 2: semantic matching by routed reviewers
  async (ex, a) => {
    if (!ex) {
      // an extract stall stays in the Per-DR listing as unverifiable (fail-close)
      return {
        dr: a,
        status: "unknown",
        verifiable: false,
        note: "extract agent stall",
        findings: [],
      };
    }
    if (!ex.verifiable || !ex.candidates.length) {
      return {
        dr: a,
        status: ex.status,
        superseded_by: ex.superseded_by || "",
        verifiable: ex.verifiable,
        note: ex.verifiable
          ? "0 reference candidates (symbols no longer present in the code)"
          : ex.notes || "prose-only",
        // a verifiable DR with zero symbol hits is itself a drift signal
        findings: ex.verifiable
          ? ex.symbols.map((s) => ({
              file: a.file,
              line: 0,
              summary: `Symbol "${s}" from the Decision Outcome is not found in the code`,
              direction: "dr-update",
              priority: "M",
            }))
          : [],
      };
    }
    const reviewed = await parallel(
      reviewers.map(
        (rv) => () =>
          agent(
            anchor(
              `As ${rv}, judge semantic drift between the Decision Outcome of DR ${a.id} (${a.title}) and the current code. Look at the semantic gap between the decision and the implementation, not surface issues clippy or grep would catch.\n` +
                `The Decision Outcome is as follows.\n${ex.outcome_text}\n\n` +
                `The reference candidates (ugrep hits) are as follows.\n${JSON.stringify(ex.candidates)}\n\n` +
                `Pin each drift to file:line and assign direction and priority by these criteria.\n` +
                `The direction criteria are ${DIRECTION_RULES}.\n` +
                `The priority criteria are ${PRIORITY_RULES}.\n` +
                `If there is no drift, return findings: []. Do not edit the DR body or fix the code.`,
            ),
            {
              agentType: rv,
              phase: "Scan",
              label: `${rv}:${a.id}`,
              model: "sonnet",
              schema: FINDINGS_SCHEMA,
            },
          ),
      ),
    );
    const alive = reviewed.filter(Boolean);
    // Per-item stall accounting mirrors workflows/audit.js: a reviewer whose agent returned no
    // output is recorded by name with reason "no output / stall", and the note is filled on any
    // stall (not only total wipeout) so a partial stall stays visible in the Per-DR listing.
    const stalled = reviewers.filter((_, i) => !reviewed[i]);
    const skipped = stalled.map((rv) => ({ reviewer: rv, reason: "no output / stall" }));
    return {
      dr: a,
      status: ex.status,
      superseded_by: ex.superseded_by || "",
      // A DR whose reviewers all stalled verified nothing, so it counts as unverifiable
      verifiable: alive.length > 0,
      note: stalled.length ? `reviewers stalled (unmatched): ${stalled.join(", ")}` : "",
      skipped,
      findings: mergeFindings(alive.map((r) => r.findings)),
    };
  },
);

const scanned = perDr.filter(Boolean);
const allFindings = scanned.flatMap((r) => r.findings.map((f) => ({ ...f, dr: r.dr.id })));
const counts = { H: 0, M: 0, L: 0 };
for (const f of allFindings) counts[f.priority] += 1;
const unverifiable = scanned.filter((r) => !r.verifiable);
log(
  `Scan: findings=${allFindings.length} (H=${counts.H}, M=${counts.M}, L=${counts.L}), unverifiable=${unverifiable.length}/${scanned.length}`,
);

// ---- Report: report output (the structure lives in the prompt, no template) ----
phase("Report");
const focusNote = focus.length
  ? `This run is narrowed by focus [${focus.join(", ")}] to ${scanned.length}/${detect.drs.length} DRs. State this in one line right after the Summary.\n\n`
  : "";
const report = (await agent(
  anchor(
    `You handle the Report stage of adrift. Write a report with the following structure from the findings JSON below.\n` +
      `The steps are, after \`mkdir -p docs/audit\`, write to docs/audit/\${STAMP}-dr-drift.md with \`STAMP=$(date -u +%Y-%m-%d-%H%M%S)\`.\n` +
      `The structure is as follows. The title is "# DR Drift Scan: {STAMP}". Sections in order: "## Summary" (a Metric | Value table with rows DRs scanned / Drift findings / H priority / M priority / L priority / Unverifiable DRs), "## Per-DR Findings", "## External DR Dependencies" (a File:Line | External DR ref | Recommended action table; the action is "Promote to local DR or supersede locally"), "## Follow-up Issue Candidates" (a checklist of \`- [ ] DR {id} drift at {file}:{line}: {summary}\`).\n` +
      `In Per-DR Findings, bundle no-drift DRs into one "DRs {ids}: no drift." line, and give a "### DR {id}: {title}" subsection (Status / Result lines + a File:Line | Description | Direction | Priority table; for unverifiable, state the reason in Result and omit the table) only to drifted / unverifiable DRs.\n` +
      `The completeness requirements are the following 4. (1) List every DR in Per-DR Findings without omission. (2) Record file:line / direction / priority for each drift. (3) Reflect Superseded in the Status of superseded DRs. (4) Omit the External DR Dependencies heading entirely when external_refs is empty, and the Follow-up Issue Candidates heading entirely when there are zero H-priority findings.\n` +
      `Keep the length within what the structure above requires. Add no preamble / wrap-up / supplementary section beyond the specified headings, and put only findings content in the table cells.\n\n` +
      focusNote +
      `Use these Summary counts as-is. DRs scanned=${scanned.length}, findings=${allFindings.length}, H=${counts.H}, M=${counts.M}, L=${counts.L}, unverifiable=${unverifiable.length}\n\n` +
      `The per-DR results are as follows.\n${JSON.stringify(
        scanned.map((r) => ({
          id: r.dr.id,
          title: r.dr.title,
          status: r.status,
          superseded_by: r.superseded_by || "",
          verifiable: r.verifiable,
          note: r.note,
          skipped: r.skipped || [],
          findings: r.findings,
        })),
      )}\n\n` +
      `The external DR references (external_refs) are as follows.\n${JSON.stringify(externalRefs)}`,
  ),
  {
    agentType: "general-purpose",
    phase: "Report",
    label: "report",
    model: "opus",
    schema: REPORT_SCHEMA,
  },
)) || { written: false, report_path: "" };

log(
  report.written
    ? `Report: ${report.report_path}`
    : "Report: write failed (use the findings in the return value as the primary record)",
);

return {
  report_path: report.report_path,
  report_written: report.written,
  focus,
  drs_scanned: scanned.length,
  drs_total: detect.drs.length,
  findings: allFindings,
  priorities: counts,
  unverifiable: unverifiable.map((r) => ({ id: r.dr.id, note: r.note })),
  // Surface the per-DR reviewer-stall records on the primary channel (the return value)
  // too; the Report agent's prompt serialization alone survives only in LLM-authored markdown
  skipped: scanned
    .filter((r) => (r.skipped || []).length)
    .map((r) => ({ id: r.dr.id, skipped: r.skipped })),
  external_refs: externalRefs,
  followup_candidates: allFindings.filter((f) => f.priority === "H"),
};
