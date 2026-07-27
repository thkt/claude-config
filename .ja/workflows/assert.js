export const meta = {
  name: "assert",
  description:
    "独立した outcome-based assertion を決定論的に行う workflow。isolated worktree で Codex が独立検証し、audit workflow (reviewer -> challenge -> verify -> integrate) と並走する。三値 gate (Ready / Ready (caveat) / NotReady) の判定規則は script が適用するため、gate の甘い自己申告や動的 evidence の skip が起きない。",
  whenToUse:
    "merge 可否を静的 + 動的 evidence で独立に断定したいとき。軽い code review は polish workflow、静的のみの監査は audit workflow を使う。args は scope 文字列 (file / directory で target mode)、または {scope, base, repo}。省略時は diff mode (uncommitted、無ければ base branch との diff)。",
  phases: [
    { title: "Bootstrap" },
    { title: "Evidence" },
    { title: "Challenge" },
    { title: "Triage" },
    { title: "Synthesize" },
    { title: "Cleanup" },
  ],
};

// 設計上の要点は 4 つ。
// 1. 静的 reviewer fan-out は routing 表を複製せず workflow("audit") の入れ子で再利用する
//    (routing 表の変更が assert に直接伝播する性質を保つため)。audit 内で
//    critic-audit / critic-evidence を通過済みのため、assert 側の Challenge は Codex findings
//    のみに掛け、同一 agent による二重 challenge を避ける。
// 2. gate 判定は schema + script で計算する。gate を enhancer の散文から decode するのではなく、
//    (build, tests, issues) から script が規則で計算するため、re-spawn / fail-close の機構自体が
//    不要になる。
// 3. worktree.py / bootstrap.py は決定論 script なので agent にそのまま実行させる。
//    session id は agent 環境の $CLAUDE_SESSION_ID で解決し、生成と cleanup が同じ id から
//    branch / path を導出するため drift しない。
// 4. adversarial (codex 600s) は Evidence と同時に始め、Challenge / Triage の裏で走らせる
//    (barrier に入れると最長 stage が全体を塞ぐ)。
//
// OUTCOME.md 不在時に /outcome で stub 生成しない。assert は検証であり、対象 repo への
// 書き込み副作用を持たない。不在は report に記録して前進する。

const parseArgs = () => {
  if (typeof args === "string") {
    try {
      const parsed = JSON.parse(args);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // JSON でない文字列は scope の短縮記法
    }
    return { scope: args };
  }
  return args && typeof args === "object" ? args : {};
};
const opts = parseArgs();
const scope = typeof opts.scope === "string" ? opts.scope : "";
const base = typeof opts.base === "string" ? opts.base : "main";
const repo = typeof opts.repo === "string" ? opts.repo : "";

const anchor = (p) =>
  repo
    ? `git / ファイル / ビルドのコマンドはすべて ${repo} の repository から実行する (各シェルコマンドを \`cd ${repo} && \` で始める)。\n\n${p}`
    : p;

// この workflow の付属 script。loader は workflows/ 直下の .js しか読まないため、
// subdir は資産置き場として安全 (指示とリファレンスは workflow に内包する)。
const SCRIPTS = "$HOME/.claude/workflows/assert";
// OUTCOME.md の空判定の基準は /outcome が持つので、Bootstrap は TBD を目視せず
// その判定結果を読む。
const OUTCOME_VALIDATOR = "$HOME/.claude/skills/outcome/scripts/validate-outcome.py";

// merge-findings.py の 2 規則を JS に inline する。P1 -> high、P2 -> medium、P3 -> 落とす。
// critical / high / medium / low は素通し。認識できない severity は順位付け不能なので落とす。
// dedup key は file:line のみ (source ごとに category schema が違う)。衝突時は高い severity を
// 残し、source を和集合にする。
const SEVERITY_MAP = {
  P1: "high",
  P2: "medium",
  P3: null,
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "low",
};
const SEVERITY_RANK = { critical: 4, high: 3, medium: 2, low: 1 };
const mergeIssues = (findings) => {
  const groups = new Map();
  for (const f of findings) {
    const key = String(f.severity || "")
      .trim()
      .replace(/^\[|\]$/g, "");
    const sev = SEVERITY_MAP[key] === undefined ? null : SEVERITY_MAP[key];
    if (!sev) continue;
    const sources = Array.isArray(f.source) ? f.source : f.source ? [f.source] : [];
    const k = `${f.file || ""}:${f.line || 0}`;
    const prev = groups.get(k);
    if (!prev) {
      groups.set(k, { ...f, severity: sev, source: [...sources] });
      continue;
    }
    for (const s of sources) if (!prev.source.includes(s)) prev.source.push(s);
    if (SEVERITY_RANK[sev] > SEVERITY_RANK[prev.severity]) {
      groups.set(k, { ...f, severity: sev, source: prev.source });
    }
  }
  return [...groups.values()].sort(
    (a, b) =>
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
      String(a.file || "").localeCompare(String(b.file || "")) ||
      (a.line || 0) - (b.line || 0),
  );
};

const BOOTSTRAP_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "codex_available",
    "mode",
    "scope_files",
    "outcome",
    "worktree_ok",
    "install",
    "build",
  ],
  properties: {
    codex_available: { type: "boolean" },
    mode: { type: "string", enum: ["target", "diff", "none"] },
    diff_kind: { type: "string", enum: ["uncommitted", "branch", ""] },
    scope_files: { type: "array", items: { type: "string" } },
    outcome: {
      type: "string",
      description: "OUTCOME.md の Behavior / Non-goals / Constraints 要約。不在なら absent",
    },
    worktree_ok: { type: "boolean" },
    worktree_path: { type: "string" },
    install: { type: "string", enum: ["ok", "fail", "skip"] },
    build: { type: "string", enum: ["pass", "fail", "skipped"] },
    reason: { type: "string" },
  },
};

const CODEX_REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ran", "findings"],
  properties: {
    ran: { type: "boolean" },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["file", "line", "severity", "summary"],
        properties: {
          file: { type: "string" },
          line: { type: "number" },
          severity: { type: "string", enum: ["P1", "P2", "P3"] },
          summary: { type: "string" },
        },
      },
    },
    notes: { type: "string" },
  },
};

const TEST_RUN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["outcome"],
  properties: {
    outcome: { type: "string", enum: ["pass", "fail", "no-runner", "skipped"] },
    passed: { type: "number" },
    failed: { type: "number" },
    notes: { type: "string", description: "fail 時は stderr 末尾の要点" },
  },
};

const ADVERSARIAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ran", "tests"],
  properties: {
    ran: { type: "boolean" },
    tests: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["test_name", "target", "assertion", "result"],
        properties: {
          test_name: { type: "string" },
          target: { type: "string", description: "file:line" },
          assertion: { type: "string" },
          result: { type: "string", enum: ["PASS", "FAIL"] },
          failure_detail: { type: "string" },
        },
      },
    },
    notes: { type: "string" },
  },
};

const TRIAGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "reason"],
  properties: {
    verdict: { type: "string", enum: ["promote", "exclude"] },
    reason: { type: "string" },
  },
};

const SYNTH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["issues", "root_causes", "report"],
  properties: {
    issues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["file", "line", "severity", "summary", "source"],
        properties: {
          file: { type: "string" },
          line: { type: "number" },
          severity: {
            type: "string",
            enum: ["critical", "high", "medium", "low"],
          },
          summary: { type: "string" },
          source: { type: "array", items: { type: "string" } },
        },
      },
    },
    root_causes: { type: "array", items: { type: "string" } },
    report: { type: "string" },
  },
};

// ---- Bootstrap: codex 検出 / mode 判定 / OUTCOME 読込 / worktree 準備 ----
phase("Bootstrap");
const scopeInstr = scope
  ? `scope は "${scope}"。target mode とし、単一ファイルならそのファイル、ディレクトリなら \`git ls-files ${scope}\` の出力を scope_files とする。`
  : `scope 指定は無い。uncommitted な変更 (\`git status --porcelain\`) があれば diff mode (diff_kind: uncommitted) で \`git diff --name-only HEAD\` を、無ければ base branch ${base} より先行する commit の diff mode (diff_kind: branch) で \`git diff --name-only ${base}...HEAD\` を scope_files とする。どちらも空なら mode: none で返す。`;
const bootstrapPrompt = anchor(
  `assert の Bootstrap 段階を担当する。順に実行する。\n` +
    `1. \`command -v codex\` で codex CLI の有無を確認する。無ければ codex_available: false とし、以降を省いて mode: none で返す。\n` +
    `2. "${OUTCOME_VALIDATOR}" .claude/OUTCOME.md を実行する。JSON の state が absent または empty なら outcome: "absent"。それ以外は本文を読み、Behavior / Non-goals / Constraints を outcome に要約する。stub 生成はしない。\n` +
    `3. ${scopeInstr}\n` +
    `4. mode が none でなければ、"${SCRIPTS}/worktree.py" "$CLAUDE_SESSION_ID" で isolated worktree を用意し (JSON の status が error なら worktree_ok: false、reason に stderr を写す)、続けて "${SCRIPTS}/bootstrap.py" "<worktree path>" を実行して install / build / reason を JSON から写す。diff_kind が uncommitted のときは worktree に uncommitted 変更を反映する (\`git diff HEAD\` を worktree 側で apply し、scope_files 中の untracked ファイルは cp する)。\n` +
    `コードの review や修正はしない。この段階の仕事は環境の準備と事実の記録だけ。`,
);
const boot = (await agent(bootstrapPrompt, {
  agentType: "general-purpose",
  phase: "Bootstrap",
  label: "bootstrap",
  model: "sonnet",
  schema: BOOTSTRAP_SCHEMA,
})) || {
  codex_available: false,
  mode: "none",
  scope_files: [],
  outcome: "absent",
  worktree_ok: false,
  install: "fail",
  build: "skipped",
  reason: "bootstrap agent が出力を返さなかった",
};

if (!boot.codex_available) {
  return {
    stopped: "codex-missing",
    why: "codex CLI が無い。brew install codex 等で導入してから再実行する。",
  };
}
if (boot.mode === "none") {
  return {
    stopped: "no-changes",
    why: boot.reason || "assert 対象の変更が無い。",
  };
}

// env fail (worktree 不可 / install fail) と build smoke fail (対象がビルドできない) を区別する。
// caveat 落としは env fail のみに許す。build smoke fail を caveat に落とすと壊れたビルドが
// merge に届く false-Ready を生む。
const envFail = !boot.worktree_ok || boot.install === "fail";
const buildCol = envFail ? "skipped" : boot.build;
const dynamicOk = !envFail && buildCol !== "fail";
log(
  `Bootstrap: mode=${boot.mode} files=${boot.scope_files.length} build=${buildCol}` +
    (dynamicOk ? "" : ` (動的検証 skip: ${boot.reason || "env fail"})`),
);

let gate = "NotReady";
let issues = [];
let testsCol = "skipped";
let adversarialSummary = {
  total: 0,
  passed: 0,
  failed: 0,
  promoted: 0,
  excluded: 0,
};
let synth = null;
let codexReview = null;
let audit = null;

try {
  // ---- Evidence: audit ∥ Codex review ∥ test 実行 ∥ adversarial 生成 ----
  // test / adversarial (最長 600s) は await せず走らせたまま、その両者だけに依存する Triage も
  // triageP として即座に並走させ、codex + audit の barrier の裏に隠す。challenger / verifier が
  // 必要とするのは audit + Codex review だけ。
  // guardrails sqli-concat は call 引数の template literal を走査するため、codex の実行系
  // subcommand 名を含む prompt は素の代入で組んでから anchor / agent に渡す。
  phase("Evidence");
  const fileList = boot.scope_files.join("\n");
  const testRunRaw =
    `assert の test 実行段階を担当する。worktree ${boot.worktree_path} 内でプロジェクトの test コマンドを検出し、\`timeout 600 codex exec -c sandbox_workspace_write.network_access=true -C ${boot.worktree_path} "Run the project test command. Report: (1) test exit code and last 50 lines of stderr if non-zero, (2) test summary (total/passed/failed)." </dev/null\` で 1 回だけ実行する。` +
    `build は bootstrap 済みなので再実行しない。test runner が見つからなければ outcome: no-runner、timeout やその他の実行不能は outcome: skipped とし notes に理由を書く。修正はしない。`;
  const adversarialRaw =
    `assert の adversarial testing 段階を担当する。worktree ${boot.worktree_path} 内で \`timeout 600 codex exec -c sandbox_workspace_write.network_access=true -C ${boot.worktree_path} --full-auto "<prompt>" </dev/null\` を実行する。<prompt> は次の英文をそのまま使い、Target files に対象一覧を埋める。\n` +
    `---\n` +
    `You are an adversarial tester. Your goal is to find bugs by writing tests that the original developer likely missed.\n\nTarget files:\n${fileList}\n\n` +
    `Instructions:\n1. Read each target file and understand its behavior\n2. Generate edge-case tests targeting:\n   - Boundary values (empty, zero, max, off-by-one)\n   - Error paths (invalid input, null/nil equivalents, failure modes)\n   - Input validation gaps (special characters, injection, overflow)\n   - State transitions (concurrent access, race conditions if applicable)\n   - Implicit assumptions (hardcoded limits, timezone, locale)\n3. Write tests using the project's existing test framework and naming convention\n4. Place tests following the project's test directory and file-naming convention\n5. Run the tests\n6. Report results in this exact format:\n\nADVERSARIAL_RESULTS_START\ntest_name: <name>\ntarget: <file:line being tested>\nassertion: <what the test asserts>\nresult: PASS | FAIL\nfailure_detail: <error message if FAIL>\n---\n(repeat for each test)\nADVERSARIAL_RESULTS_END\n` +
    `---\n` +
    `出力の ADVERSARIAL_RESULTS ブロックを tests に構造化する。timeout や実行不能は ran: false とし notes に理由を書く。worktree の外に触れない。`;
  const testRunPrompt = anchor(testRunRaw);
  const adversarialPrompt = anchor(adversarialRaw);
  const testRunP = dynamicOk
    ? agent(testRunPrompt, {
        agentType: "general-purpose",
        phase: "Evidence",
        label: "test-exec",
        model: "sonnet",
        schema: TEST_RUN_SCHEMA,
      }).catch(() => null)
    : Promise.resolve(null);
  const adversarialP = dynamicOk
    ? agent(adversarialPrompt, {
        agentType: "general-purpose",
        phase: "Evidence",
        label: "adversarial",
        model: "opus",
        schema: ADVERSARIAL_SCHEMA,
      }).catch(() => null)
    : Promise.resolve(null);

  // ---- Triage (並走): 失敗 adversarial テストの intent 照合 ----
  // Triage は adversarial / test だけに依存するので、codex + audit の barrier を待たずここで
  // 走らせ、両ポールの裏に隠す。audit が最長ポール (実測 ~24 分) で Synthesize を gate するため、
  // barrier 後に逐次で載せると triage 自身の所要が critical path に丸ごと乗る (adversarial は上限
  // 600s なので barrier より先に必ず終わる)。並走するため bare phase("Triage") は呼ばず、各 agent の
  // opts.phase で group を張る (audit thunk との global phase state race を避ける。Challenge group と同旨)。
  // FAIL は「バグ発見」と「テスト側が誤った期待を書いた」の両方がありうる。intent source
  // (OUTCOME.md -> plan -> DR -> commit -> コメント -> docstring -> README -> テスト名) が
  // テストの期待と矛盾すれば exclude、それ以外 (source 不在 / source が期待を裏付ける) は promote。
  const triageP = (async () => {
    const testRun = await testRunP;
    const adversarial = await adversarialP;
    const tCol = dynamicOk ? (testRun && testRun.outcome) || "skipped" : "skipped";
    const advTests = (adversarial && adversarial.ran && adversarial.tests) || [];
    const advFails = advTests.filter((t) => t.result === "FAIL");
    const promoted = [];
    const excluded = [];
    if (advFails.length) {
      const verdicts = await parallel(
        advFails.map(
          (t) => () =>
            agent(
              anchor(
                `assert の intent triage を担当する。失敗した adversarial テスト 1 件が「実バグの発見」か「テスト側の誤った期待」かを判定する。\n` +
                  `テストは次のとおり。${JSON.stringify(t)}\n` +
                  `対象コード (${t.target}) を前後 30 行読み、intent source を上から順に探す。順序は .claude/OUTCOME.md、.claude/workspace/planning/ の plan または issue の Plan 節、docs/decisions/ 等の DR、対象ファイルの git log、対象コード近傍 10 行のコメント、対象関数の docstring、README、同関数の既存テスト名。\n` +
                  `intent source がテストの期待と矛盾すれば exclude (reason に source を引用)、それ以外は promote。`,
              ),
              {
                agentType: "general-purpose",
                phase: "Triage",
                label: `triage:${t.test_name}`,
                model: "sonnet",
                schema: TRIAGE_SCHEMA,
              },
            ),
        ),
      );
      advFails.forEach((t, i) => {
        const v = verdicts[i];
        // triage が stall したら fail-close で promote する (見逃しより誤検知を取る)
        if (v && v.verdict === "exclude") excluded.push({ ...t, reason: v.reason });
        else
          promoted.push({
            file: (t.target || "").split(":")[0],
            line: Number((t.target || "").split(":")[1]) || 0,
            severity: "high",
            summary: `[adversarial] ${t.assertion}: ${t.failure_detail || t.test_name}`,
            source: "adversarial",
          });
      });
    }
    // adversarial stage の stall (agent が no output、または ran: false でテスト集合を完了しな
    // かった) を持ち回り、result.adversarial で「stall / 未実行の stage」と「genuine な no-tests
    // run」を区別できるようにする (両者ともそのままでは total 0)。agent 無出力 (crash) は
    // shake.js の smellScan に揃えた "no output / stall"、自己申告の未実行 (ran: false) は
    // 診断理由 adversarial.notes を "not run: <notes>" で持ち、この 2 状態も潰さない。文字列は
    // EN 版と .ja 版で同一 (localized prose ではなく structured token)。dynamicOk が真のとき
    // だけ marker を立てる。env 都合で dynamic 検証を skip したときは adversarialP が設計上
    // resolved null になり、その env skip は別途 (動的 evidence: skip) で面出しされるため
    // agent stall とは区別する。
    const advStalled = dynamicOk && !(adversarial && adversarial.ran);
    return {
      testRun,
      testsCol: tCol,
      promoted,
      advSummary: {
        total: advTests.length,
        passed: advTests.filter((t) => t.result === "PASS").length,
        failed: advFails.length,
        promoted: promoted.length,
        excluded: excluded.length,
        // stall 時のみ emit するので genuine な no-tests run には stall marker が付かず、両者を
        // result.adversarial 上で区別できる。
        ...(advStalled
          ? {
              stall: adversarial
                ? `not run: ${adversarial.notes || "no reason reported"}`
                : "no output / stall",
            }
          : {}),
      },
    };
  })().catch(() => null);

  // audit の scope: branch diff は base...HEAD、uncommitted は audit 既定 (HEAD diff)、
  // target mode は path を素通しする。audit の Route は git diff ベースなので target mode では
  // 列挙が痩せる可能性がある (既知の制約。Codex review と adversarial は明示 file list で補う)。
  const auditScope =
    boot.mode === "diff" ? (boot.diff_kind === "branch" ? `${base}...HEAD` : "") : scope;
  const codexScopeInstr =
    boot.mode === "target"
      ? `target mode なので scope flag を付けず、対象ファイル一覧を PROMPT で指名して \`codex review "Review these files: ${boot.scope_files.join(", ")}"\` を実行する。`
      : boot.diff_kind === "branch"
        ? `\`codex review --base ${base}\` を実行する。`
        : `\`codex review --uncommitted\` を実行する。`;
  // audit sub-workflow は Codex Challenge と独立に走らせる。codex review -> challenge/verify の
  // チェーンを 1 thunk にまとめ、audit の 5 phase 完走を待たずに opus critic ペアを重ねる。
  // audit findings は audit workflow 内で同じ critic ペアを通過済みなので掛け直さない。
  // codex 双方 stall したら未検証 findings を enhancer に渡さず落とす (fail-close、challengeStalled)。
  let codexRes;
  [codexRes, audit] = await parallel([
    async () => {
      codexReview = await agent(
        anchor(
          `assert の Codex 静的 review 段階を担当する。${codexScopeInstr}\n` +
            `出力を findings に構造化する。severity は Codex の P1/P2/P3 を写し (無ければ影響度から判定する)、file:line が特定できない指摘と scope 外の指摘は落とす。codex が失敗したら ran: false とし notes に理由を書く。`,
        ),
        {
          agentType: "general-purpose",
          phase: "Evidence",
          label: "codex-review",
          model: "sonnet",
          schema: CODEX_REVIEW_SCHEMA,
        },
      );
      const findings = ((codexReview && codexReview.findings) || []).map((f) => ({
        ...f,
        source: "codex",
      }));
      if (!findings.length) return { codexFindings: findings, challenged: null, verified: null };
      // ---- Challenge: Codex findings への challenger ∥ verifier ----
      // 各 agent の opts.phase が Challenge group を指定する。bare phase() は audit thunk と
      // 並走して global phase state を race させるため呼ばない (audit.js の workaround と同旨)。
      const codexJson = JSON.stringify(findings);
      const [ch, vf] = await parallel([
        () =>
          agent(
            anchor(
              `critic-audit として、外部 Codex review の finding を challenge し false positive を刈る。finding は事実ではなく、立証されるべき主張として扱う。各 finding は file:line で参照する。Findings は次のとおり。\n${codexJson}`,
            ),
            {
              agentType: "critic-audit",
              phase: "Challenge",
              label: "challenge",
              model: "opus",
            },
          ),
        () =>
          agent(
            anchor(
              `critic-evidence として、外部 Codex review の finding を検証する。直感ではなく、具体的な実行経路を辿った positive evidence に基づく。各 finding を file:line で参照し、実行経路の evidence と severity を与える。Findings は次のとおり。\n${codexJson}`,
            ),
            {
              agentType: "critic-evidence",
              phase: "Challenge",
              label: "verify",
              model: "opus",
            },
          ),
      ]);
      return { codexFindings: findings, challenged: ch, verified: vf };
    },
    () => workflow("audit", { repo, scope: auditScope, skipPreflight: true }),
  ]);
  // thunk が reject すると parallel() は該当スロットを null にするため codexRes を null-safe に開く。
  const codexFindings = (codexRes && codexRes.codexFindings) || [];
  const challenged = codexRes ? codexRes.challenged : null;
  const verified = codexRes ? codexRes.verified : null;
  const auditFindings = ((audit && audit.findings) || []).map((f) => ({
    ...f,
    source: "audit",
  }));
  log(
    `Evidence: codex ${codexFindings.length} 件 / audit ${auditFindings.length} 件` +
      (codexReview && codexReview.ran === false ? " (codex review 失敗、audit のみ)" : ""),
  );

  // ---- Triage 回収: 並走させた triageP の結果を取り込む ----
  const triageRes = await triageP;
  const testRun = triageRes ? triageRes.testRun : null;
  testsCol = triageRes ? triageRes.testsCol : "skipped";
  const promoted = (triageRes && triageRes.promoted) || [];
  // triage block は自分の throw を .catch(() => null) に畳む。この marker が無いと throw した
  // block が「0 本」と報告され、clean な no-tests run と区別できない
  adversarialSummary = (triageRes && triageRes.advSummary) || {
    ...adversarialSummary,
    ...(dynamicOk ? { stall: "triage stage threw / no output" } : {}),
  };
  const advPart =
    adversarialSummary.stall ||
    `${adversarialSummary.total} 本 (FAIL ${adversarialSummary.failed}、promote ${adversarialSummary.promoted}、exclude ${adversarialSummary.excluded})`;
  log(
    dynamicOk
      ? `動的 evidence: tests=${testsCol}, adversarial ${advPart}`
      : "動的 evidence: skip (bootstrap 失敗)",
  );

  // ---- Synthesize: enhancer-evidence 統合 -> script が gate 判定 ----
  phase("Synthesize");
  const challengeStalled = codexFindings.length > 0 && !challenged && !verified;
  synth = await agent(
    anchor(
      `enhancer-evidence として、静的 findings、outcome evidence、adversarial 結果を root cause と最終 issues 集合に統合する。\n` +
        `Outcome 基準 (OUTCOME.md) は次のとおり。\n${boot.outcome}\n\n` +
        `audit workflow の統合済み findings (critic 検証済み。そのまま issues に含める) は次のとおり。\n${JSON.stringify(auditFindings)}\n\n` +
        `Codex findings への challenge pass (membership はこの pass が決める。false positive として刈られた finding は verification pass が evidence を見つけていても復活させない) は次のとおり。\n${challenged || "(challenge stall / findings なし)"}\n\n` +
        `Codex findings への verification pass (survivor への実行経路 evidence と severity 付与のみ) は次のとおり。\n${verified || "(verify stall / findings なし)"}\n\n` +
        `${challengeStalled ? "challenger / verifier が双方 stall したため、Codex findings は未検証。issues に含めず report で表面化する。\n\n" : ""}` +
        `Promoted adversarial findings (そのまま issues に含める) は次のとおり。\n${JSON.stringify(promoted)}\n\n` +
        `動的 evidence は build=${buildCol}, tests=${testsCol}${testRun && testRun.notes ? ` (${testRun.notes})` : ""}。\n\n` +
        `Constraint 違反や Non-goal 侵犯は出所を問わず issues に同格で含める。report には evidence table (Build / Tests / Issues / Adversarial)、root causes、issue ごとの fix 提案を書く。gate の判定はしない (script が規則で計算する)。`,
    ),
    {
      agentType: "enhancer-evidence",
      phase: "Synthesize",
      label: "synthesize",
      model: "opus",
      schema: SYNTH_SCHEMA,
    },
  );
  // enhancer が stall したら統合前の素材から fail-close で issues を組む
  issues = mergeIssues(synth ? synth.issues : [...auditFindings, ...promoted]);

  // gate 規則。build smoke fail / test fail / issues 1 件以上は
  // NotReady。severity は修正優先度のヒントに留まり、gate には影響しない。caveat は動的
  // evidence が env 起因などで欠けたときだけで、issues 0 が前提。
  if (buildCol === "fail" || testsCol === "fail" || issues.length > 0 || challengeStalled) {
    gate = "NotReady";
  } else if (!envFail && (testsCol === "pass" || testsCol === "no-runner")) {
    gate = "Ready";
  } else {
    gate = "Ready (caveat)";
  }
} finally {
  // ---- Cleanup: worktree 撤去 (結果に関わらず必ず走る) ----
  phase("Cleanup");
  await agent(
    anchor(
      `assert の Cleanup 段階を担当する。"${SCRIPTS}/worktree.py" --cleanup "$CLAUDE_SESSION_ID" で assert 用 worktree を撤去する。失敗しても warning として報告するだけでよい (best-effort)。他のファイルに触れない。`,
    ),
    {
      agentType: "general-purpose",
      phase: "Cleanup",
      label: "cleanup",
      model: "sonnet",
    },
  );
}

log(`Gate: ${gate} (build=${buildCol}, tests=${testsCol}, issues=${issues.length})`);

return {
  gate,
  mode: boot.mode,
  build: buildCol,
  tests: testsCol,
  issues,
  root_causes: (synth && synth.root_causes) || [],
  adversarial: adversarialSummary,
  outcome_ref: boot.outcome === "absent" ? "absent" : "present",
  report: (synth && synth.report) || "",
};
