# Root Cause Synthesis

The steps enhancer-integration and enhancer-evidence share for turning a finding set into root causes. The caller decides what a cluster is (a domain, an evidence type) and whether to score or prioritize afterwards.

## Steps

1. Deduplicate by `file:line:category`, keeping the highest severity. When contributors disagreed on severity, set `severity_upgraded: true` and record `original_severities: [{reviewer, severity}]`
2. Drop findings lacking a concrete trigger or file-read verification, keep the rest
3. Group findings by location (file, module, boundary) and identify convergence signals where 2+ contributors flag the same area
4. Re-evaluate severity per convergence cluster by the rules below
5. Keep a finding with no correlation as a standalone item
6. For each convergence cluster, synthesize one root cause that explains all its findings, and run the root cause analysis on the root cause, not on individual findings
7. Run the root cause analysis on each standalone finding
8. Classify each root cause by the categories below

## Severity re-evaluation rules

- Cite the specific contributing finding that changes the impact assessment
- If no cross-domain context changes impact, record `Independent findings. No upgrade.`
- Count alone does not justify an upgrade. Two mediums do not add up to a high

## Root Cause Categories

| Category         | Indicators            | Resolution     |
| ---------------- | --------------------- | -------------- |
| Architecture Gap | Pattern spans modules | Design change  |
| Knowledge Gap    | Inconsistent patterns | Documentation  |
| Tooling Gap      | Linter could catch    | Config update  |
| Process Gap      | Slips through review  | Process change |
