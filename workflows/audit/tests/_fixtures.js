// audit.js を runWorkflow 経由でテストする各ファイルが個別に組んでいた agentStub
// (route/security/silence の既定応答 + challenge/verify/integrate/snapshot の差し替え)、
// callOf、snapshot prompt からの payload 抽出 (snapshotPayload) を 1 箇所に集める。
// focus: "security" のとき reviewer は security -> silence の順で起動し (audit.js の
// ROUTING["*.js"] / FOCUS 絞り込み)、rawFindings の id は R-1 (security) / R-2 (silence)
// に固定される。

const DEFAULT_ROUTE = { files: [{ path: "sample.js", churn: 0 }] };
const DEFAULT_SECURITY = {
  findings: [{ file: "sample.js", line: "1", severity: "high", summary: "security finding" }],
};
const DEFAULT_SILENCE = {
  findings: [{ file: "sample.js", line: "1", severity: "high", summary: "silence finding" }],
};
const DEFAULT_VERIFY = "verify pass output";

// opt にキーを渡すことで既定応答を上書きできる。デフォルト引数 (opt.foo ?? default) は値が
// undefined のときも発動してしまい「キーを渡さなかった」と「undefined を明示的に渡した」を
// 区別できないため、`"key" in opt` でキーの有無を見て既定を分ける。
export const defaultAgentStub =
  (opt = {}) =>
  (prompt, opts) => {
    const label = opts && opts.label;
    if (label === "route") return "route" in opt ? opt.route : DEFAULT_ROUTE;
    if (label === "security") return "security" in opt ? opt.security : DEFAULT_SECURITY;
    if (label === "silence") return "silence" in opt ? opt.silence : DEFAULT_SILENCE;
    if (label === "challenge") return opt.challenge;
    if (label === "verify") return "verify" in opt ? opt.verify : DEFAULT_VERIFY;
    if (label === "integrate") return opt.integrate;
    if (label === "snapshot") return opt.snapshot;
    return undefined;
  };

export const callOf = (calls, label) => calls.agent.find((c) => c.opts && c.opts.label === label);

const FENCE_BEGIN_RE = /^----- BEGIN ([A-Z0-9_ ]+) ([A-Za-z0-9]+) -----$/m;

// 対応する nonce の END が無ければ null を返す。fence が閉じられなかったことと、
// fence がそもそも無いことを、呼び出し側は同じ null として扱う。
const extractFenced = (prompt) => {
  const begin = prompt.match(FENCE_BEGIN_RE);
  if (!begin) return null;
  const [, label, nonce] = begin;
  const endRe = new RegExp(
    `^----- BEGIN ${label} ${nonce} -----\\n([\\s\\S]*?)\\n----- END ${label} ${nonce} -----$`,
    "m",
  );
  const body = prompt.match(endRe);
  return body ? { label, nonce, content: body[1] } : null;
};

// snapshot agent への prompt 末尾に payload が BEGIN/END marker で囲まれて埋め込まれる
// (audit.js の writeSnapshot / fenced 参照)。marker の内側だけを取り出して parse する。
// snapshot agent が起動しない、または marker が無い run では null を返す。
export const snapshotPayload = (calls) => {
  const call = callOf(calls, "snapshot");
  if (!call) return null;
  const fenced = extractFenced(call.prompt);
  if (!fenced) return null;
  return JSON.parse(fenced.content);
};
