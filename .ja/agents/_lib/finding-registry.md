# Finding Registry

各 reviewer が finding の id に付ける prefix と、各 reviewer が base field に畳み込む追加材料。base field は `finding-schema.md` にある。reviewer-conformance のように独自の出力形式を持つ reviewer は、意図してここに載せない。

## ドメイン特化拡張

呼び出し元の schema に追加キーは無いので、各 reviewer は追加材料をここに書かれた base field へ書き込んでから返す。ここに載っていない reviewer は base field のみ使う。

| Reviewer               | 追加材料                                          | Req/Opt | 書き込み先                                                         |
| ---------------------- | ------------------------------------------------- | ------- | ------------------------------------------------------------------ |
| reviewer-causation     | five_whys, root_cause                             | req     | root_cause → reasoning; five_whys → evidence に追記                |
| reviewer-progressive   | recommendations                                   | req     | recommendation ごとに独立した finding とし、変更を fix に書く      |
| reviewer-readability   | subcategory                                       | opt     | category に category/subcategory 形式で追記                        |
| reviewer-accessibility | wcag (req), apg_pattern (req), code_example (opt) | req/opt | wcag, apg_pattern → evidence; code_example → fix                   |
| reviewer-coverage      | related_code, criticality                         | opt     | related_code → evidence; criticality → reasoning note              |
| reviewer-security      | entry_points                                      | opt     | verification の文中に file:line で書く                             |
| reviewer-resilience    | blast_radius, failure, hypothesis                 | req     | blast_radius が severity そのもの; failure, hypothesis → reasoning |
| reviewer-duplication   | multi_location_evidence                           | req     | Evidence に全 source location をリスト                             |
| reviewer-reuse         | existing_code                                     | req     | Evidence で新規コードと既存代替をペアにする                        |
| reviewer-efficiency    | path_frequency                                    | opt     | hot/warm/cold → reasoning note                                     |

## ID Prefix レジストリ

| Prefix | Reviewer                                  |
| ------ | ----------------------------------------- |
| SEC    | reviewer-security                         |
| SF     | reviewer-silence                          |
| CQ     | reviewer-readability                      |
| PE     | reviewer-progressive                      |
| RC     | reviewer-causation / integrator synthesis |
| DP     | reviewer-design (module depth)            |
| RP     | reviewer-react-pattern                    |
| TEST   | reviewer-testability                      |
| TC     | reviewer-coverage                         |
| A11Y   | reviewer-accessibility                    |
| DRY    | reviewer-duplication                      |
| REUSE  | reviewer-reuse                            |
| EFF    | reviewer-efficiency                       |
| OPS    | reviewer-operations                       |
| PQ     | reviewer-prompt                           |
| CHX    | reviewer-resilience                       |
| RU     | reviewer-rust                             |
| PF     | pre-flight (エージェントファイルではない) |
