# Corrections

`hooks/lifecycle/reflection_ask.py` の Stop hook が尋ねた事象のうち、次のセッションが同じ経路を通れば必ず踏むものをここへ書く。ここは規則へ移すまでの待ち行列で、規則そのものの置き場ではない。

書く基準は「調べた甲斐があったか」ではなく「次に必ず踏むか」。一度きりの調査結果、採用を見送った外部ツールの検討記録、規則ファイルへ書けば済むものは書かない。1 行は 200 字以内に収める。この基準を緩めると、毎セッション読み込む字数だけが増えて参照されない行が溜まる。

行の置き場所は内容で決める。外部ツールのバージョン固有の挙動は「外部ツールの実測挙動」へ置き、上流が直れば無効になる前提で読む。このリポジトリの規則、スクリプト、設定に関する知見は「ハーネスの教訓」へ置く。

同じ対象を指す行が 3 行溜まると、hook が同じ回に統合まで要求する。統合は移動でなく蒸留で、規則そのものと、その事象に気付く経路だけを対象ファイルへ書き、実測値と再現手順は落とすか対象ファイルの `references/` へ回す。対象ファイルへ書いた内容の行はここから消す。

対象ファイルへまだ移していない行は、書かれた状態が現物と食い違っていても消さない。教訓が適用済みであることは、その教訓が正しかった証拠であって、削除の理由にはならない。

## 外部ツールの実測挙動

| 訂正・知見                                                                                                                                                                                                                                                                                                                                                                                             | 対象                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| `claude -p` の子として動く reflection_ask.py は 2 点で本体と挙動が違う。(1) `suppressOutput: true` は Stop hook の `additionalContext` を隠さず、stop_hook_summary が無条件に全文描画する (2.1.233)。(2) `.claude/` 配下への Edit/Write は sensitive file 判定にかかり `acceptEdits` や permissions.allow では通らず `bypassPermissions` が必須、手段の絞り込みは `--disallowedTools` で行う (2.1.234) | `hooks/lifecycle/reflection_ask.py`                |
| テストが `HOME` を一時ディレクトリへ差し替えて python3 を spawn すると、mise がグローバル config を not trusted と判定して shim が exit 1 になる (mise 2026.8.6)。失敗はテスト自身の assert 文言で出て実装の欠陥に見えるので、切り分けは `HOME=$(mktemp -d) python3 <script>` を直接叩いて mise の stderr を読む                                                                                       | `workflows/audit/tests/audit.seam.test.js`         |
| closed display mode 有効のまま Amphetamine へ `start new session` を送ると蓋を閉じた Mac の画面が落ちて即ロックされ、切り分けは CDM の有無を変えて比べる。sandbox 内の osascript は起動中のアプリにも `-600` を返すので、実機確認は `dangerouslyDisableSandbox` を付ける                                                                                                                               | `hooks/integrations/amphetamine_agent_session.py`  |
| guardrails の hardcoded-secret は値でなく識別子名で判定する。`apiKey` への文字列リテラル代入は値を伏字にしても Write がブロックされ、識別子を `credentialLiteral` へ改名すると通る (0.22.0)。reviewer-security の Bad 例はコードでなく散文で書く                                                                                                                                                       | `skills/use-context-reviewer-security/references/` |

## ハーネスの教訓

| 訂正・知見                                                                                                                                                                                                                                                                                  | 対象                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| plan の `test_command` にシェルのメタ文字を書くと formatter が markdown の強調として解釈し、`test_command` を `test*command` に、`test-*.sh` を `test-[a-z]\*.sh` に書き換える。build の Load が読めなくなるので、メタ文字を含まない形で書く                                                | `skills/think/templates/plan.md`    |
| LLM への出力制約を文の数だけで書くと長さは縛れない。translate-tail の prompt は「2 文以内」しか課しておらず、300 字の 1 文がその制約を満たすので、PR の折りたたみ内は読めないまま残った。文数とは別に 1 文の字数上限を課す                                                                  | `workflows/build.js`                |
| 外部アプリはグローバル `settings.json` へ自分の hook 配線を書き込み、アンインストール後も残った配線は非ブロッキングのまま毎イベント失敗し続ける。会話にも `git diff` にも出ないので、気付く経路は transcript の `hook_non_blocking_error` と `stop_hook_summary` の `hookErrors` に限られる | `settings.json`                     |
| hook が毎回出す 1 行を設定で消す口は無い。`suppressOutput` は hook 設定のキーでなく hook が返す JSON 側で、しかも stdout 専用。formatter や gates の定型行は stderr にあり、Claude Code は出力のある hook だけ `hook_success` として記録して stderr を描画する                              | `settings.json`                     |
| plugin が読むファイルの書き手が別 hook の担当だと、機能は動かないまま stderr へエラーを出し続ける。exitCode 0 の hook_success として記録され会話に出ないので、気付く経路は transcript の `attachment.stderr` に限られる                                                                     | `hooks/lifecycle/statusline.sh`     |
| guardrails は対象の隣へ一時ファイルを作るため、sandbox が書込を拒む `hooks/`, `skills/`, `rules/`, `workflows/` では lint を飛ばし `degraded: true` で allow を返す。違反なしと見分けが付かないので実測には `dangerouslyDisableSandbox` を付ける                                            | `.oxlintrc.json`                    |
| テスト収集パターンは手元で検証できない。macOS の bash 3.2 は globstar 非対応で `**` を 1 階層の `*` に落とし、zsh は `**` を再帰展開する。全 suite が 1 階層下にあると両者で本数が一致して green に見え、`hooks/tests/` 直下だけが静かに落ちる。収集は glob でなく find で書く              | `.github/workflows/test.yml`        |
| fast-exit が生 payload を `"tool_name":"Bash"` の形で探すと、テストの `json.dumps` が既定で入れる空白と一致せず、hook は何も返さずに抜ける。hook は正常終了しエラーも出ないため、テストの全件失敗が入力の形の違いでなく hook の故障に見える。テストは `separators=(",", ":")` を渡す        | `hooks/pre-bash/issue_body_gate.py` |
| グローバル `~/.gitignore_global` の `build/` が全階層の build を追跡外にし、打ち消しは `workflows/build/` だけに掛かる。`git rm -r <dir>` は追跡外のファイルを消さず `git status` にも出さないので、削除後もディレクトリが残る。気付く経路は `find <dir>` だけ                              | `.gitignore`                        |
| 返答の定型文と「subagent の完了を待たずにターンを終える」を prompt の同じ節へ置くと、main agent は subagent 起動の 1 秒後に自分でその定型文を書いて終える。捏造した行は本物と見分けが付かないので、気付く経路は transcript で最終発話と subagent 完了通知の時刻を比べることだけ             | `hooks/lifecycle/reflection_ask.md` |
