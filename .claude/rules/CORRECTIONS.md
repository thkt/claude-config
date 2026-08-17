# Corrections

`hooks/lifecycle/reflection_ask.py` の Stop hook が尋ねた事象のうち、次のセッションが同じ経路を通れば必ず踏むものをここへ書く。ここは規則へ移すまでの待ち行列で、規則そのものの置き場ではない。

書く基準は「調べた甲斐があったか」ではなく「次に必ず踏むか」。一度きりの調査結果、採用を見送った外部ツールの検討記録、規則ファイルへ書けば済むものは書かない。1 行は 200 字以内に収める。この基準を緩めると、毎セッション読み込む字数だけが増えて参照されない行が溜まる。

行の置き場所は内容で決める。外部ツールのバージョン固有の挙動は「外部ツールの実測挙動」へ置き、上流が直れば無効になる前提で読む。このリポジトリの規則、スクリプト、設定に関する知見は「ハーネスの教訓」へ置く。

同じ対象を指す行が 3 行溜まると、hook が同じ回に統合まで要求する。統合は移動でなく蒸留で、規則そのものと、その事象に気付く経路だけを対象ファイルへ書き、実測値と再現手順は落とすか対象ファイルの `references/` へ回す。対象ファイルへ書いた内容の行はここから消す。

対象ファイルへまだ移していない行は、書かれた状態が現物と食い違っていても消さない。教訓が適用済みであることは、その教訓が正しかった証拠であって、削除の理由にはならない。

## 外部ツールの実測挙動

| 訂正・知見                                                                                                                                                                                                                                                                                                       | 対象                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `suppressOutput: true` は Stop hook の `additionalContext` を隠さない。掛かるのは stdout の生表示だけで、stop_hook_summary は additionalContext を無条件に「Stop hook feedback: 」として端末へ全文描画する (claude 2.1.233)。表示は注入本文を短くするしかない                                                    | `hooks/lifecycle/reflection_ask.py`               |
| テストが `HOME` を一時ディレクトリへ差し替えて python3 を spawn すると、mise がグローバル config を not trusted と判定して shim が exit 1 になる (mise 2026.8.6)。失敗はテスト自身の assert 文言で出て実装の欠陥に見えるので、切り分けは `HOME=$(mktemp -d) python3 <script>` を直接叩いて mise の stderr を読む | `workflows/audit/tests/audit.seam.test.js`        |
| closed display mode が有効なまま Amphetamine へ `start new session` を送ると、蓋を閉じた Mac では画面が 1 秒落ちて即ロックされる。assertion の解放は原因ではなく `PrevDisp` が立ったままでも落ちるので、切り分けは CDM の有無を変えて `Display is turned off` と張り直しの同一秒一致を数える                     | `hooks/integrations/amphetamine_agent_session.py` |

## ハーネスの教訓

| 訂正・知見                                                                                                                                                                                                                                                                                                                                        | 対象                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| plan の `test_command` にシェルのメタ文字を書くと formatter が markdown の強調として解釈し、`test_command` を `test*command` に、`test-*.sh` を `test-[a-z]\*.sh` に書き換える。build の Load が読めなくなるので、メタ文字を含まない形で書く                                                                                                      | `skills/think/templates/plan.md`                  |
| LLM への出力制約を文の数だけで書くと長さは縛れない。translate-tail の prompt は「2 文以内」しか課しておらず、300 字の 1 文がその制約を満たすので、PR の折りたたみ内は読めないまま残った。文数とは別に 1 文の字数上限を課す。ただし字数上限は file:line やパスを途中で切らせるので、逐語で保持する要素を含む文は上限の対象外だと prompt に明記する | `workflows/build.js`                              |
| 外部アプリはグローバル `settings.json` へ自分の hook 配線を書き込み、アンインストール後も残った配線は非ブロッキングのまま毎イベント失敗し続ける。会話にも `git diff` にも出ないので、気付く経路は transcript の `hook_non_blocking_error` と `stop_hook_summary` の `hookErrors` に限られる                                                       | `settings.json`                                   |
| plugin が読むファイルの書き手が別 hook の担当だと、機能は動かないまま stderr へエラーを出し続ける。exitCode 0 の hook_success として記録され会話に出ないので、気付く経路は transcript の `attachment.stderr` に限られる                                                                                                                           | `hooks/lifecycle/statusline.sh`                   |
| guardrails は対象の隣へ一時ファイルを作るため、sandbox が書込を拒む `hooks/`, `skills/`, `rules/`, `workflows/` では lint を飛ばし `degraded: true` で allow を返す。違反なしと見分けが付かないので実測には `dangerouslyDisableSandbox` を付ける                                                                                                  | `.oxlintrc.json`                                  |
| テスト収集パターンは手元で検証できない。macOS の bash 3.2 は globstar 非対応で `**` を 1 階層の `*` に落とし、zsh は `**` を再帰展開する。全 suite が 1 階層下にあると両者で本数が一致して green に見え、`hooks/tests/` 直下だけが静かに落ちる。収集は glob でなく find で書く                                                                    | `.github/workflows/test.yml`                      |
| pathspec 付きの `git stash push` は pathspec 外の staged 変更まで無言で退避し、`git mv` 済みの rename を含むと pop が rename/delete で衝突して `DU` が残る。気付く経路は `git stash show --name-only` の照合だけなので、切り分けの一時退避は手動コピーで行う                                                                                      | `rules/core/OPERATION.md`                         |
| fast-exit が生 payload を `"tool_name":"Bash"` の形で探すと、テストの `json.dumps` が既定で入れる空白と一致せず、hook は何も返さずに抜ける。hook は正常終了しエラーも出ないため、テストの全件失敗が入力の形の違いでなく hook の故障に見える。テストは `separators=(",", ":")` を渡す                                                              | `hooks/pre-bash/issue_body_gate.py`               |
| sandbox 内の osascript は Apple Events を遮断され、起動中のアプリにも `-600 アプリケーションは実行されていません` を返すので、失敗がアプリ未起動に見える。`pgrep` は別文言の `sysmond service not found` で落ちる。実機の状態確認は `dangerouslyDisableSandbox` を付ける                                                                          | `hooks/integrations/amphetamine_agent_session.py` |
| グローバル `~/.gitignore_global` の `build/` が全階層の build を追跡外にし、打ち消しは `workflows/build/` だけに掛かる。`git rm -r <dir>` は追跡外のファイルを消さず `git status` にも出さないので、削除後もディレクトリが残る。気付く経路は `find <dir>` だけ                                                                                    | `.gitignore`                                      |
| `git log --since=<date> --until=<date>` の日付だけの指定は欠けた時刻を実行時の現在時刻で埋めるため、開始日はその時刻より前のコミットが落ち、終了日はその時刻までが混ざる。件数はどちらでももっともらしく出るので、気付く経路は `--since='<date> 00:00'` を付けた結果との件数照合だけ                                                              | `rules/core/OPERATION.md`                         |
