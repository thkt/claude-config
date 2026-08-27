export const meta = {
  name: "shake",
  description:
    "flaky テスト検出を決定論的に行う workflow。対象テストを 4 次元 (repeat / order / parallelism / seed) で各 10 回 shake し、静的 smell scan を並走させて confirmed-flaky / latent-flaky / stable に分類する。実行回数と分類規則は script が強制するため、回数の間引きや甘い stable 判定が起きない。confirmed-flaky は root cause を fix し、re-shake で検証する。",
  whenToUse:
    "テストが時々落ちる、CI が不定期に赤くなる、green なテストの潜在 flakiness を洗いたいとき。単一バグの修正は fix、静的レビューのみは audit workflow を使う。対象リポジトリを指定する (必須)。指定しない場合は no-repo で早期 stop する。scope (test path / suite filter 文字列) で対象を絞り込める。省略時は working tree と base branch diff (base、デフォルト main) で触れたテストファイルが対象。",
  phases: [{ title: "Route" }, { title: "Shake" }, { title: "Fix" }],
};

// 設計上の要点は 3 つ。
// 1. 「各次元 ≥10 回」は schema (runs minItems) + script 検算の二重で強制する。LLM に任せると
//    回数を自己申告で間引けるが、workflow では 10 件の個別 run 記録が無い次元を
//    unshaken として扱い、stable 判定から構造的に締め出す (fail-close)。
// 2. 分類 (confirmed-flaky / latent-flaky / stable) は agent の申告ではなく、run 記録と
//    smell hit から script が規則で計算する。
// 3. 4 次元 + smell scan は target ごとに並列、target 間は pipeline で独立に流す
//    (最長 target が全体を塞がない)。
//
// verdict に inconclusive を足す。shake agent の stall や
// 10 回未満の記録で次元が unshaken になった場合、stable を名乗らせないための受け皿。
// コマンド内の回番号プレースホルダーは {RUN} (角括弧は guardrails raw-html が HTML タグと
// 誤検知するため使わない)。

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
const base = typeof opts.base === "string" && opts.base.trim() ? opts.base.trim() : "main";
const repo = typeof opts.repo === "string" ? opts.repo : "";
if (!repo) {
  return {
    stopped: "no-repo",
    why: `対象リポジトリを args.repo に絶対パスで渡す: Workflow({name: "shake", args: {repo: "/abs/path"}})。`,
  };
}

const anchor = (p) =>
  `git / ファイル / テストのコマンドはすべて ${repo} の repository から実行する (各シェルコマンドを \`cd ${repo} && \` で始める)。\n\n${p}`;

const RUNS = 10;
const MAX_FIX_ATTEMPTS = 3;
const DIMENSIONS = [
  { key: "repeat", exposes: "unseeded randomness / timing" },
  { key: "order", exposes: "テスト間の共有状態" },
  { key: "parallelism", exposes: "共有リソースの race" },
  { key: "seed", exposes: "PRNG への直接依存" },
];

// Scope Invariant と anti-gaming。fix と
// invariant check の両 prompt に埋め込む共通規範。
const INVARIANT_RULES =
  `flaky fix はテストの実行方法を変えるものであり、assert 内容を変えるものではない。\n` +
  `許容されるのは clock 注入 / fake timers、seed 固定、テストごとの状態隔離、I/O boundary の mock、一意な temp dir / port。\n` +
  `禁止されるのは assertion の緩和や tolerance の拡大、テストの skip / .only 化 / 除去、常に通る stub への置換、blanket retry の追加、shake コマンドや回数の改変。` +
  `禁止ルートは flaky を silent gap に変換するため、flake そのものより悪い。`;

// trigger と root-cause fix の対応表。
const FIX_DIRECTIONS =
  `wall-clock -> clock を注入する。fake timers (jest.useFakeTimers, tokio::time::pause)\n` +
  `random -> seed を固定する。生の乱数値でなく導出された不変条件を assert する\n` +
  `fixed-sleep -> 実際の条件を await する。clock を fake する\n` +
  `shared-state -> テストごとに fresh fixture。teardown で reset。global を除去する\n` +
  `order -> 各テストを self-contained にする。randomized order は有効のまま維持する\n` +
  `fixed-path-io -> テストごとに一意な temp dir / port。外部 boundary を mock する`;

const ROUTE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ecosystem", "targets"],
  properties: {
    ecosystem: { type: "string" },
    targets: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "file", "commands"],
        properties: {
          id: { type: "string" },
          file: { type: "string" },
          commands: {
            type: "object",
            additionalProperties: false,
            required: ["repeat", "order", "parallelism", "seed"],
            properties: {
              repeat: { type: "string" },
              order: { type: "string" },
              parallelism: { type: "string" },
              seed: { type: "string" },
            },
          },
        },
      },
    },
    reason: { type: "string" },
  },
};

const SHAKE_RUN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ran", "runs"],
  properties: {
    ran: { type: "boolean" },
    runs: {
      type: "array",
      minItems: RUNS,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["pass"],
        properties: {
          pass: { type: "boolean" },
          note: { type: "string", description: "fail 時のエラー要点" },
        },
      },
    },
    notes: { type: "string" },
  },
};

const SMELL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["smells"],
  properties: {
    smells: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["smell", "location", "evidence", "fix_direction"],
        properties: {
          smell: {
            type: "string",
            enum: ["wall-clock", "unseeded-random", "fixed-sleep", "shared-state", "fixed-path-io"],
          },
          location: { type: "string", description: "file:line" },
          evidence: { type: "string" },
          fix_direction: { type: "string" },
        },
      },
    },
  },
};

const FIX_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["applied", "trigger", "summary"],
  properties: {
    applied: { type: "boolean" },
    trigger: { type: "string" },
    changed_files: { type: "array", items: { type: "string" } },
    summary: { type: "string" },
  },
};

const INVARIANT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["held", "reason"],
  properties: {
    held: { type: "boolean" },
    reason: { type: "string" },
  },
};

// run 記録から次元 verdict を計算する。10 件未満は unshaken (stall と同格)。
// 全 pass = stable、全 fail = broken (flaky でなく常時失敗、scope 外として報告)、
// 混在 = flaky。
const dimVerdict = (result) => {
  if (!result || !result.ran || !Array.isArray(result.runs) || result.runs.length < RUNS) {
    return "unshaken";
  }
  const passes = result.runs.filter((r) => r.pass).length;
  if (passes === result.runs.length) return "stable";
  if (passes === 0) return "broken";
  return "flaky";
};

// ---- Route: ecosystem 検出と target / 次元別コマンドの決定 ----
phase("Route");
const scopeInstr = scope
  ? `対象は "${scope}" (test path / file / suite filter)。該当するテストファイルまたは filter 単位で targets を列挙する。`
  : `対象指定は無い。\`git diff --name-only\` と \`git diff ${base}...HEAD --name-only\` の和集合からテストファイルのみを targets とする。両方空なら targets: [] で返し、reason に説明を書く。`;
const route = (await agent(
  anchor(
    `shake の Route 段階を担当する。\n` +
      `1. ${scopeInstr}\n` +
      `2. project manifest から test ecosystem (cargo test / nextest / jest / vitest 等) を特定する。\n` +
      `3. target ごとに 4 次元のコマンドを組む。各コマンドは対象テストだけを 1 回実行するもので、shake 実行者が ${RUNS} 回ループする前提。文字列 {RUN} を含めると実行時に回番号 (1..${RUNS}) へ置換される。\n` +
      `   repeat はそのまま繰り返す通常実行 / order は実行順を毎回異なる seed で randomize ({RUN} を seed に使う) / parallelism は serial と max-worker を交互に切り替え ({RUN} の偶奇で分岐する 1 行コマンド) / seed は suite が明示 seed を受けるなら毎回異なる seed、受けないなら空文字列。\n` +
      `   例として jest なら order は --shuffle と seed 指定、parallelism は --runInBand と最大 worker の切替。次元が ecosystem 的に構成不能なら空文字列にする。\n` +
      `テストの実行も修正もしない。この段階の仕事はコマンドの決定だけ。`,
  ),
  {
    agentType: "general-purpose",
    phase: "Route",
    label: "route",
    model: "sonnet",
    schema: ROUTE_SCHEMA,
  },
)) || {
  ecosystem: "",
  targets: [],
  reason: "route agent が出力を返さなかった",
};

if (!route.targets.length) {
  return { stopped: "no-targets", why: route.reason || "対象テストが無い。" };
}
log(`Route: ecosystem=${route.ecosystem} targets=${route.targets.length}`);

// ---- Shake + Fix: target ごとに独立して流す ----
const results = await pipeline(
  route.targets,
  // stage 1: 4 次元 shake ∥ 静的 smell scan
  async (t) => {
    const dims = DIMENSIONS.map((d) => ({
      ...d,
      command: (t.commands || {})[d.key] || "",
    }));
    const [smell, ...shakes] = await parallel([
      () =>
        agent(
          anchor(
            `shake の静的 smell scan を担当する。対象テスト ${t.file} とその setup / fixture / helper を ugrep で走査し、現在 pass していても潜在 flaky な兆候を報告する。\n` +
              `smell と grep パターンは次のとおり。wall-clock (Date.now, new Date(, Instant::now, SystemTime::, time.Now) / unseeded-random (Math.random, thread_rng, rand::random, faker) / fixed-sleep (setTimeout, thread::sleep, tokio::time::sleep, sleep() / shared-state (static mut, module-level の可変 global, singleton, per-test reset の欠如) / fixed-path-io (固定 /tmp パス, 固定 port, 実 network, env 読み)。\n` +
              `hit ごとに file:line、根拠、root-cause fix の方向を書く。fix 方向の対応表は次のとおり。\n${FIX_DIRECTIONS}\n` +
              `テスト本体のロジックに関する一般レビューはしない。`,
          ),
          {
            agentType: "general-purpose",
            phase: "Shake",
            label: `smell:${t.id}`,
            model: "sonnet",
            schema: SMELL_SCHEMA,
          },
        ),
      ...dims.map((d) => () => {
        if (!d.command)
          return Promise.resolve({
            ran: false,
            runs: [],
            notes: "unsupported",
          });
        return agent(
          anchor(
            `shake の ${d.key} 次元を担当する (露出対象は ${d.exposes})。コマンド \`${d.command}\` を ${RUNS} 回実行する。{RUN} が含まれる場合は回番号 1..${RUNS} に置換する。\n` +
              `各回の pass/fail を runs に 1 回 1 要素で記録する (${RUNS} 要素必須。省略や集計での置き換えは不可)。fail した回は note にエラーの要点を写す。\n` +
              `テストコードもコマンドも変更しない。回数を減らさない。途中で flaky と確信しても ${RUNS} 回すべて実行する。`,
          ),
          {
            agentType: "general-purpose",
            phase: "Shake",
            label: `shake:${t.id}:${d.key}`,
            model: "sonnet",
            schema: SHAKE_RUN_SCHEMA,
          },
        );
      }),
    ]);
    const dimResults = dims.map((d, i) => {
      const r = shakes[i];
      const verdict = d.command ? dimVerdict(r) : "unsupported";
      return {
        dimension: d.key,
        verdict,
        fails:
          verdict === "flaky" || verdict === "broken" ? r.runs.filter((x) => !x.pass).length : 0,
        note: (r && r.notes) || "",
      };
    });
    // smell scan の stall (agent が no output) を持ち回り、per-target 結果で「stall した
    // scan の空 smells」と「genuine な no-smell scan」を区別できるようにする。文字列は
    // adrift.js の "no output / stall" に揃え、EN 版と .ja 版で同一 (localized prose では
    // なく structured token)。
    return {
      dimResults,
      smells: (smell && smell.smells) || [],
      smellScan: smell ? "" : "no output / stall",
    };
  },
  // stage 2: script 分類 -> confirmed-flaky のみ fix ループ
  async (shaken, t) => {
    if (!shaken) return null;
    const { dimResults, smells } = shaken;
    const triggers = dimResults.filter((d) => d.verdict === "flaky");
    const broken = dimResults.filter((d) => d.verdict === "broken");
    const unshaken = dimResults.filter((d) => d.verdict === "unshaken");
    let verdict;
    if (triggers.length) verdict = "confirmed-flaky";
    else if (broken.length) verdict = "broken";
    else if (unshaken.length) verdict = "inconclusive";
    else if (smells.length) verdict = "latent-flaky";
    else verdict = "stable";
    log(
      `${t.id}: ${verdict}` +
        (triggers.length ? ` (trigger: ${triggers.map((d) => d.dimension).join(", ")})` : ""),
    );

    const fix = {
      applied: false,
      attempts: 0,
      reshake: "",
      invariant: "",
      blocker: "",
    };
    if (verdict === "confirmed-flaky") {
      let history = "";
      for (let attempt = 1; attempt <= MAX_FIX_ATTEMPTS; attempt++) {
        fix.attempts = attempt;
        const fixed = await agent(
          anchor(
            `shake の fix 段階を担当する。confirmed-flaky なテスト ${t.file} の root cause を修正する (試行 ${attempt}/${MAX_FIX_ATTEMPTS})。\n` +
              `trigger 次元は ${triggers.map((d) => `${d.dimension} (${d.fails}/${RUNS} fail)`).join(", ")}。\n` +
              `静的 smell (根本原因の候補) は次のとおり。\n${JSON.stringify(smells)}\n` +
              `fix 方向の対応表は次のとおり。\n${FIX_DIRECTIONS}\n\n${INVARIANT_RULES}\n` +
              (history
                ? `\n前回までの試行と失敗理由は次のとおり (invariant 違反があれば先に巻き戻してから正しく直す)。\n${history}`
                : ""),
          ),
          {
            agentType: "general-purpose",
            phase: "Fix",
            label: `fix:${t.id}#${attempt}`,
            model: "opus",
            schema: FIX_SCHEMA,
          },
        );
        if (!fixed || !fixed.applied) {
          history += `試行 ${attempt} は fix 適用に至らず (${(fixed && fixed.summary) || "agent stall"})\n`;
          continue;
        }
        // 独立した invariant check ∥ trigger 次元の re-shake
        const [inv, ...reshakes] = await parallel([
          () =>
            agent(
              anchor(
                `shake の invariant check を担当する。\`git diff -- ${t.file}\` と fix が触れたファイル (${JSON.stringify(fixed.changed_files || [])}) の diff を読み、次の規範が守られているか判定する。fix 実施者の申告ではなく diff の事実で判定する。\n${INVARIANT_RULES}\n違反があれば held: false とし、reason に該当 diff を引用する。`,
              ),
              {
                agentType: "critic-audit",
                phase: "Fix",
                label: `invariant:${t.id}#${attempt}`,
                model: "opus",
                schema: INVARIANT_SCHEMA,
              },
            ),
          ...triggers.map(
            (trg) => () =>
              agent(
                anchor(
                  `shake の re-shake を担当する。fix 後のテストをコマンド \`${t.commands[trg.dimension]}\` で ${RUNS} 回実行する (${trg.dimension} 次元)。{RUN} は回番号 1..${RUNS} に置換する。各回の pass/fail を runs に 1 回 1 要素で記録する (${RUNS} 要素必須)。テストコードもコマンドも変更しない。`,
                ),
                {
                  agentType: "general-purpose",
                  phase: "Fix",
                  label: `reshake:${t.id}:${trg.dimension}#${attempt}`,
                  model: "sonnet",
                  schema: SHAKE_RUN_SCHEMA,
                },
              ),
          ),
        ]);
        // invariant 違反は fix 成立と認めない (stall も fail-close で違反扱い)
        if (!inv || !inv.held) {
          fix.invariant = (inv && inv.reason) || "invariant check stall (fail-close)";
          history += `試行 ${attempt} は invariant 違反。${fix.invariant}\n`;
          continue;
        }
        const reshakeVerdicts = triggers.map((trg, i) => ({
          dimension: trg.dimension,
          verdict: dimVerdict(reshakes[i]),
        }));
        const residual = reshakeVerdicts.filter((r) => r.verdict !== "stable");
        if (!residual.length) {
          fix.applied = true;
          fix.invariant = "held";
          fix.reshake = `全 trigger 次元 ${RUNS}/${RUNS} stable`;
          break;
        }
        fix.reshake = residual.map((r) => `${r.dimension}=${r.verdict}`).join(", ");
        history += `試行 ${attempt} は re-shake で残存 (${fix.reshake})\n`;
      }
      if (!fix.applied) {
        // 3 回の fix 試行を生き延びた flake は弱体化でなく blocker 報告
        fix.blocker = `flake が ${fix.attempts} 回の fix 試行を生き延びた。テストを弱めず blocker として報告する。`;
      }
    }
    return {
      id: t.id,
      file: t.file,
      verdict,
      triggers: triggers.map((d) => ({
        dimension: d.dimension,
        fails: `${d.fails}/${RUNS}`,
      })),
      broken: broken.map((d) => d.dimension),
      unshaken: unshaken.map((d) => d.dimension),
      smells,
      // smell scan が stall した時だけ出す。genuine stable な target には stall marker が
      // 付かず、両者を per-target 結果で区別できる。
      ...(shaken.smellScan ? { smellScan: shaken.smellScan } : {}),
      fix,
    };
  },
);

const verdictsOut = results.filter(Boolean);
// pipeline が null に落とした target (stage が no output) を route.targets と results の
// index-zip で復元し、audit.js の per-unit drop accounting に倣う。silently 消えた
// target を id として最終返り値へ残す。
const dropped = route.targets.filter((_, i) => !results[i]).map((t) => t.id);
const blockers = verdictsOut.filter((r) => r.fix && r.fix.blocker);
const counts = verdictsOut.reduce((acc, r) => {
  acc[r.verdict] = (acc[r.verdict] || 0) + 1;
  return acc;
}, {});
log(
  `Shake 完了: ${verdictsOut.length} target (${Object.entries(counts)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ")})` +
    (dropped.length ? ` dropped=${dropped.length}` : "") +
    (blockers.length ? ` blocker=${blockers.length}` : ""),
);

return {
  ecosystem: route.ecosystem,
  runs_per_dimension: RUNS,
  targets: verdictsOut,
  dropped,
  blockers: blockers.map((r) => ({
    id: r.id,
    file: r.file,
    why: r.fix.blocker,
  })),
};
