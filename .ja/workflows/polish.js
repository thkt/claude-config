export const meta = {
  name: "polish",
  description:
    "Codex review + cleanup を決定論的に行う workflow。Codex の findings は critic-audit の challenge を必ず通り、triage (confirmed / disputed / downgraded / needs_context) は script が判定するため、fact 扱いの集約や challenge の skip が起きない。fix 後は critic-audit が post-fix diff で resolved / still_open を再判定し、still_open は reopened として結果に出る。単体で呼ぶ。入れ子で呼ぶ workflow は無い。",
  whenToUse:
    "diff の外部レンズ review と AI slop 除去を headless に行う。args は scope 文字列、または {scope, repo, mode, base}。scope 省略時は uncommitted な変更、無ければ base branch (既定 main) より先行する commit の diff (push 済み branch diff) を対象とする。mode: full (既定) は review -> fix -> rejudge -> cleanup、review は challenge 済み findings を返すだけ (fix しない)、cleanup は simplify + enhancer-code + テスト検証のみ。内部 reviewer の深い audit は audit workflow を使う。",
  phases: [
    { title: "Review" },
    { title: "Challenge" },
    { title: "Fix" },
    { title: "Rejudge" },
    { title: "Cleanup" },
  ],
};

// triage 表を script に置くのは、agent に verdict の解釈を任せると
// disputed を「念のため修正」したり needs_context を黙って落としたりする drift が入るため。
// mode を持つのは build との合成のため。build は audit と並走させたい review (読み取りのみ) と、
// fix 統合後に走らせたい cleanup を別のタイミングで呼ぶ。

const parseArgs = () => {
  if (typeof args === "object" && args) return args;
  if (typeof args !== "string") return {};
  const s = args.trim();
  if (s.startsWith("{")) {
    try {
      const parsed = JSON.parse(s);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // 壊れた JSON はそのまま scope の短縮記法へ落ちる
    }
  }
  return { scope: args };
};
const opts = parseArgs();
const scope = typeof opts.scope === "string" ? opts.scope : "";
const repo = typeof opts.repo === "string" ? opts.repo : "";
if (!repo) {
  return {
    stopped: "no-repo",
    why: `対象リポジトリを args.repo に絶対パスで渡す: Workflow({name: "polish", args: {repo: "/abs/path"}})。`,
  };
}
const mode = opts.mode === "review" || opts.mode === "cleanup" ? opts.mode : "full";
const base = typeof opts.base === "string" && opts.base.trim() ? opts.base.trim() : "main";

const anchor = (p) =>
  `git / ファイル / ビルドのコマンドはすべて ${repo} の repository から実行する (各シェルコマンドを \`cd ${repo} && \` で始める)。\n\n${p}`;
const scopeNote = (diffKind) =>
  scope
    ? `対象 scope は ${scope}。scope 外のファイルに触れる fix は落とす。`
    : diffKind === "branch"
      ? `対象は git diff ${base}...HEAD (push 済み branch diff)。diff 外のファイルに触れる fix は落とす。`
      : "対象は git diff HEAD (staged + unstaged)。diff 外のファイルに触れる fix は落とす。";
// fix agent は commit しないので、fix の編集は base...HEAD では拾えない。
const postFixDiff = (diffKind) => (diffKind === "branch" ? `git diff ${base}` : "git diff HEAD");

const CODEX_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["available", "has_changes", "diff_kind", "findings"],
  properties: {
    available: { type: "boolean", description: "codex CLI が使えたか" },
    has_changes: {
      type: "boolean",
      description: "diff に polish 対象の変更があるか",
    },
    diff_kind: {
      type: "string",
      enum: ["uncommitted", "branch", ""],
      description: "対象 diff の種類。branch は base より先行する commit の diff",
    },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "detail", "severity"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          detail: { type: "string" },
          file: { type: "string" },
          severity: { type: "string", enum: ["P1", "P2", "P3"] },
        },
      },
    },
    notes: { type: "string" },
  },
};

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
          severity: { type: "string", enum: ["P1", "P2", "P3"] },
          why: { type: "string" },
        },
      },
    },
  },
};

const REJUDGE_SCHEMA = {
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
            enum: ["resolved", "still_open"],
            description: "post-fix diff が finding を解消しているか",
          },
          why: { type: "string" },
        },
      },
    },
  },
};

const FIX_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["fixed", "stashed", "tests_pass"],
  properties: {
    fixed: { type: "array", items: { type: "string" } },
    stashed: {
      type: "array",
      items: { type: "string" },
      description: "テストを壊したため git stash で巻き戻した fix",
    },
    tests_pass: { type: "boolean" },
    notes: { type: "string" },
  },
};

const CLEANUP_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["edits", "tests_pass", "stashed"],
  properties: {
    edits: {
      type: "array",
      items: { type: "string" },
      description: "file:line 付きの編集要約",
    },
    tests_pass: { type: "boolean" },
    stashed: {
      type: "boolean",
      description: "テスト失敗で cleanup 編集を巻き戻したか",
    },
    notes: { type: "string" },
  },
};

let codex = {
  available: false,
  has_changes: true,
  diff_kind: "",
  findings: [],
  review_note: "cleanup 専用実行のため Review 段をスキップ",
};
let verdicts = [];
let survivors = [];
let needsContext = [];
let fix = null;
let reopened = [];
let rejudgeNotes = "";
// Review agent の呼び出し自体が結果を返さなかった (異常終了 / timeout) ときだけ立てる。
// available: false で答えた場合 (codex CLI なしという確定した結論) には立てない。
// Challenge / Fix が finding / survivor 0 件で終わることは、それ単体では純粋に
// diff がきれいだった場合と区別が付かないため、このフラグで最終返り値の両者を分ける。
let reviewDied = false;

if (mode !== "cleanup") {
  // ---- Review: 外部 Codex レンズ ----
  phase("Review");
  const detectNote = scope
    ? `まず \`git status\` と \`git diff HEAD\` で polish 対象の変更が存在するか確認する。無ければ has_changes: false、diff_kind 空で返す。あれば diff_kind: uncommitted とする。`
    : `まず対象 diff の種類を判定する。\`git status --porcelain\` に出力があれば diff_kind: uncommitted。無ければ \`git rev-list --count ${base}..HEAD\` が 1 以上で diff_kind: branch (push 済み branch diff)。どちらにも該当しなければ has_changes: false、diff_kind 空で返す。`;
  const codexResult = await agent(
    anchor(
      `外部 Codex review stage。${detectNote}\n` +
        `次に \`which codex\` を確認する。無ければ available: false、findings 空で返す。\n` +
        `diff_kind が branch のときは \`codex review --base ${base}\` を実行する (codex 0.144.6 では scope flag (--uncommitted / --base / --commit) と PROMPT 引数が排他のため、branch diff では PROMPT を渡せず simplicity レンズは Codex 既定レンズに落ちる)。\n` +
        `それ以外は \`codex review "Review for logic, architecture, data flow, and code simplicity (flag over-complexity and unnecessary indirection)"\` を実行する。PROMPT を渡すときは scope flag を付けない (Codex 自身が git status を読む)。PROMPT を省くと simplicity レンズが落ちるため uncommitted では必ず渡す。\n` +
        `出力を findings に構造化する。id は F1, F2, ... と振り、severity は Codex の P1/P2/P3 を写す (無ければ影響度から判定する)。` +
        (scope
          ? `対象 scope は ${scope}。scope 外のファイルに触れる findings は落とす。`
          : `判定した diff (uncommitted なら git diff HEAD、branch なら git diff ${base}...HEAD) の外のファイルに触れる findings は落とす。`),
    ),
    {
      label: "codex",
      phase: "Review",
      agentType: "general-purpose",
      schema: CODEX_SCHEMA,
      model: "sonnet",
    },
  );
  reviewDied = !codexResult;
  // CODEX_SCHEMA に review_note は無い (additionalProperties: false) ため、検証を通った
  // codexResult がこの値を自分で持つことは無い。ここで確定させる。
  if (codexResult) {
    codex = codexResult;
    codex.review_note = codex.available ? "Review 完了" : "codex CLI なし";
  } else {
    codex = {
      available: false,
      has_changes: true,
      diff_kind: "",
      findings: [],
      review_note: "Review agent が結果を返さなかった",
    };
  }
  if (!codex.has_changes) {
    return { mode, polished: false, why: "diff に変更が無く polish 対象なし" };
  }
  log(
    codex.available
      ? `Codex findings ${codex.findings.length} 件。`
      : `${codex.review_note}。findings なしで cleanup へ。`,
  );

  // ---- Challenge: critic-audit による false positive 除去 ----
  if (codex.findings.length) {
    phase("Challenge");
    const challenged = await agent(
      anchor(
        `critic-audit。外部 Codex review の findings 一式を adversarial に challenge し、finding ごとに verdict を返す。\n` +
          `verdict の基準は次のとおり。confirmed = 実在し severity も妥当 / disputed = false positive / downgraded = 実在するが severity 過大 (下げた severity を severity に入れる) / needs_context = コードだけでは判定できず人間の文脈が要る。\n` +
          `Findings は次のとおり。\n${JSON.stringify(codex.findings)}`,
      ),
      {
        agentType: "critic-audit",
        phase: "Challenge",
        label: "challenge",
        schema: VERDICTS_SCHEMA,
        model: "opus",
        // judge 段は難易度軸で xhigh を選ぶ (docs の "the hardest coding and agentic tasks")。
        // 所要時間は数分で long-horizon の基準には届かないが、finding を退ける判断の質が
        // false positive を左右するので token でなく精度側に振る。
        effort: "xhigh",
      },
    );
    // challenge が落ちたら全 findings を confirmed 扱いで前進する (fail-open)
    verdicts = challenged
      ? challenged.verdicts
      : codex.findings.map((f) => ({
          id: f.id,
          verdict: "confirmed",
          severity: f.severity,
        }));

    // triage は script が決定論的に行う。confirmed / downgraded が fix 候補、disputed は落とす、
    // needs_context は呼び出し元に表面化する。fix 候補は P1/P2 のみ (P3 は cleanup 領分)。
    const byId = new Map(codex.findings.map((f) => [f.id, f]));
    for (const v of verdicts) {
      const f = byId.get(v.id);
      if (!f) continue;
      if (v.verdict === "needs_context") {
        needsContext.push({ ...f, why: v.why || "" });
        continue;
      }
      if (v.verdict === "disputed") continue;
      const severity = v.verdict === "downgraded" && v.severity ? v.severity : f.severity;
      if (severity === "P1" || severity === "P2") survivors.push({ ...f, severity });
    }
    log(
      `triage: 生存 ${survivors.length} / needs_context ${needsContext.length} / 棄却 ${codex.findings.length - survivors.length - needsContext.length}`,
    );
  }

  if (mode === "review") {
    return {
      mode,
      codex_available: codex.available,
      review_note: codex.review_note,
      diff_kind: codex.diff_kind,
      survivors,
      needs_context: needsContext,
    };
  }

  // ---- Fix: 生存 findings の修正 ----
  if (survivors.length) {
    phase("Fix");
    fix = await agent(
      anchor(
        `challenge を生き残った findings を severity の高い順に修正する。${scopeNote(codex.diff_kind)}\n` +
          `修正後にプロジェクトのテストコマンドを検出して実行し、テストを壊した fix は git stash で巻き戻す。commit しない。\n` +
          `Findings は次のとおり。\n${JSON.stringify(survivors)}`,
      ),
      {
        label: "fix",
        phase: "Fix",
        agentType: "general-purpose",
        schema: FIX_SCHEMA,
        model: "opus",
        effort: "high",
      },
    );

    // ---- Rejudge: fix が finding を実際に解消したかの再判定 ----
    // fixed[] は fix agent の自己申告なので、それを resolved の根拠にしない。
    phase("Rejudge");
    const rejudged = await agent(
      anchor(
        `critic-audit。fix stage 後の diff (\`${postFixDiff(codex.diff_kind)}\`) を読み、survivor ごとに finding が解消したかを判定する。\n` +
          `verdict の基準は次のとおり。resolved = post-fix diff の変更が finding を解消している / still_open = diff に該当する変更が無い、または変更が finding を解消していない。\n` +
          `fix agent の自己申告は根拠にせず diff を根拠にする。該当する変更が diff に見当たらない survivor は still_open とする。\n` +
          `この diff には base branch が先に進んだぶんの他人の変更も混ざる。survivor が指す箇所に対応する変更だけを根拠にし、無関係な変更を解消の根拠にしない。\n` +
          (scope ? `対象 scope は ${scope}。scope 外の変更は根拠にしない。\n` : "") +
          `参考として fix stage の自己申告は fixed: ${JSON.stringify(fix ? fix.fixed : [])} / stashed: ${JSON.stringify(fix ? fix.stashed : [])}。\n` +
          `Survivors は次のとおり。\n${JSON.stringify(survivors)}`,
      ),
      {
        agentType: "critic-audit",
        phase: "Rejudge",
        label: "rejudge",
        schema: REJUDGE_SCHEMA,
        model: "opus",
        effort: "xhigh",
      },
    );
    if (rejudged) {
      // agent が評決を落としたとき、それを resolved と読まない。
      const byVerdict = new Map(rejudged.verdicts.map((v) => [v.id, v]));
      reopened = survivors
        .filter((s) => (byVerdict.get(s.id) || {}).verdict !== "resolved")
        .map((s) => ({
          id: s.id,
          severity: s.severity,
          why: (byVerdict.get(s.id) || {}).why || "",
        }));
      log(`rejudge: reopened ${reopened.length} / survivors ${survivors.length}`);
    } else {
      // 空配列にすると「再判定して 0 件」と読めてしまう。
      reopened = null;
      rejudgeNotes =
        "rejudge agent が結果を返さなかったため resolved / still_open を判定していない";
    }
  }
}

// ---- Cleanup: simplify -> enhancer-code -> テスト検証 ----
// どちらも bug 探しではないので critic-audit challenge を通さず直接適用する。
phase("Cleanup");
const cleanupTarget =
  codex.diff_kind === "branch" ? `git diff ${base}...HEAD (push 済み branch diff)` : "現在の diff";
await agent(
  anchor(
    `Skill tool で skill "simplify" を呼び、${cleanupTarget}に cleanup 専用パス (reuse / simplification / efficiency / altitude) を適用する。引数なしで拒否されたら diff の scope を渡す。commit しない。`,
  ),
  {
    label: "simplify",
    phase: "Cleanup",
    agentType: "general-purpose",
    model: "sonnet",
  },
);
await agent(
  anchor(
    `${cleanupTarget}から AI slop を除去し simplification ルールを適用し、テストを監査する。simplify の編集より preservation ルール (迷ったら残す) を優先する。`,
  ),
  {
    agentType: "enhancer-code",
    phase: "Cleanup",
    label: "enhancer",
    model: "sonnet",
  },
);
const cleanup = (await agent(
  anchor(
    `プロジェクトのテストコマンドを検出して実行する。失敗したら cleanup の編集 (直前の simplify / enhancer-code による変更) を git stash で巻き戻し、stashed: true で報告する。適用された編集の要約を file:line 付きで edits に列挙する。commit しない。`,
  ),
  {
    label: "validate",
    phase: "Cleanup",
    agentType: "general-purpose",
    schema: CLEANUP_SCHEMA,
    model: "sonnet",
  },
)) || {
  edits: [],
  tests_pass: false,
  stashed: false,
  notes: "validate agent が結果を返さなかった",
};

// WORKFLOWS.md § Degradation recording: Review agent が死んで findings が [] のままだと
// Challenge (challenge する finding が無い) と Fix (fix する survivor が無い) も走らない。
// これは本物の「きれいな diff」ではなく agent が死んだ結果に過ぎない。3 段の名前と、
// それに伴って diff_kind: "" -> cleanupTarget が fallback したことをここへ載せ、
// 本当に何もすることが無かった run と区別できるようにする。
const unverified = reviewDied
  ? [
      codex.review_note,
      "Challenge は未実施: Review agent が結果を返さず challenge する finding が無かった",
      "Fix は未実施: Review agent が結果を返さず fix する survivor が無かった",
      "Cleanup 対象は「現在の diff」へ fallback した: Review agent が結果を返さず diff_kind が空のままだった",
    ]
  : [];

return {
  mode,
  codex_available: codex.available,
  review_note: codex.review_note,
  diff_kind: codex.diff_kind,
  findings: codex.findings.length,
  survivors: survivors.length,
  fixed: fix ? fix.fixed : [],
  stashed_fixes: fix ? fix.stashed : [],
  reopened,
  rejudge_notes: rejudgeNotes,
  needs_context: needsContext,
  unverified,
  cleanup,
};
