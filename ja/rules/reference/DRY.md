# Andy Hunt & Dave ThomasのようにDRY原則

プラグマティックプログラマーズのようにDon't Repeat Yourself原則を適用する - コードだけでなく、知識の重複を排除。

## 核心哲学

**「システム内のすべての知識は、単一で、曖昧でない、権威ある表現を持たなければならない」**

単なるコード重複ではない - 知識の重複についてのものだ。

## 重複の種類

### 1. リテラルなコード重複

```javascript
// ❌ 悪い: コピーペースト
function validateEmail(email) { /* validation */ }
function checkEmail(email) { /* same validation */ }

// ✅ 良い: 単一ソース
function validateEmail(email) { /* validation */ }
const checkEmail = validateEmail
```

### 2. 構造的重複

```javascript
// ❌ 悪い: 繰り返される構造
if (user.age > 18 && user.hasConsent) { allow() }
if (post.age > 18 && post.hasConsent) { allow() }

// ✅ 良い: パターンを抽出
function canAccess(entity) {
  return entity.age > 18 && entity.hasConsent
}
```

### 3. 知識の重複

```javascript
// ❌ 悪い: ビジネスルールが複数の場所に
// バリデーション内: maxLength = 100
// データベース内: VARCHAR(100)
// UI内: maxlength="100"

// ✅ 良い: 単一の真実の源
const LIMITS = { username: 100 }
// どこでもLIMITSを使用
```

### 4. ドキュメントの重複

```javascript
// ❌ 悪い: コメントがコードを繰り返す
// 年齢を1増やす
age += 1

// ✅ 良い: 自己文書化
user.incrementAge()
```

## DRYを適用する場面

**適用する**:

- ビジネスルール/ロジック
- データスキーマ
- 設定値
- アルゴリズム
- 複雑な条件

**過度に適用しない**:

- 偶然の類似性
- 異なるコンテキスト
- テストデータ
- シンプルなワンライナー

## 3回ルール

重複を2回見た？ メモする。
3回見た？ リファクタリングする。

## DRYテクニック

1. **関数の抽出**: 繰り返されるロジック用
2. **設定オブジェクト**: 繰り返される値用
3. **継承/コンポジション**: 繰り返される構造用
4. **コード生成**: 反復的なパターン用
5. **テンプレート**: 類似の実装用

## よくある違反と修正

**マジックナンバー**:

```javascript
// ❌ if (items.length > 10)
// ✅ if (items.length > MAX_ITEMS)
```

**繰り返される条件**:

```javascript
// ❌ if (user && user.isActive && user.hasPermission)
// ✅ if (user.canPerform(action))
```

**コピーペーストテスト**:

```javascript
// ❌ 3つの類似したテストケース
// ✅ パラメータ化されたテスト
```

## 他の原則との統合

- **SOLIDと**: DRYが良い抽象化を促進 (DIP)
- **TDDと**: テストが早期に重複を明らかにする
- **Tidyingsと**: 段階的に重複を削除

## 警告サイン

- ショットガン手術（多くの場所での変更）
- 時間とともに発散する変更
- 「これ、さっき書かなかった？」
- グローバル検索置換が必要

## 忘れずに

「DRYは知識の重複、意図の重複についてです。同じことを2つ以上の場所で、
おそらく2つ以上の全く異なる方法で表現することについてです。」- The Pragmatic Programmer
