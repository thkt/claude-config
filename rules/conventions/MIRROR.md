# Mirror Conventions

Conventions for how `.ja/` and the English files correspond.

## Canonical side and mirroring

`.ja/` is canonical: edit there first and mirror to the English side in the same commit. The mirror target is the path without the `.ja/` prefix.

| Subject        | Rule                                                                                                                                                  |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Direction      | Never let a phrasing that exists only for the English side flow back into `.ja/`. Split the test per language when per-language assertions are needed |
| Test placement | English side only. Code under `.ja/` never runs, and a doubled run cannot detect drift that goes stale on both sides                                  |
| Prose language | Japanese under `.ja/`, English everywhere else. Covers comments, test names, and assertion messages                                                   |
| Exceptions     | Data a test matches against keeps its original language. What decides it is the path                                                                  |

## Mirroring form

The form is decided by content. Never sync translated files with `cp`.

| File                                              | Mirroring                                                                                                                                      |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Carries prose (Markdown, prompt-embedding script) | Translate the prose (comments / prompts / message strings). Code structure, identifiers, stopped values, JSON keys, and schemas stay identical |
| No prose                                          | Identical copy                                                                                                                                 |
