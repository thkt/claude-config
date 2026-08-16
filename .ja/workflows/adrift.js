export const meta = {
  name: "adrift",
  description:
    "DR の Decision Outcome と現コードの drift スキャンを決定論的に行う workflow。DR ごとに symbol 抽出 -> 参照検索 -> manifest で routing した reviewer の意味的照合を pipeline で流し、file:line + 修正方向 + 優先度のレポートを docs/audit/ に書く。全 DR の漏れなき列挙と reviewer routing 表は script が強制する。",
  whenToUse:
    'DR とコードの整合性を確認したいとき、意思決定の風化を洗いたいとき。DR が無いリポジトリの発掘は census を先に使う。args は DR ディレクトリパス文字列、DR id リスト文字列 (例 "0061, 0073")、または {dir, repo, focus}。focus は対象 DR を絞る id / キーワードの配列または文字列。省略時は docs/decisions/ の全 DR を対象にする。',
  phases: [{ title: "Detect" }, { title: "Scan" }, { title: "Report" }],
};

// 設計上の要点は 4 つ。
// 1. manifest -> reviewer の routing 表は script の定数にする。LLM に選ばせると reviewer 選択を
//    省略できるが、workflow では manifest 判定値から機械的に引く。
// 2. DR ごとの extract -> search -> review は pipeline で独立に流す (最長 DR が全体を
//    塞がない)。extract の stall は unverifiable として記録し、レポートの Per-DR 完全列挙
//    から漏らさない (fail-close)。
// 3. findings の dedup と優先度 merge、Summary の件数集計は script が計算する。
// 4. 外部資産は持たない。external DR 参照の分類は agent の生検索 + script の集合差で行い、
//    レポート構成は Report prompt に内包する。
//
// H 優先度の findings は workflow 中に /issue 起票の確認 (対話) ができないため、レポートの
// Follow-up Issue Candidates と return に記録して人間の triage に委ねる。

const isIdList = (s) => {
  const tokens = s.split(/[\s,]+/).filter(Boolean);
  return tokens.length > 0 && tokens.every((t) => /^(a?dr-?)?\d+$/i.test(t));
};

const parseArgs = () => {
  if (typeof args === "object" && args) return args;
  if (typeof args !== "string") return {};
  const s = args.trim();
  if (s.startsWith("{")) {
    try {
      const parsed = JSON.parse(s);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // 壊れた JSON は下の短縮記法へ落ちる
    }
  }
  // "0061" や "DR-0061, 0073" のような id 列は focus、それ以外は dir と解釈する
  return isIdList(args) ? { focus: args } : { dir: args };
};
const opts = parseArgs();
const dir = typeof opts.dir === "string" ? opts.dir.trim() : "";
const repo = typeof opts.repo === "string" ? opts.repo : "";

// focus は id ("0061" / "DR-0061") またはキーワードの列。配列と文字列の両方を受ける。
// id は数値一致、非数値はファイル名 / タイトルへの部分一致で照合する。
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
    ? `git / ファイル / 検索のコマンドはすべて ${repo} の repository から実行する (各シェルコマンドを \`cd ${repo} && \` で始める)。\n\n${p}`
    : p;

// manifest 判定値から reviewer subagent を機械的に引く routing 表。
const REVIEWERS = {
  rust: ["reviewer-rust", "reviewer-design"],
  ts: ["reviewer-design"],
  tsx: ["reviewer-react-pattern"],
  other: ["reviewer-design"],
};

// reviewer prompt に埋め込む判定基準
// (プレーン文字列 const にするのは guardrails sqli-concat が call 引数の補間 template 内の
// キーワード語を誤検知するため)。
const DIRECTION_RULES =
  "code-fix は DR が現契約として正しくコードが drift しているとき / " +
  "dr-update はコードが現契約として正しく DR が陳腐化しているとき / " +
  "accept は drift が些末、非推奨コメント済み、またはドキュメント済みのとき";
const PRIORITY_RULES =
  "H は公開 API に影響するか下流利用側が 2 つ以上のとき / " +
  "M は内部 API に影響し下流利用側が 1 つのとき / " +
  "L はコメント / docstring のみか無効な参照のとき";
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
        "DR ディレクトリ外で見つかった記録参照 (旧来の A 接頭辞形式と DR-NNNN の両方) の生リスト (分類は script が行う)",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["file", "line", "id"],
        properties: {
          file: { type: "string" },
          line: { type: "number" },
          id: { type: "string", description: "NNNN (4 桁)" },
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
    status: { type: "string", description: "Accepted / Superseded 等" },
    superseded_by: { type: "string" },
    verifiable: { type: "boolean", description: "散文のみの DR は false" },
    outcome_text: {
      type: "string",
      description: "Decision Outcome セクション本文",
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

// ---- Detect: DR ディレクトリ / manifest / DR 参照の検出 ----
phase("Detect");
const dirInstr = dir
  ? `DR ディレクトリは "${dir}" (リポジトリルート相対)。存在しなければ found: false とし reason に書く。`
  : `DR ディレクトリは docs/decisions/ のみを対象とする。存在しなければ found: false。`;
const detect = (await agent(
  anchor(
    `adrift の Detect 段階を担当する。\n` +
      `1. ${dirInstr}\n` +
      `2. ディレクトリ内の NNNN-*.md を列挙し、id (NNNN)、file (相対パス)、title (見出し) を drs に記録する。\n` +
      `3. manifest を判定する。Cargo.toml があれば rust。package.json があり *.tsx ファイルが存在すれば tsx、無ければ ts。どちらも無ければ other。\n` +
      `4. \`ugrep -rniw '(A?DR)-[0-9]{4}'\` (旧来の A 接頭辞形式と DR-NNNN の両方に一致) でリポジトリ全体の記録参照を検索し、DR ディレクトリ自体・fixture・node_modules / target / dist / build / vendor を除外した hit を dr_refs (file, line, id は NNNN の 4 桁) に記録する。ローカル DR の有無で分類はしない。\n` +
      `DR 本文の解析はしない。この段階の仕事は検出と列挙だけ。`,
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
  reason: "detect agent が出力を返さなかった",
};

if (!detect.found || !detect.drs.length) {
  return {
    stopped: "no-drs",
    why: detect.reason || "No DRs found, run /census first",
  };
}
// external 参照の分類は script の集合差 (参照 id − ローカル id)。検索は Detect agent、分類はここ。
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
// focus 指定時は script が決定論的に絞る。Detect agent は常に全列挙 (列挙は安価で、
// 一致 0 件時に available を返すには全リストが要る)。
const targets = focus.length ? detect.drs.filter(matchesFocus) : detect.drs;
if (!targets.length) {
  return {
    stopped: "no-matching-drs",
    why: `focus [${focus.join(", ")}] に一致する DR が無い`,
    available: detect.drs.map((a) => `${a.id}: ${a.title}`),
  };
}
const reviewers = REVIEWERS[detect.manifest] || REVIEWERS.other;
log(
  `Detect: ${targets.length}/${detect.drs.length} DRs (${detect.dr_dir}${
    focus.length ? `, focus=${focus.join("+")}` : ""
  }), manifest=${detect.manifest} -> ${reviewers.join(" + ")}, external_refs=${externalRefs.length}`,
);

// ---- Scan: DR ごとに extract -> reviewer 照合を独立に流す ----
const perDr = await pipeline(
  targets,
  // stage 1: status / symbol 抽出と参照検索
  (a) =>
    agent(
      anchor(
        `adrift の抽出段階を担当する。DR ${a.file} を読み、次を行う。\n` +
          `1. front matter または冒頭セクションから status を解析する。superseded by リンクがあれば後継 DR id を superseded_by に写す。\n` +
          `2. Decision Outcome セクションからコード識別子 (関数名 / 型名 / モジュール名 / ファイルパス) と箇条書き単位の決定事項を抽出し、セクション本文を outcome_text に写す。散文のみで識別子が無い DR は verifiable: false とし notes に "prose-only" と書く。\n` +
          `3. 各 symbol を \`ugrep -rn\` で検索し、DR ファイル自体とテスト fixture を除外した hit を candidates (symbol, file, line) に記録する。\n` +
          `drift の判定はしない。この段階の仕事は抽出と検索だけ。`,
      ),
      {
        agentType: "general-purpose",
        phase: "Scan",
        label: `extract:${a.id}`,
        model: "sonnet",
        schema: EXTRACT_SCHEMA,
      },
    ),
  // stage 2: routing した reviewer による意味的照合
  async (ex, a) => {
    if (!ex) {
      // extract stall は unverifiable として Per-DR 列挙に残す (fail-close)
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
          ? "参照候補 0 件 (シンボルがコードに現存しない)"
          : ex.notes || "prose-only",
        // シンボルが 1 件もヒットしない verifiable DR は、それ自体が drift の徴候
        findings: ex.verifiable
          ? ex.symbols.map((s) => ({
              file: a.file,
              line: 0,
              summary: `Decision Outcome のシンボル "${s}" がコードに見つからない`,
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
              `${rv} として、DR ${a.id} (${a.title}) の Decision Outcome と現コードの意味的 drift を判定する。clippy や grep で拾える表層ではなく、決定内容と実装の意味的ギャップを見る。\n` +
                `Decision Outcome は次のとおり。\n${ex.outcome_text}\n\n` +
                `参照候補 (ugrep hit) は次のとおり。\n${JSON.stringify(ex.candidates)}\n\n` +
                `各 drift を file:line で特定し、direction と priority を次の基準で付ける。\n` +
                `direction の基準は ${DIRECTION_RULES}。\n` +
                `priority の基準は ${PRIORITY_RULES}。\n` +
                `drift が無ければ findings: [] で返す。DR 本文の編集もコード修正もしない。`,
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
    // per-item の stall 計上は workflows/audit.js に倣う。agent が無出力だった reviewer を
    // reason "no output / stall" 付きで名指し記録し、全滅時のみでなく部分 stall でも note を
    // 埋めることで、部分 stall が Per-DR listing に残るようにする。
    const stalled = reviewers.filter((_, i) => !reviewed[i]);
    const skipped = stalled.map((rv) => ({ reviewer: rv, reason: "no output / stall" }));
    return {
      dr: a,
      status: ex.status,
      superseded_by: ex.superseded_by || "",
      // 全 reviewer が stall した DR は何も検証できていないため unverifiable として数える
      verifiable: alive.length > 0,
      note: stalled.length ? `reviewer stall (未照合): ${stalled.join(", ")}` : "",
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

// ---- Report: レポート出力 (構成は prompt に内包し template を持たない) ----
phase("Report");
const focusNote = focus.length
  ? `この実行は focus [${focus.join(", ")}] で対象を ${scanned.length}/${detect.drs.length} DR に絞っている。Summary の直後にその旨を 1 行で明記する。\n\n`
  : "";
const report = (await agent(
  anchor(
    `adrift の Report 段階を担当する。以下の findings JSON から次の構成のレポートを書く。\n` +
      `手順は \`mkdir -p docs/audit\` の後、\`STAMP=$(date -u +%Y-%m-%d-%H%M%S)\` で docs/audit/\${STAMP}-dr-drift.md に書く。\n` +
      `構成は次のとおり。見出しは "# DR Drift Scan: {STAMP}"。セクションは "## Summary" (Metric | Value の表。行は DRs scanned / Drift findings / H priority / M priority / L priority / Unverifiable DRs)、"## Per-DR Findings"、"## External DR Dependencies" (File:Line | External DR ref | Recommended action の表。action は "Promote to local DR or supersede locally")、"## Follow-up Issue Candidates" (\`- [ ] DR {id} drift at {file}:{line}: {summary}\` のチェックリスト) の順。\n` +
      `Per-DR Findings では drift の無い DR を "DRs {ids}: no drift." の 1 行に束ね、drift / unverifiable の DR にのみ "### DR {id}: {title}" サブセクション (Status / Result 行 + File:Line | Description | Direction | Priority の表。unverifiable は理由を Result に書き表を省略) を立てる。\n` +
      `完全性の要件は次の 4 つ。(1) 全 DR を Per-DR Findings に漏れなく記載する。(2) 各 drift に file:line / direction / priority を記録する。(3) superseded な DR の Status に Superseded を反映する。(4) external_refs が空なら External DR Dependencies を、H 優先度が 0 件なら Follow-up Issue Candidates を、見出しごと省略する。\n` +
      `長さは上の構成が要求する範囲に収める。指定した見出し以外に前置き / 総括 / 補足の節を足さず、表のセルには findings の内容だけを書く。\n\n` +
      focusNote +
      `Summary 件数は次の値をそのまま使う。DRs scanned=${scanned.length}, findings=${allFindings.length}, H=${counts.H}, M=${counts.M}, L=${counts.L}, unverifiable=${unverifiable.length}\n\n` +
      `Per-DR 結果は次のとおり。\n${JSON.stringify(
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
      `External DR 参照 (external_refs) は次のとおり。\n${JSON.stringify(externalRefs)}`,
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
    : "Report: 書き込み失敗 (return の findings を一次資料として使う)",
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
  // reviewer stall の per-DR 記録を一次チャネル (返り値) にも載せる。Report agent の
  // prompt 直列化だけでは LLM 著の markdown にしか残らない
  skipped: scanned
    .filter((r) => (r.skipped || []).length)
    .map((r) => ({ id: r.dr.id, skipped: r.skipped })),
  external_refs: externalRefs,
  followup_candidates: allFindings.filter((f) => f.priority === "H"),
};
