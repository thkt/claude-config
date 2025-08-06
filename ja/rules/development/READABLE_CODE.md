# The Art of Readable Code

**デフォルトマインドセット**: コードは理解しやすくあるべき - Dustin Boswell & Trevor Foucher

## コア原則

**「コードは他の誰かがそれを理解するのにかかる時間を最小限にするように書かれるべきである」**

- その「他の誰か」は6ヶ月後のあなたかもしれない
- 理解時間 > 書く時間

## 主要な実践

### 1. コードを理解しやすくする

#### 誤解されない名前

```typescript
// ❌ 曖昧
results.filter(x => x > LIMIT)  // 以上？より大きい？

// ✅ 明確な意図
results.filter(x => x >= MIN_ITEMS_TO_DISPLAY)
```

#### 具体的 > 抽象的

```typescript
// ❌ 抽象的
processData(data)

// ✅ 具体的
validateUserRegistration(formData)
```

### 2. ループとロジックの簡素化

#### 制御フローを明確に

```typescript
// ❌ 複雑なネスト
if (user) {
  if (user.isActive) {
    if (user.hasPermission) {
      // 何かする
    }
  }
}

// ✅ 早期リターン
if (!user) return
if (!user.isActive) return
if (!user.hasPermission) return
// 何かする
```

#### ネストを最小限に

- ガード句を使用
- 複雑な条件を名前付き関数に抽出
- 早期リターンを優先

### 3. コードの再編成

#### 無関係なサブ問題を抽出

```typescript
// ✅ 各関数が1つのことをする
function getActiveUsers(users: User[]) {
  return users.filter(isActiveUser)
}

function isActiveUser(user: User): boolean {
  return user.status === 'active' && user.lastLogin > thirtyDaysAgo()
}
```

#### 一度に1つのタスク

- 関数は1つのことをすべき
- 説明に「と」が必要なら分割する
- 「何を」と「どうやって」を分離

### 4. コードは「明らかに正しい」べき

#### コードを意図のように見せる

```typescript
// ❌ 意図が不明確
const p = products.filter(p => p.price > 0 && p.stock)

// ✅ 意図が明白
const availableProducts = products.filter(product =>
  product.price > 0 &&
  product.stock > 0
)
```

### 5. 書く前の重要な質問

自問すること：

1. 「これを理解する最も簡単な方法は何か？」
2. 「これを読む人を混乱させるものは何か？」
3. 「意図をもっと明確にできるか？」

## 実践的な適用

### 変数命名

- **具体的 > 一般的**: `data`ではなく`userEmail`
- **検索可能**: `7`ではなく`MAX_RETRY_COUNT`
- **発音可能**: `cstmr`ではなく`customer`

### 関数設計

- **小さく集中**: 5-10行が理想的
- **説明的な名前**: `calc()`ではなく`calculateTotalPrice()`
- **一貫したレベル**: 高レベルと低レベルの操作を混在させない

### コメント

- **何ではなくなぜ**: 仕組みではなく決定を説明
- **更新または削除**: 古いコメントはないよりも悪い
- **コードファースト**: 何を説明する必要があるなら、コードを書き直す

## 最終テスト

**「新しいチームメンバーは1分以内にこれを理解できるか？」**

できなければ、さらに簡素化する。

## 覚えておくこと

- 明確さは賢さに勝る
- 未来のあなたは別人
- 読むことは書くことよりも多く起こる
