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
