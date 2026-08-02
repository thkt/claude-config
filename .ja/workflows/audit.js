export const meta = {
  name: "audit",
  description:
    'audit の fan-out を決定論的に行う workflow。ファイルの routing (glob 表) は script 内で完結するため、reviewer の選択が drift しない。git I/O と各 reviewer / critic は agent として走る。pipeline は reviewer -> challenge -> verify -> integrate で、reviewer -> aggregate ではない。単体でも、build から workflow("audit") 経由の入れ子でも呼べる。',
  whenToUse:
    "diff に対して adversarial な reviewer 一式を決定論的に発火させ、review を main loop の裁量に任せない。/audit または Workflow({name:'audit'}) で直接起動する。launcher skill は無い。起動前に scope や focus が不明なら、ユーザーに 2 点を確認する。focus (all / security / performance / quality / a11y) と scope (staged を含む HEAD diff、path、別 repo のいずれか)。確認結果は args で渡す。例 Workflow({name:'audit', args:{focus:'security', scope:'src/'}})。args を省くと focus=all で HEAD diff を audit する。clarification の受け渡しも fan-out も、この workflow が一手に引き受ける。",
  phases: [
    { title: "Pre-flight" },
    { title: "Route" },
    { title: "Review" },
    { title: "Challenge" },
    { title: "Verify" },
    { title: "Integrate" },
    { title: "Snapshot" },
  ],
};

// routing は agent ではなく script に置く。agent に glob 表を再導出させると、この workflow が
// なくすはずの drift を持ち込み直すことになる。reviewer に sonnet を使うのは、opus で深い解析を
// させると stream watchdog が stall するため。

// args は object でも、呼び出し側で stringify された JSON 文字列でも渡ってくる。object に
// parse できる文字列は parse 結果を、それ以外の文字列は scope の短縮記法とみなして、
// ここで一度だけ正規化する。
const parseArgs = () => {
  if (typeof args === "object" && args) return args;
  if (typeof args !== "string") return {};
  const s = args.trim();
  if (s.startsWith("{")) {
    try {
      const parsed = JSON.parse(s);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // JSON として壊れている。そのまま抜けて、文字列全体を scope として扱う
    }
  }
  return { scope: args };
};
const opts = parseArgs();

const scope = typeof opts.scope === "string" ? opts.scope : "";
const focus = typeof opts.focus === "string" ? opts.focus : "all";
const repo = typeof opts.repo === "string" ? opts.repo : "";
// noLimit は 30 ファイル超の guard を外す。skipPreflight は、test を green にしてから
// 呼んでくる側 (build の Code phase) が test の二重実行を避けるための flag。
const noLimit = opts.noLimit === true;
const skipPreflight = opts.skipPreflight === true;
const anchor = (p) =>
  repo
    ? `git コマンドはすべて repo ${repo} で実行する (各シェルコマンドを \`cd ${repo} && \` で始める)。\n\n${p}`
    : p;
// plugin 対応の asset 解決。plugin として配布されたとき bundled asset は ~/.claude では
// なく ~/.claude/plugins 配下に置かれる。shell 断片は dev-tree のパスを先に試すので、
// dev tree での動作は変わらない。
const bundled = (rel) =>
  `"$(P="$HOME/.claude/${rel}"; [ -f "$P" ] || P="$(find "$HOME/.claude/plugins" -path "*/${rel}" 2>/dev/null | sort -V | tail -1)"; printf %s "$P")"`;

// timestamp・branch・prior snapshot との delta 計算は audit/snapshot.py が行う。agent は
// payload を一時ファイルに書いてそのスクリプトを 1 回叩くだけで、disk への副作用が目的、
// 戻り値は使わない。
// payload のキーは snapshot.py の build_record がそのまま record の項目にする。返り値に
// しか無い項目は record から読めないので、record で読ませたいものはここへ渡す。
const writeSnapshot = async ({
  preFlight,
  rawFindings,
  findings,
  skipped,
  challengeRan,
  verifyRan,
  tally,
  needsContext,
  zeroReviewerFiles,
}) => {
  phase("Snapshot");
  const payload = JSON.stringify({
    scope: scope || "HEAD",
    focus,
    pre_flight: preFlight,
    raw_findings: rawFindings,
    findings,
    skipped,
    challenge_ran: challengeRan,
    verify_ran: verifyRan,
    tally,
    // 同じ finding は raw_findings 側に verdict つきで載る。ここは raw_findings から
    // 導けない why だけの側表にする。
    needs_context: needsContext && needsContext.map(({ id, why }) => ({ id, why })),
    zero_reviewer_files: zeroReviewerFiles,
  });
  await agent(
    anchor(
      `あなたは audit の Snapshot 段階を担当する。次の JSON payload を一時ファイルに書き、` +
        `\`python3 ${bundled("workflows/audit/snapshot.py")} < <tempfile>\` を 1 回実行する。` +
        `スクリプトが timestamp・branch・prior snapshot との delta ` +
        `(file + message でマッチした resolved / new / carried) を解決し、` +
        `$HOME/.claude/history/ に記録を書いて出力パスを stdout に返す。` +
        `コードの review や finding の変更はしない。他の方法でファイルを書かない。Payload は次のとおり。\n${payload}`,
    ),
    {
      agentType: "general-purpose",
      phase: "Snapshot",
      label: "snapshot",
      model: "haiku",
    },
  );
};

// /audit の routing 表。react-pattern は JSX を含む拡張子 (jsx / tsx) にだけ付け、素の js の
// audit で空振りしないようにする。JSX を使わない React には react-pattern が付かない、という
// heuristic を含む。ファイルは classify() で最初にマッチした行に決まる。型の機械的チェック
// (any / アサーション / strict モード) は gates のリンタが担い、reviewer は持たない。
const ROUTING = {
  "*.sh": ["security", "silence", "duplication", "reuse", "efficiency", "operations", "resilience"],
  "*.js": [
    "security",
    "silence",
    "duplication",
    "reuse",
    "efficiency",
    "design",
    "testability",
    "operations",
    "resilience",
  ],
  "*.ts": [
    "security",
    "silence",
    "duplication",
    "reuse",
    "efficiency",
    "design",
    "testability",
    "operations",
    "resilience",
  ],
  "*.jsx": [
    "security",
    "silence",
    "duplication",
    "reuse",
    "efficiency",
    "design",
    "react-pattern",
    "testability",
    "operations",
    "resilience",
    "accessibility",
    "progressive",
  ],
  "*.tsx": [
    "security",
    "silence",
    "duplication",
    "reuse",
    "efficiency",
    "design",
    "react-pattern",
    "testability",
    "operations",
    "resilience",
    "accessibility",
    "progressive",
  ],
  "*.rs": [
    "security",
    "silence",
    "rust",
    "duplication",
    "reuse",
    "efficiency",
    "design",
    "testability",
    "operations",
    "resilience",
  ],
  "*.py": [
    "security",
    "silence",
    "duplication",
    "reuse",
    "efficiency",
    "design",
    "testability",
    "operations",
    "resilience",
  ],
  "*.md": ["prompt"],
  "*.css,*.html": ["accessibility", "progressive", "duplication"],
  test: ["coverage", "testability"],
  default: ["duplication", "reuse", "efficiency"],
};

// /audit の focus フィルタ。routing 結果との積集合を取る。
const FOCUS = {
  security: ["security", "silence"],
  performance: ["react-pattern", "efficiency", "progressive"],
  quality: [
    "design",
    "react-pattern",
    "rust",
    "resilience",
    "duplication",
    "reuse",
    "testability",
    "operations",
    "prompt",
    "silence",
    "coverage",
  ],
  a11y: ["accessibility", "progressive"],
  all: null,
};

// agents/reviewers/に定義はあるが ROUTING に行を持たない reviewer。/audit の
// fan-out ではなく skill から直接呼ばれるときだけ走るので、glob 表の行を持たず
// FOCUS の外に置く。ここに名前が無い定義は誰からも呼ばれないまま残るため、この配列が
// 到達不能な定義への防御柵になる。
const SKILL_ONLY_REVIEWERS = ["causation", "readability", "conformance"];

const ext = (p) => {
  const base = p.slice(p.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot).toLowerCase() : "";
};
const classify = (p) => {
  if (/(^|\/|\.)test\./.test(p)) return ROUTING.test;
  const e = ext(p);
  if (e === ".sh") return ROUTING["*.sh"];
  if (e === ".js") return ROUTING["*.js"];
  if (e === ".ts") return ROUTING["*.ts"];
  if (e === ".jsx") return ROUTING["*.jsx"];
  if (e === ".tsx") return ROUTING["*.tsx"];
  if (e === ".rs") return ROUTING["*.rs"];
  if (e === ".py") return ROUTING["*.py"];
  if (e === ".md") return ROUTING["*.md"];
  if (e === ".css" || e === ".html") return ROUTING["*.css,*.html"];
  return ROUTING.default;
};
// T-014 (audit.routing.test.js) のランタイム側の鏡。reviewer 名が ROUTING と
// SKILL_ONLY_REVIEWERS の両方に載ることは無いはず。テストは test 実行時にしか
// 検知しないが、この check は実際の run のたびに同じ drift を検知する。
const routingSkillOnlyOverlap = [...new Set(Object.values(ROUTING).flat())].filter((r) =>
  SKILL_ONLY_REVIEWERS.includes(r),
);
if (routingSkillOnlyOverlap.length) {
  log(
    `Config drift: ROUTING と SKILL_ONLY_REVIEWERS の両方に載っている: ${routingSkillOnlyOverlap.join(", ")}。`,
  );
}

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
        required: ["file", "line", "severity", "summary"],
        properties: {
          file: { type: "string" },
          line: { type: "string" },
          severity: {
            type: "string",
            enum: ["critical", "high", "medium", "low"],
          },
          summary: { type: "string" },
          source_ids: {
            type: "array",
            items: { type: "string" },
            description:
              "R-N ids of the raw findings this finding absorbed (Integrate output only)",
          },
        },
      },
    },
  },
};

const ROUTE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["files"],
  properties: {
    files: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path", "churn"],
        properties: {
          path: { type: "string", description: "repo-relative path" },
          churn: {
            type: "integer",
            description: "count of fix commits touching this file",
          },
        },
      },
    },
  },
};

const PREFLIGHT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ran"],
  properties: {
    ran: {
      type: "boolean",
      description: "true if a test command was found and executed",
    },
    runner: { type: "string", description: "detected task runner, or empty" },
    command: { type: "string", description: "test command run, or empty" },
    tests_passed: { type: "integer" },
    tests_failed: { type: "integer" },
    exit_code: { type: "integer" },
    note: {
      type: "string",
      description: "one line: skip reason, timeout, or summary",
    },
  },
};

// ---- Pre-flight ∥ Route。互いにデータを共有しない 2 段なので並行に走らせる ----
// 素の phase() は parallel() 内で race するため、各 thunk が opts.phase で自分の group を指定する。
const scopeInstr = scope
  ? `scope は "${scope}"。対象ファイルは \`git diff --name-only ${scope}\` で列挙する。`
  : `scope 指定は無い。staged + modified のファイルを対象とする。\`git diff --name-only HEAD\` と \`git diff --name-only --staged\` の和集合を取る。`;
const [preFlightRaw, route] = await parallel([
  // test 実行のみ。静的解析は gates hook の担当。test の失敗は context として記録するだけで、
  // block もせず finding にもしない。
  async () => {
    if (skipPreflight) return { ran: false, note: "呼び出し側の指定で skip" };
    const pf = (await agent(
      anchor(
        `あなたは audit の Pre-flight 段階を担当する。プロジェクトの task runner を検出する (package.json -> npm/yarn/pnpm/bun、Cargo.toml -> cargo、pyproject.toml -> poetry/uv、Makefile -> make、Taskfile.yml -> task)。その test script を探し (test, test:unit, test:ci, spec の順。無ければ vitest/jest/pytest/cargo test を \`command -v\` で探す)、timeout 60 秒で 1 回だけ実行する。pass / fail の件数と exit code を記録する。exit code が非ゼロでも timeout しても、記録するだけで block はしない。修正もコードの review もしない。runner も test script も見つからなければ、理由を note に書いて ran=false を返す。`,
      ),
      {
        agentType: "general-purpose",
        phase: "Pre-flight",
        label: "pre-flight",
        model: "sonnet",
        schema: PREFLIGHT_SCHEMA,
      },
    )) || { ran: false, note: "pre-flight agent が出力を返さなかった" };
    log(
      pf.ran
        ? `Pre-flight: ${pf.command} -> pass ${pf.tests_passed || 0}, fail ${pf.tests_failed || 0} (exit ${pf.exit_code})。`
        : `Pre-flight skip: ${pf.note}`,
    );
    return pf;
  },
  () =>
    agent(
      anchor(
        `あなたは audit の Route 段階を担当する。${scopeInstr}\n` +
          `各ファイルについて、そのファイルに触れた fix commit の数を数える。\`git log --grep=fix --oneline -- <file>\` の行数を churn とする (0 でも構わない。そのファイルも残す)。全ファイルを churn 付きで返す。review はしない。この段階の仕事はファイルの列挙だけ。`,
      ),
      { label: "route", phase: "Route", schema: ROUTE_SCHEMA, model: "haiku" },
    ),
]);
const preFlight = preFlightRaw || {
  ran: false,
  note: "pre-flight 段階が失敗",
};

const files = ((route && route.files) || []).filter((f) => f.path);
if (!files.length) {
  return {
    findings: [],
    skipped: [],
    zero_reviewer_files: [],
    why: "指定 scope に audit 対象のファイルが無い。",
  };
}

const focusSet = FOCUS[focus] === undefined ? null : FOCUS[focus];
const assign = {};
// classify() が返す reviewer が focus との積集合で全て落ちたファイルは 0 件になる。
// これはファイルが無言で audit から外れる劣化なので、WORKFLOWS.md の粒度に沿って
// 捨てず file path 単位で記録する。
const zeroReviewerFiles = [];
for (const f of files) {
  const reviewers = classify(f.path).filter((r) => !focusSet || focusSet.includes(r));
  if (!reviewers.length) {
    zeroReviewerFiles.push({ path: f.path });
    continue;
  }
  for (const r of reviewers) {
    (assign[r] = assign[r] || []).push(f.path);
  }
}
const assignments = Object.entries(assign).map(([reviewer, fs]) => ({
  reviewer,
  files: fs,
}));

if (zeroReviewerFiles.length) {
  log(
    `0 reviewer になったファイル [focus=${focus}]: ${zeroReviewerFiles.length} - ${zeroReviewerFiles
      .map((f) => f.path)
      .join(", ")}`,
  );
}

// 対話版の /audit は 30 ファイルを超えると scope を絞るよう prompt を出す。headless では
// prompt を出せないため、warn だけして続行する。
if (files.length > 30 && !scope && !noLimit) {
  log(
    `ファイル数が soft limit 超過。scope 指定なしで ${files.length} ファイル (> 30)。headless のためそのまま続行する (scope を絞る prompt は出せない)。この warn を消すには scope か noLimit を渡す。`,
  );
}

// 1 agent あたり 10 ファイルまで。unit に reviewer ラベルを持たせるのは、parallel 結果を
// flatten した後でも skip と raw_findings をどの reviewer のものか辿れるようにするため。
const BATCH = 10;
const units = [];
for (const a of assignments) {
  if (a.files.length <= BATCH) {
    units.push({ reviewer: a.reviewer, files: a.files, label: a.reviewer });
  } else {
    for (let i = 0; i < a.files.length; i += BATCH) {
      units.push({
        reviewer: a.reviewer,
        files: a.files.slice(i, i + BATCH),
        label: `${a.reviewer}#${i / BATCH + 1}`,
      });
    }
  }
}
const churnMap = files
  .slice()
  .sort((a, b) => b.churn - a.churn)
  .map((f) => `${f.path}: ${f.churn}`)
  .join("\n");
log(
  `${files.length} ファイルを ${assignments.length} reviewer / ${units.length} unit に routing [focus=${focus}]: ${assignments
    .map((a) => a.reviewer)
    .join(", ")}`,
);

// ---- Review ----
phase("Review");
const RELIABILITY =
  "advisor tool は呼ばない。自分の解析だけで最後まで進む。8 分以内に完了する。確信の持てない finding も skip せず含める (false positive は challenger が刈る)。対象が複数ファイルに跨るなら churn の高い path から見て、最初のファイルで budget を使い切らない。";
const raw = await parallel(
  units.map(
    (u) => () =>
      agent(
        anchor(
          `reviewer-${u.reviewer} として、次のファイルを review する。対象は ${u.files.join(", ")}。` +
            `review の根拠は \`git diff ${scope || "HEAD"}\` の該当 path に置く。finding には必ず file:line を付け、severity を添えて返す。\n` +
            `Churn (fix commit の数。多いほど壊れやすい) は次のとおり。\n${churnMap}\n\n${RELIABILITY}`,
        ),
        {
          agentType: `reviewer-${u.reviewer}`,
          phase: "Review",
          label: u.label,
          model: "sonnet",
          schema: FINDINGS_SCHEMA,
        },
      ),
  ),
);
const findings = raw.filter(Boolean).flatMap((r) => r.findings || []);
// flatten すると unit との対応が消えるため、その前に snapshot 用へ reviewer ごとの帰属を
// 記録しておく。
const rawFindings = [];
units.forEach((u, i) => {
  const res = raw[i];
  if (res && res.findings) {
    for (const f of res.findings) {
      rawFindings.push({
        id: `R-${rawFindings.length + 1}`,
        reviewer: u.reviewer,
        file: f.file,
        line: f.line,
        severity: f.severity,
        message: f.summary,
      });
    }
  }
});
// skip は unit 単位で集計する。reviewer を key にすると、同じ reviewer の生き残った unit が
// 出力ありと見なされ、stall した unit の未 review ファイルが隠れてしまう。
const skipped = units
  .filter((_, i) => !raw[i])
  .map((u) => ({
    reviewer: u.reviewer,
    label: u.label,
    files: u.files,
    reason: "出力なし / stall",
  }));

if (!findings.length) {
  await writeSnapshot({
    preFlight,
    rawFindings,
    findings: [],
    skipped,
    challengeRan: false,
    verifyRan: false,
    zeroReviewerFiles,
  });
  return {
    findings: [],
    assignments,
    skipped,
    zero_reviewer_files: zeroReviewerFiles,
    challenge_ran: false,
    verify_ran: false,
  };
}

// ---- Challenge ∥ Verify -> Integrate。reviewer -> aggregate は禁止 ----
// 同じ findings に独立した 2 pass を並行で当てる。membership を決めるのは Challenge の
// verdict だけで、Verify の evidence は Integrate に届かない。
const findingsJson = JSON.stringify(findings);
// workflows/polish.js の VERDICTS_SCHEMA (id/verdict/severity/why) の形を踏襲する。
// severity の enum はこのファイル自身の FINDINGS_SCHEMA (critical/high/medium/low) に
// 合わせ、polish の P1/P2/P3 は使わない。2 つの workflow は severity の物差しが異なるため。
const VERDICTS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdicts"],
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "verdict"],
        properties: {
          id: { type: "string" },
          verdict: {
            type: "string",
            enum: ["confirmed", "disputed", "downgraded", "needs_context"],
          },
          severity: {
            type: "string",
            enum: ["critical", "high", "medium", "low"],
          },
          why: { type: "string" },
        },
      },
    },
  },
};
// critic-audit への challenge input と Integrate への survivors input は同じ射影
// (rawFindings の message フィールドを summary に改名) を必要とする。ヘルパーを 1 つに
// して、呼び出し 2 箇所で形が乖離しないようにする。
const toCriticRef = (f) => ({
  id: f.id,
  file: f.file,
  line: f.line,
  severity: f.severity,
  summary: f.message,
});
// critic への入力は rawFindings (R-N id の出どころ) から reviewer フィールドを外したもの。
// どの reviewer が挙げた finding かで challenge の verdict が偏らないようにする。
const challengeInput = rawFindings.map(toCriticRef);
const [challenged, verified] = await parallel([
  () =>
    agent(
      anchor(
        `critic-audit として、これらの finding を challenge し false positive を刈る。finding は事実ではなく、立証されるべき主張として扱う。各 finding は id で参照する。\n` +
          `verdict の判定基準は次のとおり。confirmed = 実在し severity も妥当 / disputed = false positive / downgraded = 実在するが severity が過大 (下げた値を severity に入れる) / needs_context = コードだけでは判定できず人間の文脈が要る。\n` +
          `Findings は次のとおり。\n${JSON.stringify(challengeInput)}`,
      ),
      {
        agentType: "critic-audit",
        phase: "Challenge",
        label: "challenge",
        model: "sonnet",
        schema: VERDICTS_SCHEMA,
        // judge 段は難易度軸で xhigh を選ぶ (docs の "the hardest coding and agentic tasks")。
        // 所要時間は数分で long-horizon の基準には届かないが、finding を退ける判断の質が
        // false positive を左右するので token でなく精度側に振る。
        effort: "xhigh",
      },
    ),
  () =>
    agent(
      anchor(
        `critic-evidence として、これらの finding を検証する。直感ではなく、具体的な実行経路を辿った positive evidence に基づく。各 finding を file:line で参照し、実行経路の evidence と severity を与える。Findings は次のとおり。\n${findingsJson}`,
      ),
      {
        agentType: "critic-evidence",
        phase: "Verify",
        label: "verify",
        model: "sonnet",
        effort: "xhigh",
      },
    ),
]);

// ---- Triage: survivor 判定はスクリプトが持ち、critic は verdict を返すだけ ----
// verdict 側でなく finding 側を回すことで、challenge agent が verdict を付け忘れた
// finding も取りこぼさない。confirmed 扱いで survivors に残し no_verdict として計上する。
// challenge agent が丸ごと失敗した場合 (verdict 一覧が空) も全件が同じ no_verdict 経路を
// 通るので、fail-open が呼び出し元から劣化と分かる形で残る。
const verdictById = new Map(((challenged && challenged.verdicts) || []).map((v) => [v.id, v]));
const survivors = [];
const needsContext = [];
let noVerdict = 0;
for (const f of rawFindings) {
  const v = verdictById.get(f.id);
  // disputed の id は survivors にも needsContext にも入らない。書き戻さなければ record から
  // 消え、reviewer 別の生存率を測れなくなる。
  f.verdict = v ? v.verdict : "no_verdict";
  if (!v) {
    noVerdict++;
    survivors.push({ ...f });
    continue;
  }
  if (v.verdict === "disputed") continue;
  if (v.verdict === "needs_context") {
    needsContext.push({ ...f, why: v.why || "" });
    continue;
  }
  const severity = v.verdict === "downgraded" && v.severity ? v.severity : f.severity;
  survivors.push({ ...f, severity });
}
log(
  `triage: ${survivors.length} survived / ${needsContext.length} needs_context / no_verdict: ${noVerdict} (of ${rawFindings.length} total)`,
);
// challenge_ran は「verdicts を返した run」と fail-open した run (verdictById が空になり、
// 全 finding が no_verdict 経由で confirmed に落ちる) を区別する。verify は自由記述の
// テキストを返すため、schema の形ではなく中身の有無で判定する。
const challengeRan = !!(challenged && Array.isArray(challenged.verdicts));
const verifyRan = !!String(verified || "").trim();
const tally = {
  survived: survivors.length,
  needs_context: needsContext.length,
  no_verdict: noVerdict,
};

phase("Integrate");
// 入力を survivors だけに絞ることで、challenge pass が確定した finding を Integrate が
// 再び刈る経路自体をなくす。
log(
  `verify pass の出力: ${verifyRan ? "あり" : "なし"}。参考情報にとどめ、Integrate には渡さない。`,
);
const survivorsInput = survivors.map(toCriticRef);
const integrated = await agent(
  anchor(
    `enhancer-integration として、challenge triage を生き残った survivors を file:line で突き合わせ、cross-domain の root cause と severity 順のリストに reconcile する。\n` +
      `Membership は既に確定している。以下の survivors はすべて challenge pass を通過済みなので、再び刈ったり disputed 扱いにしたり drop したりしない。merge と並べ替えだけを行う。\n` +
      `返す finding には、吸収した survivor の id (R-N) を source_ids に全件残す。複数の survivor を統合した root cause なら、その全 id を source_ids に持つ。\n` +
      `Survivors は次のとおり。\n${JSON.stringify(survivorsInput)}`,
  ),
  {
    agentType: "enhancer-integration",
    phase: "Integrate",
    label: "integrate",
    model: "opus",
    effort: "high",
    schema: FINDINGS_SCHEMA,
  },
);

// Integrate が返さなかったときのフォールバック先は triage 済みの survivors (各自が R-N id を
// 持ったまま) であって、triage 前の findings 配列ではない。その配列は rawFindings への id 付与
// より前の状態なので、そこへ落とすと challenge triage が disputed と判定した finding を黙って
// 呼び戻すことになる。
const finalFindings = (integrated && integrated.findings) || survivorsInput;
await writeSnapshot({
  preFlight,
  rawFindings,
  findings: finalFindings,
  skipped,
  challengeRan,
  verifyRan,
  // fail-open した run は degraded 印だけを残し件数を書かない、が plan の contract。
  // undefined を渡すと JSON.stringify がキーごと落とす。
  tally: challengeRan ? tally : undefined,
  needsContext,
  zeroReviewerFiles,
});
return {
  findings: finalFindings,
  survivors,
  needs_context: needsContext,
  challenge_ran: challengeRan,
  verify_ran: verifyRan,
  tally,
  assignments,
  skipped,
  zero_reviewer_files: zeroReviewerFiles,
};
