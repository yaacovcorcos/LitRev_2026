# AI First Version - Implementation Roadmap

## ✅ Completed (Current Session)

### Phase 1-3: Core Infrastructure ✓
- AI types, config, and provider architecture
- OpenAI provider with **accurate token tracking** (streaming + non-streaming)
- Rate limiting and usage logging to database
- DB-backed conversation memory (AIConversation, AIMessage, AIUsage)
- AI service singleton with chat and streaming support
- Server actions for conversation management
- Streaming API route at `/api/ai/stream`

### Integration ✓
- ProjectCopilot integrated with DB memory + streaming
- `/ai` page with DB-backed conversations
- **Message regeneration** feature on /ai page
- Copilot prompts for different contexts (protocol, draft, ledger, study)

---

## 🎯 Next Steps for First Version

### **PHASE 4: PDF Extraction & Study Analysis** (Priority: HIGH)
*Dependencies installed, implementation needed*

#### 4.1 PDF Text Extraction Service
**Location:** `lib/server/ai/pdf-extractor.ts`

```typescript
// Implement using pdf-parse
- extractTextFromPDF(buffer: Buffer): Promise<string>
- extractMetadata(buffer: Buffer): Promise<PDFMetadata>
- extractSections(text: string): Promise<StudySections>
```

**Tasks:**
- [ ] Create PDF extraction service using `pdf-parse`
- [ ] Add error handling for corrupted/protected PDFs
- [ ] Implement section detection (Abstract, Methods, Results, etc.)
- [ ] Add character limit handling (long PDFs)

#### 4.2 Study Analysis Actions
**Location:** `app/actions/study-ai.ts`

```typescript
// Server actions for study-level AI features
- analyzeStudyAction(studyId: string): Promise<StudyAnalysis>
- extractDataAction(studyId: string, fields: string[]): Promise<ExtractedData>
- summarizeStudyAction(studyId: string): Promise<string>
- assessQualityAction(studyId: string, criteria: string): Promise<QualityAssessment>
```

**Tasks:**
- [ ] Implement `analyzeStudyAction` - full study analysis
- [ ] Implement `extractDataAction` - extract specific fields
- [ ] Implement `summarizeStudyAction` - generate summaries
- [ ] Implement `assessQualityAction` - quality/bias assessment
- [ ] Add caching for expensive operations

#### 4.3 Study Detail Page Enhancement
**Location:** `app/project/[id]/ledger/[studyId]/page.tsx`

**Tasks:**
- [ ] Create study detail page UI
- [ ] Add "Analyze with AI" button
- [ ] Display extracted data in structured format
- [ ] Add quality assessment visualization
- [ ] Integrate with ProjectCopilot for study-specific questions

**Estimated Time:** 2-3 days

---

### **PHASE 5: Draft Assistance** (Priority: HIGH)
*Help users write literature review sections*

#### 5.1 Draft AI Actions
**Location:** `app/actions/draft-ai.ts`

```typescript
// Server actions for draft writing assistance
- generateOutlineAction(projectId: string, section: string): Promise<string>
- improveWritingAction(text: string, instructions: string): Promise<string>
- synthesizeEvidenceAction(studyIds: string[], topic: string): Promise<string>
- generateCitationsAction(text: string, studies: Study[]): Promise<string>
```

**Tasks:**
- [ ] Implement outline generation from studies
- [ ] Add writing improvement suggestions
- [ ] Create evidence synthesis from multiple studies
- [ ] Implement citation generation in proper format
- [ ] Add tone/style controls (academic, concise, detailed)

#### 5.2 Draft Page Integration
**Location:** `app/project/[id]/draft/page.tsx`

**Tasks:**
- [ ] Add "Generate outline" button per section
- [ ] Add "Improve selection" for highlighted text
- [ ] Add "Synthesize evidence" with study selector
- [ ] Show AI suggestions inline with editor
- [ ] Add accept/reject flow for suggestions

**Estimated Time:** 2-3 days

---

### **PHASE 6: Protocol Generation** (Priority: MEDIUM)
*Help users build systematic review protocols*

#### 6.1 Protocol AI Actions
**Location:** `app/actions/protocol-ai.ts`

```typescript
// Server actions for protocol development
- generatePICOAction(topic: string): Promise<PICOComponents>
- suggestSearchStrategyAction(pico: PICO): Promise<SearchStrategy>
- generateInclusionCriteriaAction(pico: PICO): Promise<string[]>
- suggestDataExtractionFieldsAction(researchQuestion: string): Promise<string[]>
- recommendQualityToolsAction(studyTypes: string[]): Promise<QualityTool[]>
```

**Tasks:**
- [ ] Implement PICO generation from research question
- [ ] Create search strategy builder (Boolean + MeSH terms)
- [ ] Generate inclusion/exclusion criteria
- [ ] Suggest data extraction fields
- [ ] Recommend quality assessment tools (GRADE, Newcastle-Ottawa, etc.)

#### 6.2 Protocol Page Integration
**Location:** `app/project/[id]/protocol/page.tsx`

**Tasks:**
- [ ] Add "Generate" buttons for each protocol section
- [ ] Add "Refine" options with AI suggestions
- [ ] Implement PRISMA checklist validation
- [ ] Add export to standard protocol format

**Estimated Time:** 2-3 days

---

### **PHASE 7: Context-Aware Copilot** (Priority: MEDIUM)
*Improve copilot with project-specific context*

#### 7.1 Context Injection System
**Location:** `lib/server/ai/context-builder.ts`

```typescript
// Build context for copilot based on page/section
- buildProtocolContext(projectId: string): Promise<string>
- buildLedgerContext(projectId: string, filters?: Filters): Promise<string>
- buildStudyContext(studyId: string): Promise<string>
- buildDraftContext(projectId: string, section: string): Promise<string>
```

**Tasks:**
- [ ] Inject project metadata into prompts
- [ ] Include relevant studies based on context
- [ ] Add protocol sections to draft context
- [ ] Implement smart context truncation (stay under token limits)
- [ ] Cache context for performance

#### 7.2 Enhanced System Prompts
**Location:** `lib/ai/prompts/copilot-prompts.ts`

**Tasks:**
- [ ] Add project-specific instructions
- [ ] Include study count and status
- [ ] Add protocol constraints to suggestions
- [ ] Implement dynamic prompt templates

**Estimated Time:** 1-2 days

---

### **PHASE 8: Advanced Features** (Priority: LOW)
*Future enhancements for power users*

#### 8.1 Tool Integration (PubMed, Web Search)
**Location:** `lib/server/ai/tools/`

**Tasks:**
- [ ] Implement PubMed search tool (use NCBI E-utilities API)
- [ ] Add web search tool (optional, for grey literature)
- [ ] Update OpenAI provider to support tool calling
- [ ] Add tool execution logging

#### 8.2 Batch Operations
**Location:** `app/actions/batch-ai.ts`

**Tasks:**
- [ ] Batch analyze multiple studies
- [ ] Batch extract data across all studies
- [ ] Batch quality assessment
- [ ] Progress tracking UI for long operations

**Estimated Time:** 3-4 days

---

### **PHASE 9: Polish & UX** (Priority: MEDIUM)
*Make AI features production-ready*

#### 9.1 Conversation Management
**Tasks:**
- [ ] Add edit message feature
- [ ] Add delete specific messages
- [ ] Add conversation export (Markdown, JSON)
- [ ] Add conversation search
- [ ] Implement conversation archiving

#### 9.2 Usage Dashboard
**Location:** `app/project/[id]/ai-usage/page.tsx`

**Tasks:**
- [ ] Display token usage per project
- [ ] Show daily/weekly usage charts
- [ ] Display cost estimates
- [ ] Add usage alerts (approaching limits)
- [ ] Export usage reports

#### 9.3 Error Handling & Retry
**Tasks:**
- [ ] Add retry logic for failed requests
- [ ] Implement exponential backoff
- [ ] Better error messages for users
- [ ] Add request timeout handling
- [ ] Log errors to monitoring service

#### 9.4 Loading States & Feedback
**Tasks:**
- [ ] Add skeleton loaders for AI operations
- [ ] Show progress indicators for long operations
- [ ] Add cancellation support for streaming
- [ ] Implement optimistic updates where appropriate

**Estimated Time:** 2-3 days

---

### **PHASE 10: Testing & Verification** (Priority: HIGH)
*Ensure reliability before launch*

#### 10.1 Integration Tests
**Location:** `tests/integration/ai/`

**Tasks:**
- [ ] Test streaming end-to-end (verify DB writes)
- [ ] Test token counting accuracy
- [ ] Test rate limiting enforcement
- [ ] Test conversation memory persistence
- [ ] Test error scenarios (API down, rate limits, etc.)

#### 10.2 Manual Testing Checklist
**Tasks:**
- [ ] Test /ai page: create conversations, regenerate, delete
- [ ] Test ProjectCopilot on each page (protocol, draft, ledger, study)
- [ ] Test with long conversations (memory management)
- [ ] Test with multiple projects (context isolation)
- [ ] Test rate limiting (intentionally hit limits)
- [ ] Test with poor network conditions
- [ ] Test PDF extraction with various file types

#### 10.3 Performance Testing
**Tasks:**
- [ ] Measure response times for streaming
- [ ] Check memory usage for long conversations
- [ ] Verify database query performance
- [ ] Test with concurrent users

**Estimated Time:** 2-3 days

---

## 📊 Summary: Time Estimates

| Phase | Priority | Estimated Time | Dependencies |
|-------|----------|----------------|--------------|
| Phase 4: PDF & Study Analysis | HIGH | 2-3 days | None |
| Phase 5: Draft Assistance | HIGH | 2-3 days | Phase 4 (optional) |
| Phase 6: Protocol Generation | MEDIUM | 2-3 days | None |
| Phase 7: Context-Aware Copilot | MEDIUM | 1-2 days | None |
| Phase 8: Advanced Features | LOW | 3-4 days | Phase 4 |
| Phase 9: Polish & UX | MEDIUM | 2-3 days | None |
| Phase 10: Testing | HIGH | 2-3 days | All phases |

**Total: ~14-21 days for complete first version**

---

## 🚀 Recommended Implementation Order

### Week 1: Core Features
1. **Phase 4** - PDF extraction + study analysis (critical for value)
2. **Phase 5** - Draft assistance (high user value)

### Week 2: Enhanced Features
3. **Phase 6** - Protocol generation
4. **Phase 7** - Context-aware copilot
5. **Phase 9** - Polish & UX improvements

### Week 3: Testing & Advanced
6. **Phase 10** - Comprehensive testing
7. **Phase 8** - Advanced features (if time permits)

---

## 🎯 Minimum Viable AI (Quick Launch)

If you need to launch faster, prioritize:

1. ✅ **Core infrastructure** (DONE)
2. ✅ **Message regeneration** (DONE)
3. **Phase 4.2** - Basic study analysis (2 days)
4. **Phase 5.1** - Basic draft assistance (2 days)
5. **Phase 9.3** - Error handling (1 day)
6. **Phase 10.2** - Manual testing (1 day)

**MVP Timeline: ~6 days**

---

## 📝 Notes

- All features should log usage to AIUsage table for cost tracking
- System prompts should align with PRISMA/Cochrane guidelines
- Always provide citations/sources for AI-generated content
- Implement undo/redo for AI suggestions in draft editor
- Consider rate limiting per user (not just per project)
- Add analytics to track which AI features are most used
