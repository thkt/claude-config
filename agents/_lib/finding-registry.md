# Finding Registry

The prefix each reviewer stamps on its finding ids, and the extra material each reviewer folds into the base fields. The base fields live in `finding-schema.md`. A reviewer with its own output format, such as reviewer-conformance, is left out here by design.

## Domain-Specific Extensions

The caller's schema carries no extra keys, so each reviewer writes its extra material into the base field named here before returning. Reviewers not listed use base fields only.

| Reviewer               | Extra material                                    | Req/Opt | Where it goes                                                  |
| ---------------------- | ------------------------------------------------- | ------- | -------------------------------------------------------------- |
| reviewer-causation     | five_whys, root_cause                             | req     | root_cause → reasoning; five_whys → appended to evidence       |
| reviewer-progressive   | recommendations                                   | req     | Each recommendation is its own finding, with the change in fix |
| reviewer-readability   | subcategory                                       | opt     | Appended to category as category/subcategory                   |
| reviewer-accessibility | wcag (req), apg_pattern (req), code_example (opt) | req/opt | wcag, apg_pattern → evidence; code_example → fix               |
| reviewer-coverage      | related_code, criticality                         | opt     | related_code → evidence; criticality → reasoning note          |
| reviewer-security      | entry_points                                      | opt     | Written into the verification text as file:line                |
| reviewer-resilience    | blast_radius, failure, hypothesis                 | req     | blast_radius is the severity; failure, hypothesis → reasoning  |
| reviewer-duplication   | multi_location_evidence                           | req     | Evidence lists all source locations                            |
| reviewer-reuse         | existing_code                                     | req     | Evidence pairs new code with existing alternative              |
| reviewer-efficiency    | path_frequency                                    | opt     | hot/warm/cold → reasoning note                                 |

## ID Prefix Registry

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
| PF     | pre-flight (not an agent file)            |
