# Model Portfolio and Provider Routing

Review date: 2026-07-12
Status: implementation and local runtime/UI verification complete; production activation awaits migration, live provider evaluation, and rollout approval
Scope: Papilab/LitRev chat model selector, reasoning controls, pricing, multimodal input, provider routing, and usage truth

Prices and provider observations are a dated USD snapshot. Re-check the live provider catalog before production release and during recurring model evaluations.

## Decision

Implement exactly these seven user-selectable models, in this order:

1. **DeepSeek V4 Flash — Fast & Cheapest**
   Use for summaries, rewrites, extraction, classification, quick coding chores, and inexpensive background work.

2. **GPT-5.6 Luna — Default**
   The safest everyday choice: strong, fast, very large context, good tool support, and already available through the production OpenAI account.

3. **DeepSeek V4 Pro — Science Value**
   The primary recommendation for a very cheap but genuinely strong coding model, and the best cost-quality candidate for high-volume scientific/tool workflows.

4. **GPT-5.6 Terra — Advanced Research**
   The deliberate middle tier between Luna and Sol. Use when Luna is insufficient for difficult scientific synthesis or long-context work, without immediately paying Sol prices.

5. **Qwen 3.7 Plus — Vision & Documents**
   The specialist for figures, screenshots, tables, scanned pages, and visually complex long documents.

6. **Grok 4.5 — Strong Agent**
   A strong alternative for coding, agentic work, and complex tool orchestration.

7. **GPT-5.6 Sol — Premium**
   Reserve for the hardest scientific synthesis and tasks where incremental accuracy matters more than cost.

## Portfolio at a Glance

Prices are USD per 1 million tokens at the base tier of the implemented default route. “Cached” means cache-hit input; “Cache write” is the separately billed prompt-cache creation rate when the provider publishes and reports it. The example large task is identical for every model: 500,000 ordinary uncached input tokens plus 50,000 output/reasoning tokens, with no cache writes, aggregated across calls that remain below long-context price thresholds. Formula: `0.5 × input price + 0.05 × output price`.

| Model | Product role | Context / max output | Distinct value | App reasoning choices | Input | Cached | Cache write | Output | Example large task |
|---|---|---:|---|---|---:|---:|---:|---:|---:|
| DeepSeek V4 Flash | Fast & cheapest | 1M / 384K | Extremely cheap text, coding chores, extraction, tools | Fast, High, Max | $0.140 | $0.028 | — | $0.280 | $0.084 |
| GPT-5.6 Luna | Default | 1.05M / 128K | Best everyday balance; vision and tools | Fast, Low, Medium, High, Max | $1.00 | $0.10 | $1.25 | $6.00 | $0.80 |
| DeepSeek V4 Pro | Science value | 1M / 384K | Serious coding and scientific reasoning at very low cost | Fast, High, Max | $0.435 | $0.003625 | — | $0.870 | $0.261 |
| GPT-5.6 Terra | Advanced research | 1.05M / 128K | Stronger science and long-context work than Luna | Fast, Low, Medium, High, Max | $2.50 | $0.25 | $3.125 | $15.00 | $2.00 |
| Qwen 3.7 Plus | Vision & documents | 1M / 64K | Figures, screenshots, scans, tables, long multimodal inputs | Fast, High, Max | $0.40 | $0.08 | $0.50 | $1.60 | $0.28 |
| Grok 4.5 | Strong agent | 500K / 500K catalog limit | Coding, tool orchestration, independent frontier alternative | Fast, Medium, High | $2.00 | $0.50 | — | $6.00 | $1.30 |
| GPT-5.6 Sol | Premium | 1.05M / 128K | Highest-capability escalation path | Fast, Low, Medium, High, Max | $5.00 | $0.50 | $6.25 | $30.00 | $4.00 |

The shared example is a base-tier comparison, not an invoice. Runtime usage estimates apply the known long-context tiers, provider-reported cache writes, and provider-confirmed xAI priority multiplier, but still exclude web-search/tool fees, OpenAI priority pricing, taxes, retries, sub-agents, and any differently priced gateway fallback host. When a provider omits a cache-creation token count, an estimate cannot include those unobserved writes. Actual cost can be lower with cache hits or higher when cache creation, reasoning, and tool loops generate more billable tokens.

### Long-context and delivery pricing

- GPT-5.6 Luna requests above 272K tokens use $2.00 input and $9.00 output per million for the entire request.
- GPT-5.6 Terra requests above 272K tokens use $5.00 input and $22.50 output per million for the entire request.
- GPT-5.6 Sol requests above 272K tokens use $10.00 input and $45.00 output per million for the entire request.
- GPT-5.6 cache writes cost 1.25× ordinary input: $1.25 for Luna, $3.125 for Terra, and $6.25 for Sol at the base tier. The runtime persists `cache_write_tokens` separately and applies the same request-level input multiplier at the long-context tier.
- Qwen 3.7 Plus requests above 256K tokens use the higher creator tier: $1.20 input, $0.24 cache read, $1.50 cache write, and $4.80 output per million.
- Grok 4.5 direct xAI base pricing is $2.00 input, $0.50 cached input, and $6.00 output per million through 200K input tokens. Above 200K input tokens, input, cached input, and output rates are 2×; provider-confirmed priority processing adds another 2× multiplier.
- xAI priority processing is opt-in and costs 2× every token type only when the response confirms `service_tier: "priority"`.
- OpenAI priority processing is a separate paid scheduling tier. The app labels it as costing more and records the returned tier; account-specific availability and rates must be rechecked before production activation.

## What Each Model Adds

### DeepSeek V4 Flash — Fast & Cheapest

**Value:** A genuinely inexpensive worker prevents mechanical work from consuming frontier-model budgets. Its long context also makes it attractive for cheap first passes over large source sets.

**Choose it for:** quick coding chores, summaries, rewriting, extraction, classification, title/keyword generation, query cleanup, and low-risk background work.

**Do not treat it as:** the final authority for consequential scientific synthesis merely because it is cheap.

**Selector copy:** “Fastest and cheapest · summaries, rewrites and extraction.”

### GPT-5.6 Luna — Default

**Value:** Luna is the balance point. It lets a user ask an ordinary question without first understanding the portfolio.

**Choose it for:** most literature questions, writing, mixed research workflows, coding, structured extraction, vision input, and tool-assisted work.

**Default posture:** Luna with Medium reasoning.

**Selector copy:** “Best everyday choice · research, writing and tools.”

### DeepSeek V4 Pro — Science Value and Primary Cheap Coding Model

**Value:** Pro is the recommendation when the requirement is “very cheap but super good at coding.” It adds much stronger repository-level reasoning than a mechanical fast model while remaining dramatically cheaper than the closed premium tier.

**Choose it for:** multi-file coding, difficult debugging, tool-driven code changes, large scientific analysis, search planning, evidence-table reasoning, and long agent jobs. Use High by default; reserve Max for the hardest cases.

**Coding cost examples:** a 100K-input/20K-output task is about $0.061 on Pro and about $0.020 on Flash at base rates. Flash is the cheap worker; Pro is the serious coder. No additional coding-only model currently adds enough differentiated value to justify another integration.

**Release condition:** Papilab-specific evaluations must prove tool correctness, evidence faithfulness, citation integrity, and long-context retrieval before the product label becomes a quality guarantee.

**Selector copy:** “Strong reasoning · large scientific and coding tasks.”

### GPT-5.6 Terra — Advanced Research

**Value:** Terra is not redundant middle ground when the workflow needs a controlled escalation ladder. It costs 2.5× Luna for the standardized task instead of Sol’s 5×, while offering a stronger science/long-context tier.

**Choose it for:** difficult synthesis, complex protocols, long evidence sets, and cases where Luna underperforms but Sol would be premature.

**Portfolio decision:** include Terra, but evaluate Luna→Terra escalation on Papilab tasks. If Terra does not produce a meaningful quality gain over Luna, disable it rather than keeping an expensive decorative option.

**Selector copy:** “Stronger science and long-context work than Luna.”

### Qwen 3.7 Plus — Vision & Documents

**Value:** Qwen adds a different modality, not merely another point on the text-quality curve. The implementation supports access-checked PNG, JPEG, and WebP inputs alongside PDF text attachments.

**Choose it for:** figure interpretation, table extraction, screenshot analysis, scanned pages, document-layout questions, and long inputs mixing text and images.

**Provider classification:** Qwen 3.7 Plus is a managed Alibaba model, not an arbitrary open-weight deployment. Provider competition and regional choices are therefore narrower than for DeepSeek.

**Selector copy:** “Figures, tables, scans and visually complex documents.”

### Grok 4.5 — Strong Agent

**Value:** Grok adds an independent frontier provider with a strong coding/agentic focus and native Low/Medium/High reasoning.

**Choose it for:** difficult coding, complex tool orchestration, multi-step work, and an alternative frontier-model perspective.

**Important behavior:** reasoning cannot be disabled. The app’s Fast choice maps to native Low. Paid priority delivery remains a separate toggle.

**Selector copy:** “Complex tools, coding and difficult multi-step work.”

### GPT-5.6 Sol — Premium

**Value:** Sol is the explicit quality ceiling, not a default.

**Choose it for:** the hardest scientific synthesis, difficult biological reasoning, complex protocol design, high-stakes review, or a second pass after cheaper models fail.

**UI contract:** selecting Sol requires an accessible confirmation explaining that the standardized task costs about 5× Luna. The selected state remains visibly marked Premium.

**Selector copy:** “Highest capability · reserve for the hardest synthesis.”

## Reasoning and Delivery Controls

The app implements three separate concepts:

1. **Reasoning effort:** how much compute the model spends.
2. **Reasoning visibility:** hidden for the current portfolio because no active adapter returns a safe, genuinely summarized trace.
3. **Delivery mode:** standard or paid priority scheduling where supported.

Visibility never chooses compute. No current portfolio model exposes a reasoning-visibility control: direct OpenAI and xAI Chat Completions do not return a supported summary, while DeepSeek/Qwen reasoning fields are raw private reasoning rather than a safe provider summary. No current portfolio route promises raw/full chain-of-thought. Hidden provider reasoning needed for a tool continuation is retained only as transient server state and is deliberately excluded from client serialization and transcript persistence.

| UI effort | OpenAI | Grok 4.5 | DeepSeek V4 | Qwen 3.7 Plus |
|---|---|---|---|---|
| Fast | `none` | native `low` | thinking disabled | thinking disabled |
| Low | `low` | not duplicated in UI | not exposed | not exposed |
| Medium | `medium` | native `medium` | not exposed | not exposed |
| High | `high` | native `high` | thinking High | thinking enabled with bounded budget |
| Max | `max` | not exposed | thinking Max | thinking enabled with a larger bounded budget |

The selected effort is stored per model so switching models restores a valid prior choice. Priority is not persisted and resets to Standard after each request and model switch.

## Provider Routing

### Implemented default routing

- **GPT-5.6 Luna, Terra, Sol:** direct OpenAI.
- **Grok 4.5:** direct xAI.
- **DeepSeek V4 Flash, DeepSeek V4 Pro, Qwen 3.7 Plus:** one OpenAI-compatible gateway adapter, defaulting to Vercel AI Gateway. Requests are restricted to the creator providers (`deepseek` and `alibaba`) by default. Additional fallback hosts become eligible only when explicitly added to the corresponding `AI_GATEWAY_*_PROVIDERS` allowlist after privacy, region, reliability, and price approval.

Stable product IDs are separate from upstream route IDs. The gateway base URL, key, and each upstream slug are server-side environment settings, so a provider bake-off does not change saved preferences or UI copy.

For Vercel routing, `providerOptions.gateway.only` and `order` are both set from the approved provider list. The Vercel team-level Provider Allowlist should be enabled as defense in depth before production activation.

### Why start with Vercel AI Gateway

- It lists all three new gateway-routed models in USD.
- It advertises zero token markup, consolidated budgets, observability, and provider failover.
- It fits the existing Vercel deployment surface.
- One credential—or Vercel's deployment OIDC—authenticates all three models; the separate `AI_MODEL_GATEWAY_ENABLED=1` rollout gate activates them only after evaluation approval.

Direct OpenAI and xAI remain preferable initially because native model/service-tier behavior matters and those integrations already exist.

### Alternatives to evaluate

| Model | Candidate route | Why evaluate | Main caution |
|---|---|---|---|
| DeepSeek V4 Flash | Official DeepSeek | Excellent cache pricing; creator route | Data policy and region review |
| DeepSeek V4 Flash | DeepInfra / GMICloud / Baidu via allowlisted gateway route | Potentially cheaper uncached tokens or faster throughput | Privacy, region, uptime, and tool-loop reliability |
| DeepSeek V4 Pro | Official DeepSeek | Cheapest reviewed route by a wide margin | Data policy and region review |
| DeepSeek V4 Pro | Fireworks / Together / Novita | Privacy or reliability alternatives | Much higher token price |
| Qwen 3.7 Plus | Alibaba Model Studio Global | Creator route and native controls | Regional, retention, and CNY billing considerations |
| DeepSeek models | OpenRouter with explicit provider pinning and ZDR | Broad host bake-off and fallback controls | Never use opaque cheapest-auto routing for sensitive research |

The reason to pay a third-party premium is privacy, regional compliance, reliability, or failover—not the assumption that every third party is cheaper.

## Reliability, Privacy, and Evaluation Gates

Before enabling the three new gateway models in production, run the same model/provider/effort matrix for:

- evidence faithfulness and unsupported-claim rate;
- PMID/DOI and citation integrity;
- governed PubMed/OpenAlex/Semantic Scholar tool-selection compliance;
- function-schema validity and multi-turn tool reliability;
- DeepSeek thinking → tool call → tool result continuation;
- long-context retrieval and cross-document synthesis;
- Qwen figure, table, scan, and OCR accuracy;
- time to first token, total latency, timeout/retry/provider-error rate;
- ordinary input, cache-hit input, cache-write input, reasoning/output tokens, effective cost, and priority-tier receipts;
- retention, training use, processing region, deletion, and sensitive-data policy.

Scientific search continues through Papilab’s governed evidence tools. A provider’s generic search must not silently replace that evidence pipeline.

## Implemented Product and Runtime Contracts

- Exactly seven selectable models, with Luna as the single default.
- Retired GPT-5.2, Grok 4.1 Fast, and Grok 4.3 selector/runtime defaults removed.
- Shared desktop/mobile model selector with role, cost class, and standardized cost estimate.
- Sol premium confirmation and conditional paid-priority warning.
- Independent model-specific effort and delivery controls; reasoning visibility remains hidden until an adapter can return a safe, genuinely summarized trace.
- Normal sends, plans, retries, continuations, queued follow-ups, project chat, `/ai`, and popup carry the same generation preference snapshot.
- Unknown, non-selectable, unsupported, and unconfigured model requests fail closed at the server boundary.
- Unconfigured or rollout-disabled models are disabled as Setup required; credentials plus the explicit rollout flag enable them without a code change.
- Qwen-capable current-turn image transport uses server-validated/access-checked file assets rather than client-authored raw bytes; IDs are deduplicated and image count/aggregate bytes are bounded before provider hydration.
- DeepSeek provider reasoning required by tool loops is transient and removed from the client wire.
- Agent runs and AI usage persist requested model/provider/effort/delivery metadata plus provider-observed actual model/provider/delivery receipts. Current adapters do not expose a trustworthy accepted reasoning-effort receipt, so `actualReasoningEffort` remains null rather than echoing the request. Usage rows separately persist cache-hit input, provider-reported cache-write input, reasoning tokens, and the resulting tier-aware estimated USD cost.
- Invisible/background work prefers Flash or Pro only after the corresponding gateway route is authenticated and rollout-enabled, then selects the first configured portfolio fallback; if no route is configured it fails explicitly instead of returning an unavailable default. Bounded JSON jobs use Fast reasoning.

## Local Browser Verification

The final local smoke used preview-only quick login with gateway rollout disabled and made no paid model calls.

- `/ai` desktop showed the exact seven-model order, Luna default, Setup required for disabled gateway routes, conditional delivery controls, and no unsupported reasoning-visibility selector.
- Keyboard selection opened with Enter, skipped disabled rows during arrow navigation, and selected the next eligible model.
- At 320×700, every model and control remained reachable, dialogs stayed within the 320px viewport, close targets measured 44×44, and the Sol premium confirmation included the 5× Luna and long-context warning.
- The embedded project conversation repeated the same model/effort/delivery contract without horizontal overflow.
- The browser reported no runtime errors; console output was limited to expected development/HMR information.

## Remaining Activation Inputs

Code and migrations are ready. Production OpenAI/xAI credentials and Vercel OIDC catalog access are already confirmed. Production activation still requires:

1. repeatable local/off-platform gateway authentication for live evaluation via `AI_MODEL_GATEWAY_API_KEY` (preferred), `AI_GATEWAY_API_KEY`, or a freshly pulled short-lived Vercel OIDC token;
2. production application of both additive AI-usage migrations before code writes the new routing, cache-write, and cost columns;
3. live basic-response smoke tests for all seven routes, plus DeepSeek thinking/tool continuation, governed search-tool loops, and Qwen image/document input;
4. explicit approval of provider privacy/retention/region posture and the Vercel team Provider Allowlist;
5. enabling `AI_MODEL_GATEWAY_ENABLED=1` in Preview only after those checks, then promoting the flag to Production only through the normal migration-safe release process.

Historical image replay across later turns is intentionally not claimed by this baseline. It needs attachment-aware `AIMessage` loading and bounded server rehydration across every provider adapter; current-turn image analysis is implemented and rejected preflight sends retain the attachment.

No DeepSeek, Qwen, OpenRouter, or Alibaba key should be invented or attached to unrelated DNS/email infrastructure.

## Primary Sources

- [OpenAI GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna)
- [OpenAI GPT-5.6 Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra)
- [OpenAI GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol)
- [OpenAI model and reasoning guidance](https://developers.openai.com/api/docs/guides/latest-model)
- [OpenAI priority processing](https://developers.openai.com/api/docs/guides/priority-processing)
- [xAI Grok 4.5](https://docs.x.ai/developers/grok-4-5)
- [xAI pricing](https://docs.x.ai/developers/pricing)
- [xAI priority processing](https://docs.x.ai/developers/advanced-api-usage/priority-processing)
- [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing/)
- [DeepSeek thinking mode](https://api-docs.deepseek.com/guides/thinking_mode/)
- [DeepSeek tool calls](https://api-docs.deepseek.com/guides/tool_calls/)
- [Alibaba Model Studio pricing](https://help.aliyun.com/en/model-studio/model-pricing)
- [Alibaba thinking mode](https://help.aliyun.com/en/model-studio/deep-thinking)
- [Vercel AI Gateway](https://vercel.com/docs/ai-gateway)
- [Vercel AI Gateway authentication](https://vercel.com/docs/ai-gateway/authentication-and-byok)
- [Vercel AI Gateway models and providers](https://vercel.com/docs/ai-gateway/models-and-providers)
- [Vercel AI Gateway provider options](https://vercel.com/docs/ai-gateway/models-and-providers/provider-options)
- [Vercel AI Gateway pricing](https://vercel.com/docs/ai-gateway/pricing)
- [Vercel OpenAI-compatible REST API](https://vercel.com/docs/ai-gateway/openai-compat/rest-api)
- [OpenRouter Zero Data Retention](https://openrouter.ai/docs/guides/features/zdr)

Provider prices, performance, and availability are not contractual guarantees. Re-run the comparison before provider selection and monitor it continuously after launch.
