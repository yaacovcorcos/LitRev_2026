# AI & Memory Implementation Plan

Based on [MEMORY_LESSONS.md](./MEMORY_LESSONS.md) and the current architecture.

---

## 🎯 Core Principle: Memory ≠ Chat History

**Current State:**
- ✅ AIConversation + AIMessage = Transcript (what was said)
- ❌ No structured memory = AI has no longitudinal intelligence

**Goal:**
- Separate **transcripts** (raw chat) from **memory** (distilled knowledge)
- Enable AI to remember decisions, preferences, and facts across sessions
- Make memory human-readable, editable, and retrievable

---

## 📊 Database Tables Needed

### **✅ Already Exist (Transcripts & Usage)**

```sql
-- Conversation transcripts (raw chat logs)
AIConversation {
  id, context, projectId, studyId,
  createdAt, updatedAt
}

AIMessage {
  id, conversationId, role, content,
  toolCalls, createdAt
}

-- Usage tracking
AIUsage {
  id, projectId, model, inputTokens,
  outputTokens, createdAt
}
```

---

### **🆕 Need to Add: Memory Tables**

#### **1. User Memory** (Preferences & Style)
*Scope: User-level, persists across all projects*

```prisma
model UserMemory {
  id          String   @id @default(cuid())
  userId      String

  // Memory content
  type        String   // "preference", "style", "workflow"
  key         String   // e.g., "citation_style", "writing_tone"
  value       String   // e.g., "APA 7th", "concise_technical"
  rationale   String?  // Why this preference was set

  // Lifecycle
  status      String   @default("active") // "active" | "archived"
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  archivedAt  DateTime?

  // For retrieval
  tags        String[] // ["citation", "formatting"]

  // Relations
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, key])
  @@index([userId, status])
  @@index([userId, type])
}
```

**Examples:**
- `key: "citation_style"`, `value: "APA 7th"`, `type: "preference"`
- `key: "writing_tone"`, `value: "formal_academic"`, `type: "style"`
- `key: "preferred_databases"`, `value: "PubMed,Embase,Cochrane"`, `type: "workflow"`

---

#### **2. Project Memory** (Goals, Criteria, Decisions)
*Scope: Project-level, shared across all conversations in a project*

```prisma
model ProjectMemory {
  id          String   @id @default(cuid())
  projectId   String

  // Memory content
  type        String   // "decision", "definition", "criterion", "goal"
  category    String?  // "inclusion", "exclusion", "outcome", "population"
  statement   String   // The actual memory content
  rationale   String?  // Why this decision was made
  context     String?  // Additional context or notes

  // Lifecycle
  status      String   @default("active") // "active" | "revised" | "archived"
  version     Int      @default(1)
  supersededBy String? // ID of newer version
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  archivedAt  DateTime?

  // For retrieval
  tags        String[] // ["PICO", "population", "inclusion"]
  importance  String   @default("normal") // "critical" | "important" | "normal"

  // Relations
  project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([projectId, status])
  @@index([projectId, type])
  @@index([projectId, importance])
}
```

**Examples:**
- `type: "decision"`, `statement: "Exclude studies with <50 participants"`, `category: "exclusion"`
- `type: "definition"`, `statement: "Primary outcome: diagnostic accuracy (sensitivity/specificity)"`, `category: "outcome"`
- `type: "goal"`, `statement: "Assess AI diagnostic tools in radiology for tumor detection"`

---

#### **3. Study Memory** (Study-level Facts & Summaries)
*Scope: Study-level, attached to specific papers*

```prisma
model StudyMemory {
  id          String   @id @default(cuid())
  studyId     String
  projectId   String

  // Memory content
  type        String   // "summary", "finding", "limitation", "quality"
  category    String?  // "methods", "results", "bias", "population"
  content     String   // The extracted/generated content
  source      String?  // "ai_generated" | "user_input" | "extracted"
  confidence  Float?   // AI confidence score (0-1)

  // Lifecycle
  status      String   @default("active")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  // For retrieval
  tags        String[] // ["high_quality", "rct", "bias_concern"]

  // Relations
  study       Study    @relation(fields: [studyId], references: [id], onDelete: Cascade)
  project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([studyId, type])
  @@index([projectId, type])
  @@index([studyId, status])
}
```

**Examples:**
- `type: "summary"`, `content: "RCT, n=500, AI outperformed radiologists (AUC 0.95 vs 0.88)"`
- `type: "finding"`, `content: "Sensitivity 92%, Specificity 87% for tumor detection"`
- `type: "limitation"`, `content: "Single-center study, potential selection bias"`
- `type: "quality"`, `content: "High quality (GRADE: ⊕⊕⊕⊕), low risk of bias"`

---

#### **4. Conversation Summary** (Long-term Context)
*Scope: Per conversation, replaces old messages to keep context manageable*

```prisma
model ConversationSummary {
  id              String   @id @default(cuid())
  conversationId  String   @unique

  // Summary content
  summary         String   // Compressed summary of conversation
  keyPoints       String[] // Important points extracted
  decisions       String[] // Decisions made during conversation
  followUpNeeded  String[] // Tasks or questions pending

  // Metadata
  messageCount    Int      // Number of messages summarized
  lastSummarizedAt DateTime // When this was last updated
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  // Relations
  conversation    AIConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId])
}
```

**Purpose:**
- After conversations get long (>20 messages), compress old messages
- Keep recent messages + summary for context
- Extract important decisions into ProjectMemory

---

#### **5. Memory Retrieval Log** (Track what AI remembers)
*Optional: For debugging and transparency*

```prisma
model MemoryRetrieval {
  id              String   @id @default(cuid())
  conversationId  String?

  // What was retrieved
  query           String   // What the AI was trying to remember
  memoryType      String   // "user" | "project" | "study"
  memoryIds       String[] // IDs of memories retrieved
  resultCount     Int

  // Context
  userId          String?
  projectId       String?
  createdAt       DateTime @default(now())

  @@index([conversationId])
  @@index([projectId])
}
```

---

## 🏗️ Implementation Phases

### **Phase 1: Memory Infrastructure** (Week 1)
**Priority: HIGH** - Foundation for all AI intelligence

#### Tasks:
1. **Database Schema** (1 day)
   - [ ] Add memory tables to Prisma schema
   - [ ] Create migrations
   - [ ] Test migrations on dev/staging

2. **Memory Service Layer** (2 days)
   - [ ] Create `lib/server/memory/user-memory.ts`
   - [ ] Create `lib/server/memory/project-memory.ts`
   - [ ] Create `lib/server/memory/study-memory.ts`
   - [ ] Implement CRUD operations for each memory type

3. **Memory Retrieval System** (2 days)
   - [ ] Implement keyword-based retrieval (simple)
   - [ ] Add relevance scoring
   - [ ] Create `retrieveRelevantMemories(query, scope)` function
   - [ ] Future: Add semantic search with embeddings

---

### **Phase 2: Memory Integration with AI** (Week 2)
**Priority: HIGH** - Make AI use memory

#### Tasks:
1. **Context Builder Enhancement** (2 days)
   - [ ] Update `buildSystemPrompt` to inject relevant memories
   - [ ] Add memory retrieval before each AI request
   - [ ] Format memories for context injection
   - [ ] Implement smart truncation (keep under token limits)

2. **Memory Extraction** (2 days)
   - [ ] Detect when AI should create memories
   - [ ] Extract decisions from conversations
   - [ ] Store project decisions automatically
   - [ ] Add user confirmation for important memories

3. **Conversation Summarization** (1 day)
   - [ ] Implement auto-summarization after N messages
   - [ ] Extract key points to memory
   - [ ] Prune old messages, keep summary

---

### **Phase 3: PDF Extraction & Study Analysis** (Week 3)
**Priority: HIGH** - Core user value

#### Tasks:
1. **PDF Text Extraction** (1 day)
   - [ ] Implement `extractTextFromPDF(buffer)`
   - [ ] Handle errors (corrupted/protected PDFs)
   - [ ] Extract metadata (title, authors, year)

2. **Study Analysis with Memory** (2 days)
   - [ ] Implement `analyzeStudyAction(studyId)`
   - [ ] Extract key findings → StudyMemory
   - [ ] Generate quality assessment → StudyMemory
   - [ ] Summarize methods/results → StudyMemory

3. **Study Detail Page** (2 days)
   - [ ] Create study detail UI
   - [ ] Display AI-extracted memories
   - [ ] Add "Analyze with AI" button
   - [ ] Show confidence scores

---

### **Phase 4: Draft & Protocol Assistance** (Week 4)
**Priority: HIGH** - Content generation

#### Tasks:
1. **Draft Assistance** (3 days)
   - [ ] Inject relevant StudyMemory into prompts
   - [ ] Generate outlines from project goals
   - [ ] Synthesize evidence from multiple studies
   - [ ] Cite sources with proper formatting

2. **Protocol Generation** (2 days)
   - [ ] Generate PICO from ProjectMemory
   - [ ] Create search strategies
   - [ ] Suggest criteria based on project goals

---

### **Phase 5: Memory UI & Management** (Week 5)
**Priority: MEDIUM** - User control

#### Tasks:
1. **Memory Dashboard** (2 days)
   - [ ] Create `/project/[id]/memory` page
   - [ ] Display all project memories
   - [ ] Add edit/archive/delete controls
   - [ ] Show memory timeline

2. **Memory Inspector** (1 day)
   - [ ] Show what memories AI retrieved
   - [ ] Display memory relevance scores
   - [ ] Add "Why did AI remember this?" explanation

3. **Memory Export** (1 day)
   - [ ] Export memories as JSON/Markdown
   - [ ] Include for reproducibility reports

---

### **Phase 6: Advanced Features** (Week 6+)
**Priority: LOW** - Power users

#### Tasks:
1. **Semantic Search** (2 days)
   - [ ] Generate embeddings for memories
   - [ ] Implement vector similarity search
   - [ ] Hybrid search (keyword + semantic)

2. **Memory Suggestions** (2 days)
   - [ ] AI suggests memories to create
   - [ ] Auto-detect important decisions
   - [ ] Prompt user to confirm/edit

3. **Cross-Project Learning** (3 days)
   - [ ] Share user-level workflows across projects
   - [ ] Suggest patterns from past projects
   - [ ] Privacy controls for memory sharing

---

## 🎨 Memory UI Components

### **1. Memory Badge**
Show in conversations when memory is used:
```
🧠 Using 3 project memories, 1 study summary
```

### **2. Memory Inspector Panel**
```
Retrieved Memories:
✓ "Exclude studies with <50 participants" (project decision)
✓ "Smith et al 2023: High quality RCT, n=500" (study summary)
✓ "Prefer APA citation style" (user preference)
```

### **3. Memory Edit Modal**
```
Edit Project Memory
Type: Decision
Category: Exclusion Criteria
Statement: [editable text]
Rationale: [editable text]
Tags: [inclusion, sample-size, quality]
Status: ⚪ Active  ⚪ Archived
```

---

## 📈 Success Metrics

### **Memory Quality:**
- [ ] AI retrieves relevant memories >80% of the time
- [ ] Users edit <10% of auto-generated memories
- [ ] Zero cross-project memory contamination

### **User Experience:**
- [ ] AI provides consistent answers across sessions
- [ ] Users report "AI understands my project"
- [ ] Memory dashboard is used regularly

### **Performance:**
- [ ] Memory retrieval <100ms
- [ ] Context stays under 80% of token limit
- [ ] No memory leaks or unbounded growth

---

## 🚨 Critical Design Decisions

### **1. When to Create Memories?**
- **Option A**: AI decides automatically (risk: spam)
- **Option B**: User explicitly confirms (friction)
- **Recommendation**: AI suggests, user confirms important ones

### **2. Memory Versioning?**
- **Yes**: Track changes to decisions over time
- **Implementation**: Use `version` + `supersededBy` fields

### **3. Memory Deletion?**
- **Soft delete**: Archive, don't permanently delete
- **Reason**: Maintain audit trail for research reproducibility

### **4. Memory Scope Hierarchy**
```
User Memory (global)
  ↓ inherits
Project Memory (project-specific)
  ↓ inherits
Study Memory (study-specific)
```

---

## 📝 Next Immediate Actions

1. **This Week:**
   - [ ] Review and approve this plan
   - [ ] Add memory tables to Prisma schema
   - [ ] Run migrations
   - [ ] Implement basic memory CRUD

2. **Next Week:**
   - [ ] Build memory retrieval system
   - [ ] Integrate with AI context builder
   - [ ] Test end-to-end with real conversations

3. **Week 3:**
   - [ ] Add PDF extraction
   - [ ] Create study memories automatically
   - [ ] Test with real papers

---

## 🎯 Goal: From Stateless Bot → Intelligent Collaborator

**Before Memory:**
- AI forgets previous decisions
- No consistency across conversations
- User must repeat project goals
- No learning from analyzed studies

**After Memory:**
- AI remembers inclusion criteria
- Consistent recommendations
- Builds on previous work
- Synthesizes across all studies

**Timeline: 6 weeks to full implementation**
**MVP: 2 weeks (basic memory + PDF analysis)**
