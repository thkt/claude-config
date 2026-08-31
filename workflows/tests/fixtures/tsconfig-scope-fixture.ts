// The fixture tsconfig-scope.test.js points at to confirm that a .ts under workflows reaches
// the type-check set. It is committed rather than written per run: the sandbox denies writes
// under workflows/, so creating it at test time fails with EPERM.
export const tsconfigScopeFixture: number = 1;
