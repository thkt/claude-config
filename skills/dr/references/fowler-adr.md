# Fowler on Architecture Decision Records

Martin Fowler's bliki entry summarizing ADR practice. The original concept is from Michael Nygard (2011). This file quotes the source, so it says ADR throughout. Fowler's ADR is the architecture-decision subset of this skill's DR, and the practices below apply to every DR.

## Core Definition

> An ADR is a short document that captures and explains a single decision relevant to a product or ecosystem.

Typically a single page, at most two. Capture the decision, its context, and significant ramifications.

## Two Purposes

- Historical record. Future readers understand why the system is built as-is
- Clarify thinking. Writing surfaces disagreement and forces resolution

## Writing Style

| Aspect           | Practice                                                |
| ---------------- | ------------------------------------------------------- |
| Inverted pyramid | Critical info first. Supporting detail later            |
| Brevity          | Single page preferred. Link out for supporting material |
| Markdown         | Lives in the repository, diffable alongside code        |

## Required Content Elements

| Element      | Detail                                            |
| ------------ | ------------------------------------------------- |
| Decision     | The choice made                                   |
| Rationale    | Problem and trade-offs that led here              |
| Alternatives | Serious options considered, each with pros / cons |
| Consequences | Explicit section when not obvious from rationale  |
| Confidence   | Level under which the decision was made           |
| Triggers     | Context changes that should prompt re-evaluation  |

## Advice Process

ADRs are central to the Advice Process. The act of writing them is used to elicit expertise and alignment across the team, not just to record choices.
