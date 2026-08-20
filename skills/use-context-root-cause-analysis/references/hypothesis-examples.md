# Eliminating Hypotheses - Worked Examples

State the problem so it is specific and observable. "The dashboard takes 5 seconds to load" can be analyzed. "The app is slow" cannot.

## Example. The dashboard takes 5 seconds to load

The diff: every other screen returns in 300ms, and only `/api/dashboard` queries 15 tables.

| Hypothesis                         | Test                                        | Result                        |
| ---------------------------------- | ------------------------------------------- | ----------------------------- |
| An N+1 query is firing             | Count the queries in the log                | One query. Dropped            |
| An index is missing                | EXPLAIN the slow query                      | The index is used. Dropped    |
| Mount fetches every module at once | Match fetched columns against rendered ones | 8 columns go unused. Survives |

The root cause is the fetch-everything on mount. The fix is per-section lazy loading and fetch-on-demand. If the same fetch-everything sits on other screens, the Pattern is Recurring.

## Example. The form submits twice

The diff: every other form disables on pending, and only this one sets `isSubmitting` inside the handler.

| Hypothesis                                  | Test                                    | Result               |
| ------------------------------------------- | --------------------------------------- | -------------------- |
| StrictMode calls the handler twice          | Does a single click reproduce it?       | It does not. Dropped |
| The event fires on both parent and child    | Log the handler and count the calls     | One call. Dropped    |
| A second click lands before the state moves | Does a rapid double-click reproduce it? | It does. Survives    |

The root cause is the second click landing before the state update. The fix is a `useRef` flag that sets immediately, or `disabled={pending}` from the form action. If forms written the same way sit elsewhere, the Pattern is Recurring.

## When three do not appear

Two hypotheses mean the diff is too coarse. Separate the differences by reverting the changes one at a time, varying one input at a time, or matching one environment setting at a time.
