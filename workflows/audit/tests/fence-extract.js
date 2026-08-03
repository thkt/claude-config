// audit.js の fenced() が生成する BEGIN/END marker
// ("----- BEGIN <LABEL> <nonce> -----" ... "----- END <LABEL> <nonce> -----") から中身を
// 取り出す。audit.degradation.test.js と audit.seam.test.js の両方が同じ marker 形式を
// 前提にするため、抽出ロジックをここに一本化する (marker 形式が変われば両方の呼び出し元が
// 追随できるよう、実装は 1 箇所に置く)。

// BEGIN marker: "----- BEGIN <LABEL> <nonce> -----" (行頭開始)。nonce が呼び出しごとに
// 同じかどうかで「同一 run 内の使い回し」と「別 run での作り直し」を見分ける。
const FENCE_BEGIN_RE = /^----- BEGIN ([A-Z0-9_ ]+) ([A-Za-z0-9]+) -----$/m;

// prompt から fenced 領域を marker の nonce ごと取り出す。nonce が一致する END が
// 無ければ null (fencing 未実装、または nonce 不一致で閉じられなかったことを示す)。
export const extractFenced = (prompt) => {
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
