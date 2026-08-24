// Shared by meta-contract.test.js and run-workflow.test.js: both need an independent, non-eval
// oracle that extracts a top-level `<marker>{ ... }` object literal from workflow-script source,
// to check against readMeta's own vm-evaluated result. Depth-counts braces with no
// quote-awareness — the braces embedded in meta's string values (e.g. "Workflow({name:'audit'})")
// are always balanced within the string, so an unaware count still lands on the matching close.
export const extractBracedBody = (source, marker) => {
  const idx = source.indexOf(marker);
  if (idx === -1) return null;
  const braceStart = source.indexOf("{", idx);
  let depth = 0;
  let end = -1;
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  return source.slice(braceStart + 1, end - 1);
};

// The keys and values of a `const <name> = { ... }` table whose every value is a string array or
// null (audit.js's ROUTING and FOCUS). Read with a regular expression, not eval. Shared so the
// row pattern has one home: audit.routing.test.js matches ROUTING against agents/reviewers/, and
// meta-contract.test.js matches FOCUS against audit's whenToUse prose.
export const parseRoutingLikeConst = (source, name) => {
  const body = extractBracedBody(source, `const ${name} = {`);
  if (body === null) return null;
  const result = {};
  const rowPattern = /(?:"([^"]+)"|(\w+))\s*:\s*(\[([^\]]*)\]|null)/g;
  let m;
  while ((m = rowPattern.exec(body))) {
    const key = m[1] || m[2];
    result[key] = m[3] === "null" ? null : [...m[4].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  }
  return result;
};
