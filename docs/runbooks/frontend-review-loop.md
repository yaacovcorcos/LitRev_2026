# Frontend Review Loop

This runbook defines the repeatable implementation and review procedure for LitRev frontend changes.

Use this after `AGENTS.md` has routed a task to the frontend path and after loading the frontend specialist.

## Purpose

Frontend work should not begin with components.
It should begin with a small working model of what the surface is trying to achieve, then move through implementation and explicit review.

## Required Pre-Build Framing

Before editing, write these three short items:

### Visual Thesis

One sentence describing the intended mood, density, and emphasis of the surface.

### Structure Thesis

State:
- the primary task
- the supporting context
- the final action or decision the user needs to take

### Interaction Thesis

List 2-3 meaningful interaction decisions:
- where motion helps
- how controls reveal or collapse
- how state changes should feel to the user

## Build Loop

1. Read the touched route, component, hook, and nearby tests.
2. Confirm what already owns state, data flow, and layout.
3. Write the visual thesis, structure thesis, and interaction thesis.
4. Implement the smallest change that satisfies the desired behavior without breaking ownership.
5. Review the result against the frontend quality bar.
6. Check async, responsive, and accessibility behavior.
7. Run the required validation commands.
8. Prepare a short handoff with what changed, what was verified, and any remaining risks.

## Visual Review Checklist

Check:
- Is there one dominant idea per major region?
- Is the primary action obvious?
- Does hierarchy remain clear without extra explanation?
- Are borders, cards, badges, and wrappers doing real semantic work?
- Does the result feel like LitRev rather than a generic AI product?

## Interaction Review Checklist

Check:
- Do visible controls all do something meaningful?
- Are action and navigation semantics correct?
- Is hover behavior helpful rather than decorative?
- Does motion clarify state change?
- Does the interface stay usable without hover?
- Do destructive actions confirm or allow undo?

## Async Review Checklist

Check:
- loading
- empty
- error
- success
- retry or recovery where relevant

For each:
- does layout remain stable?
- is copy concise and useful?
- is the next step obvious?

## Responsive Review Checklist

Check at minimum:
- desktop
- mobile or narrow width
- long titles
- long cards
- long timeline items
- overflow and wrapping
- composer or action regions
- sticky or scroll ownership when relevant

## Accessibility Review Checklist

Check:
- keyboard navigation
- visible focus
- semantic controls
- labels and `aria-label`
- reduced motion
- validation and error messaging
- touch target practicality on mobile

## Required Validation

Run the route-appropriate commands defined by repo governance.

At minimum for meaningful frontend work, from `next-app/`:
- `npm run lint`
- `npm run lint:styles` if CSS changed
- `npm run typecheck`
- `npm run test:vitest`

Use any additional route-specific validation required by `AGENTS.md` and the frontend specialist.

## Handoff Contract

Frontend task handoff should include:
- visual thesis
- structure thesis
- interaction thesis
- behavior changed
- tests updated
- commands run
- mobile and accessibility review status
- remaining approval-gated or follow-up items
