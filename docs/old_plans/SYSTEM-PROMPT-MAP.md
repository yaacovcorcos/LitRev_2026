# [ARCHIVED]
> **Note:** This file is obsolete. Active plans have moved to `docs/plans/README.md`.

# LitRev 2026 — System Prompt Map

> Complete reference for every AI system prompt in the app.
> For each prompt: what it says, where it lives, when it fires, and what needs improvement.

---

## 1. Copilot Base Prompt

**File:** `lib/ai/prompts/copilot-prompts.ts` — `BASE_PROMPT`
**Called from:** `assembleSystemPrompt()` — `ai-service.ts:streamChatWithArtifacts()`
**Trigger:** Every copilot chat message
**Model:** Default (configured in `lib/ai/config.ts`)

### Prompt Text

```
You are an AI assistant helping a researcher with their systematic literature review.
You are knowledgeable about research methodology, evidence synthesis, and academic writing.
Be concise, helpful, and cite sources when possible. Use markdown formatting for clarity.
When mentioning a specific study, always include a clickable markdown hyperlink to it.
Use the DOI link if available: [Author et al., Year](https://doi.org/DOI).
If only a PMID is available, link to PubMed:
  [Author et al., Year](https://pubmed.ncbi.nlm.nih.gov/PMID).
Never mention a study without linking to it.
```

### What It Does

Foundation identity for every copilot interaction. All 6 mode prompts extend this. Sets the AI's role, style, and the critical study-linking rule.

### What Needs Improvement

**Response length and structure:** The prompt says "be concise" but gives no calibration. The model doesn't know if concise means 2 sentences or 2 paragraphs. We should add guidance like: "For simple questions, respond in 1-3 sentences. For analysis or synthesis tasks, use structured sections with headers. Never exceed ~800 words unless the user explicitly asks for a long-form response."

**Tone calibration:** "Helpful" is vague. For a research tool, the tone should be more specific — authoritative but not condescending, precise with terminology, willing to say "I'm not sure" rather than fabricate. We should specify: avoid hedging language when the evidence is clear, but flag uncertainty when recommending methodological choices.

**Markdown formatting rules:** "Use markdown formatting" is under-specified. We should define when to use headers vs. bullets vs. bold, whether to use tables for comparisons, and that code blocks should only be used for actual code/search queries (not for general text).

**Study link edge cases:** What if the AI discusses a concept from a study but isn't directly citing it? What if it's referencing a well-known framework (like PRISMA) rather than a specific paper? The rule "never mention a study without linking to it" needs exceptions defined.

**Hallucination guardrail:** There's no instruction telling the model not to fabricate study references, DOIs, or PMIDs. This is critical — a fake DOI link is worse than no link. We need: "If you cannot verify a study's DOI or PMID from the context provided, describe the study without a link and note that the citation needs verification."

**Tool awareness:** The base prompt doesn't mention that the AI has tools available (PubMed search, ledger operations, etc.). The model should know it can take actions, not just give advice.

---

## 2. Mode Prompts (6 variants)

**File:** `lib/ai/prompts/copilot-prompts.ts` — `AGENT_MODE_PROMPTS`
**Called from:** `assembleSystemPrompt()` — `ai-service.ts:streamChatWithArtifacts()`
**Trigger:** Every copilot chat message (mode selected by user in UI)

Each mode prepends the Base Prompt, then appends mode-specific instructions:

### 2a. Protocol Mode

```
You are in PROTOCOL mode. Focus on PICO framework, inclusion/exclusion criteria,
search strategy, quality assessment tools (GRADE, Newcastle-Ottawa, etc.).
When proposing criteria, format them as criteria_card artifacts. Be specific and actionable.
```

**What needs improvement:**
- No definition of what a `criteria_card` artifact looks like (JSON schema? markdown? what fields?).
- Should guide the AI through a structured PICO elicitation flow — ask one component at a time if the user hasn't defined them yet.
- Should tell the AI to check existing protocol context before proposing changes (avoid overwriting what the user already decided).
- Missing guidance on how to handle conflicting criteria or when the user's criteria are too broad/narrow.
- Should instruct the AI to explain trade-offs (e.g., "narrowing your population will reduce included studies but increase homogeneity").

### 2b. Search Mode

```
You are in SEARCH mode. Help find relevant studies via PubMed and other databases.
Format discovered studies as study_proposal artifacts. Suggest search strategies,
help refine queries, and explain database differences.
```

**What needs improvement:**
- No definition of `study_proposal` artifact format.
- Should instruct the AI to construct Boolean search strings (AND/OR/NOT) and explain its query construction.
- Should reference the user's protocol/PICO when building searches — the prompt doesn't say to use the injected protocol context.
- Missing guidance on search breadth: should the AI aim for sensitivity (catch everything) or specificity (fewer, more relevant results)?
- Should tell the AI to suggest MeSH terms and their synonyms.
- No instruction on how many results to return or how to paginate large result sets.

### 2c. Screening Mode

```
You are in SCREENING mode. Evaluate studies against the review protocol.
Focus on inclusion/exclusion criteria matching, study quality, and relevance.
Be systematic and consistent.
For multi-study requests, propose a plan first and proceed step-by-step.
```

**What needs improvement:**
- Should explicitly instruct the AI to reference the `[PROTOCOL_CONTEXT]` and `## Relevant Memory` sections when screening — right now it just says "against the review protocol" generically.
- No guidance on how to format screening decisions (include/exclude/maybe with rationale).
- Should define what "systematic and consistent" means concretely — e.g., apply the same criteria in the same order for every study.
- Missing guidance on confidence levels: when should the AI flag a study as "maybe" vs. making a definitive call?
- Should instruct the AI to cite the specific inclusion/exclusion criterion that triggers each decision.

### 2d. Drafting Mode

```
You are in DRAFTING mode. Help write review sections with academic prose.
Format text changes as draft_diff artifacts with a target section. Synthesize
evidence across studies, ensure proper citations, and maintain a logical narrative flow.
```

**What needs improvement:**
- No definition of `draft_diff` artifact format (what does "target section" mean in the payload?).
- Should specify the academic writing style expected (formal third person, past tense for methods/results, present tense for established facts).
- No guidance on section structure — what sections does a systematic review typically have? The AI should know (Introduction, Methods, Results, Discussion, Conclusion).
- Should instruct the AI to use narrative synthesis by default and note when meta-analytic language is appropriate.
- Missing instruction on how to handle gaps — if data doesn't exist, say so rather than generalizing.
- No guidance on citation density — how often should studies be cited per paragraph?

### 2e. QA Mode

```
You are in QA mode. Check for unsupported claims, missing citations, conflicting
findings, and completeness.
Be rigorous and specific — flag exact sentences and suggest fixes. Reference the
protocol criteria when evaluating claims.
```

**What needs improvement:**
- Should define a structured output format for QA findings (e.g., numbered list with severity: critical/warning/suggestion).
- No guidance on scope — should QA check the entire draft or a specific section? What about checking across sections for consistency?
- Should instruct the AI to verify that all included studies appear in the results narrative.
- Missing instruction to check for PRISMA compliance items.
- Should tell the AI to distinguish between factual errors (study says X but draft says Y) vs. interpretive concerns (draft's conclusion seems too strong for the evidence).

### 2f. General Mode

```
You are helping with a systematic literature review. Answer questions, provide
guidance, and help with any aspect of the review process.
```

**What needs improvement:**
- This is the emptiest prompt. Should at minimum instruct the AI to suggest switching to a specific mode when the question clearly falls into one (e.g., if user asks about search strategy, suggest switching to Search mode).
- Should include guidance on common questions: methodology help, tool explanations, workflow guidance, interpretation of results.
- Could benefit from a brief description of the app's capabilities so the AI can help with "how do I..." questions.

---

## 3. Context Blocks (injected into Copilot prompt)

**File:** `lib/ai/prompts/copilot-prompts.ts` — context builder functions
**Assembly:** `assembleSystemPrompt()` concatenates: mode prompt + protocol + ledger + memory + autonomy + additional

These are not standalone AI calls — they're context blocks appended to prompts #1/#2.

### 3a. Protocol Context (`buildProtocolContext`)

```
[PROTOCOL_CONTEXT]
Population: {population}
Intervention: {intervention}
Comparison: {comparison}
Outcome: {outcome}
Inclusion: {criteria; separated}
Exclusion: {criteria; separated}
```

**Source:** Prisma `Protocol` table — `data` JSON field
**When included:** When the project has a saved protocol

**What needs improvement:**
- No framing instruction tells the AI how to use this. Should prepend something like: "The following is the user's review protocol. Always align your responses with these criteria. If the user asks something that contradicts the protocol, flag the conflict."
- Semicolon-separated criteria are hard to parse. Should use numbered lists.
- Missing fields that protocols often have: search databases, date range, language restrictions, study design filters.

### 3b. Ledger Context (`buildLedgerContext`)

```
[LEDGER_CONTEXT]
{total} studies: {included} included, {excluded} excluded, {maybe} pending review,
{unscreened} unscreened
```

**Source:** Prisma `Study` table — aggregated counts
**When included:** When the project has any studies

**What needs improvement:**
- One line of counts gives minimal context. Should include the names/titles of recently added or recently screened studies (last 5-10) so the AI has working context.
- No instruction on how the AI should use these counts (e.g., "If many studies are unscreened, prioritize helping with screening workflows").

### 3c. Memory Context (`formatMemoriesForContext`)

```
## Relevant Memory

User Preferences:
- {key}: {value} ({rationale})

Project Context:
- [{type} - {category}] {statement} | Rationale: {rationale}

Study Information:
- [{type} - {category}] {content}
```

**Source:** Memory retrieval system (deterministic scope rules + keyword scoring, capped at ~2000 tokens)
**File:** `lib/server/memory/memory-retrieval.ts`
**When included:** When relevant memories exist

**What needs improvement:**
- No usage instruction. The AI doesn't know if it should repeat these, reference them silently, or explicitly cite them. Should add: "Use these memories to inform your response. Reference user decisions when relevant (e.g., 'As you decided earlier, case studies are excluded'). Do not repeat the full memory block back to the user."
- No indication of memory freshness/confidence — are these from yesterday or from a month ago?
- Memory types could be prioritized: critical decisions > user preferences > study facts.

### 3d. Autonomy Context (`buildAutonomyContext`)

```
[AUTONOMY_CONTEXT]
User preset: {preset}. Always explain reasoning in provenance. For multi-step requests,
propose a plan first and wait for approval.
```

**Source:** User's autonomy settings
**When included:** Always

**What needs improvement:**
- The word "provenance" is not defined anywhere. The AI likely interprets this differently each time. Should be replaced with something concrete like: "When making a recommendation, explain your reasoning in a collapsible 'Reasoning' section."
- The preset name alone (e.g., "balanced") doesn't tell the AI what behavior it maps to. Should expand to: "User preset: balanced. This means: execute read-only actions automatically, propose write actions as artifacts for approval, and never auto-apply destructive actions."
- "Propose a plan first and wait for approval" conflicts with tool autonomy levels (which may auto-execute). The prompt should be consistent with the actual autonomy behavior.

### 3e. Additional Context (sanitized)

```
[ADDITIONAL_CONTEXT]
{user-provided text, max 500 chars, role markers stripped}
```

**Source:** `options.section` passed from the streaming route
**When included:** When the user provides section-level context
**Sanitization:** Strips `system:`, `user:`, `assistant:`, `[INST]`, `[/INST]` — truncates to 500 chars

**What needs improvement:**
- Sanitization is blocklist-based and easily bypassed. Should consider: stripping all XML/HTML tags, limiting to alphanumeric + common punctuation, or using a more robust approach.
- 500 char limit may be too short for meaningful section context (e.g., a draft paragraph being reviewed).

---

## 4. PDF Quick Extract

**File:** `lib/server/pdf-extraction-prompts.ts` — `QUICK_EXTRACT_SYSTEM_PROMPT`
**Called from:** `lib/server/pdf-extraction.ts:quickExtractWithAI()`
**Trigger:** PDF upload — Stage 1 extraction
**Model:** `grok-4-1-fast` | **Temp:** 0.2 | **Max tokens:** 2000

### Prompt Text

```
You are extracting bibliographic metadata from an academic research paper.

Return ONLY valid JSON (no markdown, no explanation, no code fences):
{
  "title": "Full title of the paper",
  "authors": "LastName1 Initials, LastName2 Initials, ...",
  "year": 2024,
  "journal": "Journal Name",
  "volume": "12",
  "issue": "3",
  "pages": "123-145",
  "doi": "10.xxxx/xxxxx",
  "pmid": "12345678",
  "abstract": "Complete abstract text copied verbatim from the paper"
}

Rules:
1. Copy the abstract EXACTLY as it appears in the paper — do not summarize or shorten it
2. For authors, use standard academic format: "Smith J, Doe AB, Garcia-Lopez M"
3. Omit any field you cannot confidently find — do not guess or fabricate
4. Return ONLY the JSON object, nothing else
```

### User Prompt Builder (`buildQuickExtractPrompt`)

```
Extract bibliographic metadata from this academic paper.

Already extracted (verify if possible):
- DOI: {doi}
- PMID: {pmid}
- Year: {year}

--- PAPER TEXT ---
{truncated PDF text, max 40k chars}
--- END OF TEXT ---
```

### What It Does

First-pass extraction after PDF upload. Regex layer runs first for DOI/PMID/year, then AI fills in the rest. Regex results take precedence for DOI/PMID in the final merge.

### What Needs Improvement

- **This prompt is solid.** Strict JSON output, clear rules, good examples. It's the best-written prompt in the app.
- Minor: could add a rule about handling multi-part papers or supplements (extract from the main paper only).
- Could add guidance on structured vs. unstructured abstracts — should the AI preserve the IMRAD structure within the abstract text?
- The "verify if possible" instruction for regex-extracted fields is good, but should clarify what to do on conflict (e.g., regex found DOI X but the paper text shows DOI Y).

---

## 5. PDF Deep Analysis

**File:** `lib/server/pdf-extraction-prompts.ts` — `DEEP_ANALYSIS_SYSTEM_PROMPT`
**Called from:** `lib/server/pdf-extraction.ts:deepAnalyzeWithAI()`
**Trigger:** PDF upload — Stage 2 (after quick extract)
**Model:** `grok-4-1-fast` | **Temp:** 0.3 | **Max tokens:** 2000

### Prompt Text

```
You are performing an in-depth analysis of an academic research paper for a
systematic literature review.

Return ONLY valid JSON (no markdown, no explanation, no code fences):
{
  "aiSummary": "2-3 sentence summary of key findings, methodology, and relevance",
  "studyType": "RCT|Cohort|Case-Control|...|Other",
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "quality": "High|Medium|Low",
  "qualityRationale": "Brief explanation of quality rating"
}

StudyType detection rules:
- RCT: "randomized", "randomised", "RCT", "blinded", "placebo-controlled"
- Cohort: "cohort study", "prospective", "retrospective cohort"
- Systematic-Review: "systematic review", "PRISMA", "searched databases"
- Meta-Analysis: "meta-analysis", "pooled analysis", "forest plot"
- Case-Control: "case-control", "cases and controls", "odds ratio"
- Cross-Sectional: "cross-sectional", "survey", "prevalence study"
- Case-Report: "case report", "case series", "we present a case"
- If unclear or mixed, use "Other"

Quality assessment criteria:
- High: Clear methodology, appropriate sample size, proper controls, valid statistics
- Medium: Adequate methodology with some limitations
- Low: Weak methodology, small sample, significant biases

Rules:
1. aiSummary: focus on findings + methodology + significance (not just abstract)
2. Keywords: use paper's list if present; otherwise infer 3-5 terms
3. qualityRationale: justify with specific observations
4. Omit uncertain fields
5. Return ONLY JSON
```

### What It Does

Second-pass analysis producing study classification, AI summary, keywords, and quality assessment.

### What Needs Improvement

- **Quality assessment is too subjective.** "High/Medium/Low" with loose prose criteria will produce inconsistent ratings across papers. Should use a standardized tool (e.g., simplified Newcastle-Ottawa scale) or at minimum provide a scoring rubric with specific yes/no checkpoints.
- **Study type detection is keyword-based.** The prompt tells the model to look for keywords, but many papers don't use these exact terms. Should instruct the AI to also analyze the methods section structure (randomization procedure described? cohort followed over time? etc.).
- **Missing fields that would be useful:** sample size, follow-up duration, primary outcome, geographic setting, funding source. These are commonly extracted in systematic reviews.
- **The "Other" category is too broad.** Should have sub-types or at least require the AI to describe what type it is when using "Other" (e.g., "Other: narrative review" or "Other: methodological paper").

---

## 6. Conversation Summarization

**File:** `app/actions/summarize-conversation.ts` — `SUMMARIZE_PROMPT`
**Called from:** `summarizeConversationAction()`
**Trigger:** User archives a conversation (or auto-triggered at length threshold)
**Model:** `grok-4-1-fast` | **Temp:** 0.2 | **Max tokens:** 1500

### Prompt Text

```
You are summarizing a conversation between a user and an AI research assistant.
Produce a structured summary with these sections:
1. **Summary**: A 2-3 sentence overview of what was discussed.
2. **Key Points**: 3-6 bullet points of the most important topics or findings.
3. **Decisions Made**: Any explicit decisions or choices the user committed to.
4. **Follow-up Needed**: Outstanding questions or next steps mentioned.

Return ONLY valid JSON in this shape:
{
  "summary": "...",
  "keyPoints": ["..."],
  "decisions": ["..."],
  "followUpNeeded": ["..."]
}
```

### What It Does

Summarizes archived conversations into structured JSON. The summary is stored in a `ConversationSummary` DB record and injected as a system message in the new continuation conversation.

### What Needs Improvement

- **Overlaps with memory extraction (prompt #7).** Both extract "decisions" from conversations but use different models/approaches and store results differently. Should clarify their relationship or merge them.
- **No domain-specific guidance.** "Key points" in a literature review context should prioritize: which studies were discussed, screening decisions made, methodological choices, and protocol refinements. The prompt is generic enough to work for any conversation.
- **"Follow-up needed" is often empty.** Users rarely say "we need to follow up on X." Should instruct the AI to infer follow-ups from incomplete discussions (e.g., "User discussed screening criteria but hasn't applied them to the 15 unscreened studies").
- **Missing: what mode/phase the conversation was in.** The summary should capture whether this was a protocol discussion, search session, screening batch, etc. — this helps the continuation conversation pick up where things left off.
- **No length guidance.** The summary could be 1 sentence or 500 words. Should specify: "Summary should be 2-3 sentences. Each key point should be a single sentence. Total output should be under 500 words."

---

## 7. Memory Extraction from Conversations

**File:** `lib/server/memory/conversation-extractor.ts` — `EXTRACTION_PROMPT`
**Called from:** `extractMemoriesFromConversation()`
**Trigger:** After conversations with 5+ substantive messages
**Model:** `grok-4-1-fast` | **Temp:** 0.1 | **Max tokens:** 1500
**Guard:** Dedup check — skips if conversation already extracted

### Prompt Text

```
You are analyzing a conversation between a researcher and an AI assistant about a
systematic literature review. Extract actionable memories.

Return ONLY valid JSON in this shape:
{
  "decisions": [
    { "statement": "...", "category": "...", "rationale": "..." }
  ],
  "preferences": [
    { "key": "...", "value": "...", "rationale": "..." }
  ],
  "facts": [
    { "statement": "...", "category": "..." }
  ]
}

Rules:
- "decisions": explicit user decisions (e.g., "let's exclude case studies")
- "preferences": inferred user preferences (e.g., prefers APA style)
- "facts": domain-specific facts (e.g., "primary outcome is mortality at 30 days")
- "category": one of "inclusion", "exclusion", "outcome", "population",
  "intervention", "comparison", or null
- If nothing is extractable, return empty arrays
- Keep statements concise (under 200 characters)
```

### What It Does

Mines conversations for durable knowledge:
- **Decisions** — auto-stored as `ProjectMemory` (type: "decision")
- **Facts** — auto-stored as `ProjectMemory` (type: "definition")
- **Preferences** — proposed as `memory_proposal` artifacts (requires user approval)

### What Needs Improvement

- **Under-extraction risk.** At temp 0.1, the model is very conservative. It may miss implicit decisions (user said "yeah that makes sense" in response to an exclusion suggestion — that's a decision). Should either raise temp slightly or add examples of implicit vs. explicit decisions.
- **No priority/importance signal.** All decisions are stored as "important" and all facts as "normal." The AI should assess importance: "exclude all studies before 2010" is critical; "I prefer bullet points" is minor.
- **The 200-character limit for statements is restrictive.** Some decisions need context to be useful later (e.g., "Exclude studies with fewer than 50 participants because our research question requires sufficient statistical power for subgroup analysis" — 145 chars but barely fits).
- **No negative extraction.** The prompt should also capture what the user explicitly rejected (e.g., "User considered including grey literature but decided against it"). Rejected options are valuable context for future interactions.
- **Preference key/value format is under-specified.** What should the "key" look like? Without examples, the AI might produce inconsistent keys like "style" vs. "writing_style" vs. "preferred_style".

---

## 8. Planner (heuristic, no AI prompt yet)

**File:** `lib/server/agent/planner.ts`
**Called from:** `ai-service.ts:streamChatWithArtifacts()` when multi-step patterns detected
**Trigger:** User message matches conjunction patterns or references 2+ tools

### Current Behavior

No AI call. Uses regex pattern matching to detect multi-step workflows and builds a heuristic plan from keyword matching. Code comments say AI-powered planning is deferred to Phase 4.

### What Needs Improvement

- **The heuristic is brittle.** "Search PubMed for RCTs on aspirin and add the good ones" matches both "search" and "add" keywords, producing a 2-step plan. But "Can you help me understand my search results?" only matches "search" — the planner can't distinguish action requests from questions.
- **No AI prompt means no reasoning.** The heuristic can detect *what* tools to call but not *how* to sequence them or what parameters to use. An AI-powered planner would understand: "search, then screen against my criteria, then add the ones that pass" as a 3-step pipeline with data dependencies.
- **When this becomes an AI prompt, it should:** receive the full context (protocol, ledger counts, available tools with descriptions) and produce a structured plan with step dependencies, estimated action count, and a natural-language explanation the user can approve/reject.

---

## Prompt Flow Diagram

```
User sends message
        |
        v
  +-------------------------------------------------------+
  |  streamChatWithArtifacts()  (ai-service.ts)            |
  |                                                        |
  |  1. Fetch in parallel:                                 |
  |     - retrieveAndFormatMemories() --> Memory block     |
  |     - protocol from DB -----------> Protocol block     |
  |     - study counts ---------------> Ledger block       |
  |     - autonomy config ------------> Autonomy block     |
  |                                                        |
  |  2. assembleSystemPrompt() (stable → variable order)    |
  |     = Mode Prompt (includes Base)                      |
  |     + [PROTOCOL_CONTEXT]                               |
  |     + [AUTONOMY]                                       |
  |     + [LEDGER_CONTEXT]                                 |
  |     + ## Relevant Memory                               |
  |     + [ADDITIONAL_CONTEXT]                             |
  |                                                        |
  |  3. Check multi-step --> planner (heuristic)           |
  |  4. Stream to AI with tool loop                        |
  +-------------------------------------------------------+

PDF Upload
        |
        v
  Stage 1: extractStudyFromPdf()
     - Regex extraction (DOI, PMID, year, title, authors)
     - Quick Extract AI (prompt #4)
     - Merge results (regex wins for DOI/PMID)
        |
        v
  Stage 2: deepAnalyzeStudyFromPdf()
     - Deep Analysis AI (prompt #5)
     - Produces summary, studyType, keywords, quality

Conversation Archive
        |
        v
  summarizeConversationAction() (prompt #6)
     - Produces structured summary JSON
     - Stores summary, injects into new conversation

Post-Conversation
        |
        v
  extractMemoriesFromConversation() (prompt #7)
     - Mines decisions, facts, preferences
     - Auto-stores decisions/facts
     - Proposes preferences as artifacts
```

---

## Models and Parameters Summary

| Prompt | Model | Temp | Max Tokens | Output Format |
|--------|-------|------|------------|---------------|
| Copilot (all modes) | Default (config) | Default | Default | Markdown (free-form) |
| PDF Quick Extract | grok-4-1-fast | 0.2 | 2000 | Strict JSON |
| PDF Deep Analysis | grok-4-1-fast | 0.3 | 2000 | Strict JSON |
| Conversation Summary | grok-4-1-fast | 0.2 | 1500 | Strict JSON |
| Memory Extraction | grok-4-1-fast | 0.1 | 1500 | Strict JSON |

---

## Cross-Cutting Issues

### 1. Copilot prompts are drastically thinner than extraction prompts

The PDF extraction prompts have precise JSON schemas, explicit rules, detection heuristics, and clear output constraints. The copilot prompts — which handle the primary user interaction — have 2-3 lines of guidance per mode with no output structure, no behavioral examples, and no edge case handling. This asymmetry means the background extraction pipeline is more reliable than the user-facing chat.

### 2. Artifact formats are never defined

Three modes reference artifact types (`criteria_card`, `study_proposal`, `draft_diff`) but none of the prompts define what these look like. The AI is expected to produce artifacts in the correct format without ever seeing an example. This likely leads to inconsistent artifact payloads that the frontend struggles to render.

### 3. Context blocks lack usage instructions

Protocol context, ledger context, memory context, and autonomy context are all injected as raw data blocks. None of them include instructions telling the AI *how* to use the information. The AI may ignore them, repeat them verbatim, or misinterpret their purpose.

### 4. Sanitization is shallow

`sanitizeContext()` uses a blocklist (strips `system:`, `user:`, `assistant:`, `[INST]`). This approach is easily bypassed by creative prompt injection. Consider: stripping all content that matches common injection patterns, limiting character set to alphanumeric + standard punctuation, or using a deny-by-default approach.

### 5. Prompts #6 and #7 overlap

Conversation summarization (prompt #6) extracts "decisions made" and memory extraction (prompt #7) extracts "decisions." They run on the same conversation data but store results differently and use different models. This creates potential for conflicting or duplicate information in the memory system.

### 6. No feedback loop

None of the prompts incorporate information about past prompt performance. If the AI consistently produces bad screening decisions or low-quality drafts, there's no mechanism to adjust. The memory system captures user preferences but not quality signals about AI outputs.

---

*Generated: 2026-02-07 — update this file whenever a prompt changes.*
