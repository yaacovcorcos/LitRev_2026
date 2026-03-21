# Frontend Quality Bar

This file is the durable frontend doctrine for LitRev.
It defines what "beautiful, stable frontend work" means in this repository.

This is not an active plan and not a changelog.
For active UI work, use `docs/plans/README.md` to locate the current plan.
For the implementation and review procedure, use `docs/runbooks/frontend-review-loop.md`.

## Purpose

LitRev is a scientific workspace, not a marketing site.
Frontend work should feel precise, calm, trustworthy, and usable under dense real-world workflows.

The default posture is:
- composition before decoration
- hierarchy before component count
- clarity before cleverness
- restraint before chrome
- visible feedback without visual noise

## Surface Intent

Task-heavy workspace surfaces such as `/ai`, project pages, copilot, timeline, draft, ledger, notes, memory, protocol, and productive admin views should feel:
- calm
- precise
- dense but breathable
- evidence-forward
- operational rather than promotional

Entry, onboarding, and empty-state-first surfaces may use stronger visual framing, but they must still:
- keep one clear focal idea
- keep the next action obvious
- avoid generic AI-startup styling

## Token-First Styling

Use `next-app/styles/tokens.css` as the primary visual system.

Rules:
- prefer existing tokens before adding local values
- if a value should repeat, promote it into tokens
- avoid hardcoded palette values unless the value is intentionally local and reviewed
- local exploration must not become an ad hoc parallel design system

## Composition and Hierarchy

Each surface should answer:
- what is the primary task?
- what is supporting context?
- what must remain visible?
- what can be visually demoted?

Rules:
- one dominant idea per screen or major region
- one clearly primary action per region unless the workflow genuinely requires more
- supporting metadata should stay visible but quieter than the main task
- avoid equal-weight layouts unless the task is truly peer-balanced
- prefer spacing, alignment, contrast, and grouping before adding borders, cards, and badges
- do not add wrappers or panels unless they create real semantic separation

## Control Hierarchy

Control density and action placement are deliberate design decisions.

Rules:
- default to the smallest viable control for the job
- use icon-only controls for familiar compact actions when accessibility remains clear
- keep inline secondary actions short and context-local
- keep header actions grouped together
- keep form actions together at the bottom of the form
- make secondary actions visually subordinate to the primary action
- question whether a control needs to exist before adding it
- keep labels concise and task-focused

## Motion and Feedback

Motion is allowed only when it improves comprehension.

Rules:
- motion should clarify state change, continuity, attachment, reveal, or feedback
- honor `prefers-reduced-motion`
- avoid `transition: all`
- use subtle transitions for hover, focus, expand/collapse, and status feedback
- every interactive element needs visible feedback on hover, focus, pressed, disabled, or selected states
- avoid decorative motion on dense workspace surfaces

## Async and Error Quality

All meaningful async surfaces must feel deliberate in:
- loading
- empty
- error
- success
- retry or recovery

Rules:
- loading states should preserve layout expectations
- empty states should be calm and useful
- error states should be concise, visually controlled, and action-oriented
- success feedback should confirm without hijacking the interface
- recovery paths must be obvious when relevant

## Accessibility and Responsiveness

Accessibility is part of visual quality, not a separate pass.

Minimum bar:
- semantic controls
- visible focus
- labels or `aria-label`
- keyboard-complete interaction
- reduced motion support
- sufficient contrast
- clear validation and error messaging
- usable touch targets on mobile
- stable behavior across desktop and mobile layouts

## Anti-Patterns

Do not ship:
- visible no-op controls
- nested scroll traps without clear ownership
- decorative dashboarding on task-heavy workspace surfaces
- generic AI chrome, glow, or futuristic filler styling
- effect-driven UI choreography for normal product flows
- token bypass through local ad hoc styling

## Exit Criteria

A frontend change is not done until:
- hierarchy is obvious at a glance
- the main action is clear
- desktop and mobile both work
- async and error states feel deliberate
- accessibility baseline is intact
- token-first styling is preserved
- the result feels like LitRev rather than a generic AI interface
