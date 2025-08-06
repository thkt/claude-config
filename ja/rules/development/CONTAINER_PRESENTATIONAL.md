# Container/Presentationalパターン

**デフォルトアプローチ**: 最大の再利用性のためにロジックをUIから分離

## コア哲学
- **Container**: ロジックとデータ取得
- **Presentational**: UIと表示のみ
- **Propsのみ**: PresentationalコンポーネントはProps経由でデータを受け取る
- **再利用性**: 同じUI、異なるデータソース

## コンポーネントの役割

### Containerコンポーネント
- データを取得（API、ストア、フック）
- 状態を管理
- ビジネスロジックを処理
- レイアウト/ポジショニングスタイルのみを制御

### Presentationalコンポーネント
- Props経由でデータを受け取る
- 直接的なデータ取得なし
- 装飾的なスタイルを処理
- 完全に再利用可能

## ディレクトリ構造
```
src/
├── containers/
│   └── TodoContainer/
│       ├── index.tsx
│       └── index.stories.tsx
└── components/
    └── TodoList/
        ├── index.tsx
        └── index.stories.tsx
```

## 実装例

### フック付きContainer
```tsx
// TodoContainer/index.tsx
import { useTodos } from '@/hooks/useTodos';
import { TodoList } from '@/components/TodoList';

export const TodoContainer = () => {
  const todos = useTodos();
  
  return (
    <div className="p-4 max-w-4xl mx-auto"> {/* レイアウトのみ */}
      <TodoList todos={todos} />
    </div>
  );
};
```

### Presentationalコンポーネント
```tsx
// TodoList/index.tsx
type TodoListProps = {
  todos: Todo[];
};

export const TodoList = ({ todos }: TodoListProps) => {
  return (
    <ul className="bg-white rounded-lg shadow"> {/* 装飾的スタイル */}
      {todos.map(todo => (
        <li key={todo.id} className="p-3 border-b">
          {todo.title}
        </li>
      ))}
    </ul>
  );
};
```

## スタイルの責任

### Containerスタイル
- レイアウト（grid、flexbox）
- スペーシング（margin、padding）
- ポジショニング（absolute、z-index）
- サイジング（width、max-width）

### Presentationalスタイル
- 色と背景
- ボーダーとシャドウ
- タイポグラフィ
- ホバー/フォーカス状態
- トランジション

## アンチパターン
```tsx
// ❌ 避ける: Presentationalがデータを取得
export const TodoList = () => {
  const [todos, setTodos] = useState([]); // ❌
  useEffect(() => {
    fetch('/api/todos')... // ❌ Propsで受け取るべき
  }, []);
};

// ❌ 避ける: Containerに装飾的スタイル
export const TodoContainer = () => {
  return (
    <div className="bg-blue-500 shadow-xl"> {/* ❌ 装飾的 */}
      <TodoList />
    </div>
  );
};
```

## 利点
- **テスト**: ロジックとUIを別々にテスト
- **再利用性**: 同じコンポーネント、異なるデータソース
- **保守性**: 変更が1つのレイヤーに分離
- **明確性**: 関心の明確な分離

## 覚えておくこと
- ContainerはデータをUIに接続
- PresentationalコンポーネントはPropsのみ
- Presentationalコンポーネントを純粋に保つ
- 迷ったらPresentationalを優先
