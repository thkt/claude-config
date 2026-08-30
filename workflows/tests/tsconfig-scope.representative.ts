// Fixture only: gives tsconfig.json's include set ("**/*.ts") a real file to type-check,
// since no other workflows/**/*.ts exists yet. tsconfig-scope.test.js checks this path by
// glob matching alone, not by importing this module.
export const representative: string = "tsconfig-scope";
