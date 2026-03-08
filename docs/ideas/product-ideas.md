# Product Ideas

This file is a staging area for rough product ideas before they are promoted into canonical plans or implementation work.

## Status Legend
- idea: raw concept, not yet shaped
- exploring: under discussion
- ready: clear enough to move into a plan
- rejected: intentionally not moving forward

## Organization
- Keep ideas grouped by priority first, then by product area.
- Move ideas upward or downward as priority changes.
- Promote only clearer, implementation-ready items into canonical plans.

## Top Priority

### Inline Citations and Reference Lists in Draft + Chat
- Status: exploring
- Summary: Both the draft experience and chat experience need first-class support for inline citations and a generated reference list at the end.
- Why this matters:
  - This is one of the most important product gaps right now.
  - Users need output that is much closer to usable academic writing.
  - Citations and references need to work consistently across drafting and conversational writing flows.
- Draft requirements:
  - Insert inline citations directly into generated or rewritten draft text.
  - Maintain or generate a references section at the end of the draft or section output.
  - Keep citation formatting tied to real studies in the project ledger.
- Chat requirements:
  - Allow chat responses to include inline citations in the body text.
  - Allow longer writing-style chat responses to include a references list at the end.
  - Make cited studies traceable and grounded to actual project sources.
- Open questions:
  - Which citation style should be supported first
  - Whether references should be appended automatically or optionally
  - How inline citations map to ledger studies and draft rich-text structure
  - Whether chat references are per-message only or can be saved into draft artifacts

## Medium Priority

### Draft Rewrite Modes
- Status: exploring
- Summary: Add two rewrite options in the draft experience.
- Quick rewrite:
  - Faster rewrite path.
  - Uses limited context.
  - Intended for lightweight local improvement.
- Intelligent rewrite:
  - Higher-quality rewrite path.
  - Uses broader context.
  - Agentic, multi-step, can check protocol and other draft sections before rewriting.
- Open questions:
  - Final naming
  - Exact context included in each mode
  - UX entry points
  - Expected latency
  - Whether output is direct replace, proposal diff, or both

### PDF Parsing Reorganization
- Status: exploring
- Summary: Reorganize the PDF parsing pipeline to improve quality, structure, and depth across both parsing phases.
- Goals:
  - Make the parsing flow more organized and easier to reason about.
  - Improve the quality and usefulness of the fast first-pass extraction.
  - Expand the deeper second-pass analysis to produce richer insights.
- Phase 1 direction:
  - Optimize the quick pass for better extraction quality and cleaner structure.
  - Improve what is captured early so the system starts from a stronger baseline.
- Phase 2 direction:
  - Make the deeper pass substantially more insightful.
  - Extract more meaningful structure, interpretation, and downstream-usable signals.
- Open questions:
  - What exact outputs each phase should produce
  - Whether phase 1 and phase 2 should share a common intermediate representation
  - Which insights are most valuable for later search, screening, drafting, and QA flows
  - What should be stored vs computed on demand
