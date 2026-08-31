// tsconfig-scope.test.js が「workflows 配下の .ts が型検査対象に含まれる」ことを
// 確認するために参照する固定フィクスチャ。テスト実行のたびに生成/削除すると
// サンドボックス環境で workflows/ 配下への書き込みが EPERM になるため、
// リポジトリに常設したファイルとして持つ。
export const tsconfigScopeFixture: number = 1;
