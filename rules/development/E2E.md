---
paths:
  - "**/e2e/**"
  - "**/*.e2e.*"
  - "**/tests/**/*.spec.ts"
  - "**/tests/**/*.spec.tsx"
  - "**/playwright.config.*"
---

# E2E

E2E verifies a user's path through the whole system from a browser, and it costs the most to run and to maintain. Keep a small suite limited to the primary paths, in a state where a failure always means something. Follow TESTING.md for testing policy in general; this file covers only the decisions specific to E2E.

## What belongs in E2E

One question decides it. Is that break only visible when the whole system runs? When a lower layer can catch it, write it there and leave the E2E suite as is.

| What you want to verify                            | Layer it belongs to |
| -------------------------------------------------- | ------------------- |
| Deployment breakage, wiring between correct parts  | E2E                 |
| Validation branches, conditional display switching | Component test      |
| Calculation, decision, transformation logic        | Unit test           |

The principle of limiting E2E to primary paths holds only when the layer you hand the rest to exists. Before limiting, confirm that layer exists in this project. When it does not, build the lower layer instead of limiting.

## Confirming what is covered

E2E coverage accumulates along the terrain of what is easy to write, not the terrain of risk. Controls visible on the screen from the start get covered, while elements that appear on state (error banners, confirmation dialogs, empty states) and paths that are heavy to set up (authentication, external SDKs) stay blank.

Confirm at the level of a case, not the name of a layer. Do not settle for "unit tests exist"; name a case such as "an unverified user logging in sees the resend UI" and check the filename of the test that guards it. When no filename can be named, treat it as uncovered.

## Where the suite runs

It splits on whether CI can boot the whole stack. When it can, run per PR; when a deployed environment is required, run as the release check.

| Precondition                       | Trigger                     | Retries | Handling of a failure                            |
| ---------------------------------- | --------------------------- | ------- | ------------------------------------------------ |
| CI can boot the whole stack        | Per PR                      | 0       | Fix it in that PR when it fails                  |
| A deployed environment is required | After deploy, release check | Enabled | Feed into halting the rollout or rolling it back |

When running after deploy, select the scenarios per environment. Run scenarios that create data or call external services against staging, and limit production to a read-oriented smoke. Write this limit into the tests themselves rather than the pipeline config, so it survives a pipeline change.

## Waiting and assertion discipline

Flakiness comes mainly from how the test waits. Do not leave it to each author's discretion; confine waiting to the Page Object so the rule is enforced mechanically.

| Form not to write                                                             | Form to replace it with                                           | Why not to write it                                                                                                   |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Fixed-duration sleep (`waitForTimeout`)                                       | Waiting on state (web-first assertion)                            | Guessing the duration misses in both directions: too short fails, too long slows everything                           |
| Static assert on a sync read (`innerText` + `expect`)                         | An auto-wait matcher (`toContainText`)                            | It passes on a coincidental match even when the value is unsettled at snapshot time                                   |
| A bare absence assert (`not.toBeVisible` / `toHaveCount(0)`)                  | Wait for an element that must appear first, then assert absence   | During load the count is 0, so it holds in the moment before rendering                                                |
| Asserting display right after an operation that refetches (sort, filter)      | Arm the response wait before running the operation                | When the refetched display matches the previous one, it holds before the update and the next step reads a stale value |
| Waiting only on the completion side of an operation with no completion notice | Wait in two stages for the busy indicator to appear and disappear | It misses the case where the operation never started and returned immediately                                         |

## Locating elements

Locate by what the user perceives: role, accessible name, and label. CSS classes and DOM structure are implementation details that change with styling and refactoring, unrelated to behavior.

When using `data-testid`, collect the strings into constants and import them only from the Page Object. Do not write locators in a spec; confine locators, operations, and waiting to the Page Object, and keep the spec to describing the scenario.

## Test data

Each test prepares its own data and verifies only what it created. A test that reads state left by another test cannot run alone, in parallel, or in a different order.

| Decision  | Content                                                                                                                          |
| --------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Path used | A direct INSERT into the DB or a test-support API, not UI operations                                                             |
| Naming    | An identifiable fixed prefix combined with a unique suffix                                                                       |
| Cleanup   | Reclaim derived records and files in teardown, and register anything born from UI operations explicitly                          |
| Precheck  | Validate the seeded data against a schema before UI operations, failing with a mark that separates it from an application defect |

## Authentication

Log in once per role in setup, save it to `storageState`, and let each test load it. A setup where every test logs in through the UI first is slow, and a change to the login screen fails the whole suite at once. When parallel workers contend for the same account, prepare several accounts per role.

## The screen and permission matrix

Confirming that every primary screen renders for each permission is a matrix, so do not write it cell by cell. Define the screen list with the permissions that may view each one as data, and generate the tests in a loop. From the same list, verify both directions: a permitted role sees the screen's heading, and a non-permitted role lands on the fallback. Adding a screen or a permission is a one-line change to the list, and exposure to the wrong permission fails in the same suite.

## The boundary with external services

Pin the calls to external services with stubs, and prepare and observe state unreachable from the UI through a test-support API. In E2E the whole backend is the logic under test, so the boundary you pin sits past it, at the edge where the system calls a service outside the team's control.

Do not place stubs and test-support APIs in production. An endpoint that creates accounts, issues auth codes, and reads mail must not sit where a user can reach it.

A stub drifts when the provider changes, producing a suite that passes while the real integration is broken. Keep stubs to the endpoints and fields the application actually reads, and keep a few scenarios that exercise the real integration on staging.

Events that happen outside the browser, such as mail delivery, fall outside web-first assertions, so wait for them with bounded polling.

## Handling flaky tests

A test that fails intermittently without a defect gets fixed or quarantined the day it is noticed. Quarantine takes it out of the release check with `test.fixme()` and files the fix as an issue. A test that passes on retry does not count as a pass; it goes on the fix list.

## Evidence of a failure

A failure in a deployed environment is hard to reproduce locally, so collect the evidence at run time. Save the trace of a failed run, and split long scenarios with `test.step` so it shows which stage failed.
