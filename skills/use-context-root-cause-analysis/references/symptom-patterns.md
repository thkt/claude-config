# Symptom Patterns

## Symptom → Root Cause Mappings

| Symptom                           | Root Cause                   | Fix                                              |
| --------------------------------- | ---------------------------- | ------------------------------------------------ |
| `setTimeout` for DOM              | Not using React lifecycle    | Use `useRef` + `useEffect`                       |
| Flag to prevent double exec       | StrictMode or no cleanup     | `useEffect` with cleanup                         |
| Multiple effects to sync state    | Derived state as independent | `useMemo` for derived data                       |
| `useEffect` syncing prop to state | Unnecessary internal state   | Use prop directly                                |
| Ref to access child state         | Improper data flow           | Lift state, pass via props                       |
| Event bus for siblings            | State not lifted             | Lift to common parent                            |
| Memoizing everything              | Premature optimization       | Profile first, memo only when needed             |
| Throttle/debounce everywhere      | Wrong approach               | CSS (`position: sticky`), `IntersectionObserver` |
| JavaScript for show/hide          | Overengineering              | `<details>` or CSS                               |

## Decision Framework

| Question                        | If No                  |
| ------------------------------- | ---------------------- |
| Can this be prevented entirely? | Consider better design |
| Can simpler tech solve this?    | Try HTML/CSS first     |
| Treating cause or effect?       | Raise hypotheses again |
| Will this fix scale?            | Rethink approach       |
| Is this the framework way?      | Learn patterns         |

## Root Cause Categories

| Category     | Examples                              |
| ------------ | ------------------------------------- |
| Design       | Wrong abstraction, missing pattern    |
| Architecture | Coupling, missing boundary            |
| Process      | Missing validation, no retry logic    |
| Knowledge    | Misunderstanding of framework/lib     |
| Requirements | Unclear requirements → wrong solution |
