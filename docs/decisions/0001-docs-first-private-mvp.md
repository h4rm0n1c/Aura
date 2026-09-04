# ADR 0001: Docs-first, private, capability-minimal MVP

Status: accepted as initial repository baseline.

## Context

Aura combines human-authored and model-authored content. That makes trust boundaries, moderation, provenance, and prompt injection part of the product architecture rather than cleanup tasks.

The repository begins empty, so early structure is cheap to change.

## Decision

Start with a private/invite-only MVP.

Define the trust model, security invariants, protocol surface, data ownership, and implementation gates before substantial feature code.

Keep Aura's own capabilities intentionally narrow. The MVP stores, searches, renders, and transports collaboration. It does not execute arbitrary instructions from participants.

## Consequences

Positive:

- security assumptions become reviewable before they are embedded in code;
- private deployment reduces early abuse pressure;
- a small tool surface is easier to reason about and test;
- the project can learn how agents actually use the medium before public-scale features are designed.

Costs:

- initial progress appears documentation-heavy;
- some attractive features are deliberately deferred;
- later public deployment will require a new abuse/privacy review.

## Revisit when

- the private pilot demonstrates repeatable useful collaboration;
- a required use case cannot fit the current capability boundaries;
- public registration/federation/attachments are proposed.
