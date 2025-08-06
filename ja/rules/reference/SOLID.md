# Robert C. MartinのようにSOLID原則

Uncle Bobのようにコードを設計・構造化する - 5つの基本原則を通じて柔軟で保守可能なシステムを作成。

## 核心哲学

**依存関係を管理**: 依存関係の方向とフローを制御
**変更を可能に**: 壊れることなく修正しやすいコード
**プロフェッショナルな職人技**: 他の開発者が尊敬するコードを書く

## 5つの原則

### 1. 単一責任の原則 (SRP)

クラスを変更する理由は1つだけにすべき

```typescript
// ✅ 良い: 1つの責任
class UserValidator {
  validate(user: User): ValidationResult
}

// ❌ 悪い: 複数の責任
class User {
  validate(): boolean
  save(): void
  sendEmail(): void
}
```

理由: 変更理由が複数 = 脆弱なコード

### 2. オープン・クローズドの原則 (OCP)

拡張に対して開いていて、修正に対して閉じている

```typescript
// ✅ 良い: インターフェースで拡張
interface PaymentProcessor {
  process(amount: number): Result
}
class StripeProcessor implements PaymentProcessor {}
class PayPalProcessor implements PaymentProcessor {}

// ❌ 悪い: 既存コードを修正
if (type === 'stripe') { /* stripe logic */ }
else if (type === 'paypal') { /* paypal logic */ }
```

理由: 新機能が既存コードを壊してはいけない

### 3. リスコフの置換原則 (LSP)

サブタイプは基底型と置換可能でなければならない

```typescript
// ✅ 良い: DuckはBirdのように飛べる
class Bird { fly() {} }
class Duck extends Bird { fly() { /* duck flying */ } }

// ❌ 悪い: PenguinはBirdの契約を破る
class Penguin extends Bird {
  fly() { throw new Error("Can't fly") }
}
```

理由: 継承での驚き = バグ

### 4. インターフェース分離の原則 (ISP)

汎用インターフェース1つより、特化したインターフェース複数

```typescript
// ✅ 良い: 焦点を絞ったインターフェース
interface Readable { read(): Data }
interface Writable { write(data: Data): void }

// ❌ 悪い: 太ったインターフェース
interface FileOps {
  read(): Data
  write(data: Data): void
  delete(): void
  compress(): void
}
```

理由: 不要な依存関係を強制しない

### 5. 依存性逆転の原則 (DIP)

具象ではなく抽象に依存する

```typescript
// ✅ 良い: インターフェースに依存
constructor(private logger: Logger) {}

// ❌ 悪い: 実装に依存
constructor(private fileLogger: FileLogger) {}
```

理由: 高レベルのポリシーは低レベルの詳細に依存すべきでない

## 適用場面

- クラス/モジュール設計
- API境界
- リファクタリング決定
- アーキテクチャ計画

## クイック決定ガイド

- 新機能？ → まずOCPを確認
- クラスが大きい？ → SRPを適用
- 継承の問題？ → LSPを検証
- メソッドが多すぎ？ → ISPを検討
- テストが困難？ → DIPを適用

## 他の原則との統合

- TDDと: テストを通じて設計が現れる
- DRYと: 抽象化が重複を防ぐ
- Tidyingsと: SOLIDに向けてリファクタリング

## 忘れずに

「速く進む唯一の方法は、うまくやることだ」 - クリーンアーキテクチャが速度を可能にする
