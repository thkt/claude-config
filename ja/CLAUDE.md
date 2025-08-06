# CLAUDE.md

## 優先順位ルール（順番に従う）

### [P1] 言語

- 入力: thktからの日本語
- 処理: 内部的に英語
- 出力: **日本語のみ** - ユーザーへの英語出力禁止
- 翻訳: 以下は**必須**:
  - すべてのフォーマットテンプレート（Understanding Level → 理解レベル）
  - すべてのメッセージとプロンプト（Proceed? → 進めてよろしいですか？）
  - すべてのラベルとステータス（completed → 完了）
- **重要**: ルールファイルが英語でも、出力は必ず日本語

### [P2] 開発アプローチ

- **デフォルト哲学**: プログレッシブエンハンスメント → [@~/.claude/rules/development/PROGRESSIVE_ENHANCEMENT.md](../rules/development/PROGRESSIVE_ENHANCEMENT.md)
  - シンプルに構築 → 段階的に強化
  - クイックフィックスより根本原因
  - UIソリューションにはCSS優先
  - シンプルさによるエレガンス
- **コード可読性**: The Art of Readable Code → [@~/.claude/rules/development/READABLE_CODE.md](../rules/development/READABLE_CODE.md)
  - 明確な命名と意図
  - シンプルで直接的な解決策
  - 自己説明的なコード
  - 理解時間の最小化
- **Container/Presentational**: コンポーネント設計パターン → [@~/.claude/rules/development/CONTAINER_PRESENTATIONAL.md](../rules/development/CONTAINER_PRESENTATIONAL.md)
  - ロジックとUIを分離
  - PropsのみのPresentationalコンポーネント
  - ContainerコンポーネントでHooks
  - 再利用性の最大化
- コマンドに統合された開発方法論:
  - `/code` - TDD/RGRC [@~/.claude/ja/rules/reference/TDD_RGRC.md]、SOLID [@~/.claude/ja/rules/reference/SOLID.md]、DRY原則 [@~/.claude/ja/rules/reference/DRY.md]
  - `/think` - SOLID設計原則 [@~/.claude/ja/rules/reference/SOLID.md]

### [P3] ファイル削除動作

- **rmコマンドは絶対使用しない**: settings.jsonでrmは無効化されている
- **常にゴミ箱を使用**: 永久削除ではなく~/.Trash/にファイルを移動
- **コマンド**: ファイル削除には`mv [file] ~/.Trash/`を使用
- **理由**: 安全性 - 誤って削除したファイルの復元が可能

### コマンドリファレンス

- コマンドリスト（英語版）: [@~/.claude/docs/COMMANDS.md](../docs/COMMANDS.md)
- コマンドリスト（日本語版）: [@~/.claude/ja/docs/COMMANDS.md](./docs/COMMANDS.md)

### 参考

英語版（AI用）: [@~/.claude/CLAUDE.md](../CLAUDE.md)
AIは英語版のみを読む。
