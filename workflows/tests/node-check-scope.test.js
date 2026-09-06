// `node --check <file>.ts` does not type-check the file: Node strips only what it recognizes
// as type syntax and runs the rest through the same parser it uses for `.js`. Measured
// directly against a `.ts` file whose types are valid TypeScript but whose value-level code is
// broken (e.g. a reference to an undeclared name, a syntax error type stripping does not
// touch): on Node 24.18.0, `node --check` exits 0 regardless of the break. On Node 26.8.0 the
// exit code instead depends on which break the fixture carries (some still exit 0, some exit
// 1), so neither version can be asserted as "catches a broken .ts" or "always passes one".
//
// That split is Node's own behavior, not this repository's, so it is recorded here as a
// comment rather than as a test that would pin one Node version's answer and break on the
// next upgrade. What this repository does control is which files reach `node --check` at all:
// workflows/code/tests/code.model.test.js's T-041 asserts that the `modules` array its static
// gate hands to `node --check` never carries a `.ts` entry, so a `.ts` file relying on that
// gate for its syntax cannot silently pass through it.
