# P_A Memory Lessons for LitRev

## Scope

This review compares the P_A personal-assistant memory system and the richer `P_A-perfect-personal-assistant` worktree against the LitRev memory-system redesign branch. P_A is a personal operating system with broad life memory; LitRev is a multi-user scientific review app. The useful transfer is architectural doctrine, not a copy of the storage model.

## P_A Strengths Worth Keeping

- Capture and belief are separate. P_A can observe a session without immediately promoting every inferred fact to current truth.
- Source authority is explicit. Direct user statements, summaries, document observations, public sources, and agent inference are distinct.
- Memory has layers. Session history, working memory, project memory, role/profile memory, document/source memory, graph facts, and sensitive memory are not treated as one bucket.
- Review is a first-class workflow. Sensitive, inferred, cross-project, role, project, and graph-like facts route through proposals instead of silent promotion.
- Supersession is explicit. Current truth and historical truth remain separable.
- Human-readable mirrors and status commands make invisible state inspectable.
- Skills and context packs keep procedural guidance out of always-on memory.

## P_A Cautions for LitRev

- The broad life-area layer model is too personal and too open-ended for LitRev. LitRev should stay scoped to user preferences, project protocol/decisions, study evidence, artifacts, and auditable retrieval.
- Local SQLite plus Markdown vault mirrors are useful for P_A but wrong as LitRev's primary runtime. LitRev needs Postgres, tenancy, auth boundaries, and product UI.
- P_A's rule-based sensitivity heuristics are not robust enough for LitRev. In a smoke test, an ISO timestamp in structured metadata was misclassified as phone-like sensitive content. LitRev should prefer typed fields, explicit source refs, and field-aware validation over blanket regex classification.
- Arbitrary graph memory would be premature. LitRev may eventually need citation/study/protocol graphs, but not a general personal graph.

## LitRev State

LitRev already has most of the right primitives:

- user, project, study, conversation-summary, retrieval, and retrieval-item tables
- project/study memory keys and versioning
- archive/supersession behavior
- project-scoped cited-study retrieval
- retrieval audit rows with score components and answer-use feedback
- explicit `source`, `authority`, `polarity`, source refs, confidence, and embedding lifecycle fields
- summary and selected draft context treated as untrusted context

The key problem is no longer missing storage. It is preserving trust semantics from storage through retrieval, prompt assembly, UI, and later review.

## Applied Improvement

LitRev now carries compact memory provenance labels into `## Relevant Memory` prompt context:

- `Canonical / Protocol sync`
- `Confirmed / Accepted artifact`
- `Inferred / Deep analysis`
- `Rejecting` for negative or ruled-out memory

This is deliberately smaller than P_A's full context-pack machinery, but it preserves the most important lesson: recalled context must keep its authority boundary when the model sees it.

## Recommended Next Steps

1. Add a memory-review inbox for inferred project memories and user preferences, reusing existing artifact/proposal infrastructure where possible instead of creating another queue.
2. Define a LitRev context-pack contract for high-value agent runs: task, project/protocol context, retrieved memory with provenance, cited study evidence, approval requirements, and write-back plan.
3. Add periodic memory-health jobs for stale inferred memories, contradicted protocol facts, low-utility memories, and memories used in answers without enough evidence.
4. Keep conversation summaries as context only. Promote durable memory only through explicit user decisions, accepted artifacts, protocol sync, or strongly typed study extraction with evidence locators.
5. Avoid generic sensitivity regex over structured metadata. If LitRev adds sensitive-content detection, classify typed fields and user-provided prose separately.
