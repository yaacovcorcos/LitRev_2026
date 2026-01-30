# Database Architecture (Living Document)

This file explains the current database structure in simple terms and should be updated whenever the schema or DB strategy changes.

## Why this exists
- Keep a clear, shared description of how data is stored.
- Make single‑user now + multi‑user later decisions explicit.
- Provide a simple reference for new contributors or agents.

## Core principles
- **PostgreSQL** is the single source of truth.
- **Structured data** goes in relational tables.
- **Flexible content** (Protocol, Draft) lives in **JSON** fields.
- **Single‑user now, multi‑user ready**: every row is scoped by `ownerId` and `workspaceId`.

## Entities (simple explanation)

### User
Represents a person (real auth later). In single‑user mode we use a placeholder user.

### Workspace
Represents a container/team. In single‑user mode we use a placeholder workspace.

### WorkspaceMember
Links users to workspaces (role based). Required for multi‑user later.

### Project
The main unit of work (a literature review). Projects belong to a workspace and an owner.

Key fields:
- `name`, `description`
- `status`, `statusText`
- `papers`, `progress`
- `created`, `modified`

### Protocol
One protocol per project. Stored as **JSON** so the structure can evolve without migrations.

### Draft
One draft per project. Stored as **JSON** (full DraftState).

### Study (Ledger)
List of evidence items per project. Structured fields for filtering and reporting.

Key fields:
- `title`, `authors`, `year`
- `status`, `quality`
- `details` (optional JSON for extra metadata)

### FileAsset (Files & Exports)
Metadata for files stored in object storage (PDFs, exports, attachments).

Key fields:
- `projectId`, optional `studyId`
- `kind` (source/export/attachment), `format` (docx/pdf/etc)
- `filename`, `mimeType`, `size`
- `storagePath`, `publicUrl`
- `version` (for keeping export history)

## Single‑user now, multi‑user later
- We create a placeholder `User` and `Workspace` (e.g., `local-user`, `local-workspace`).
- All queries are scoped by `{ ownerId, workspaceId }`.
- When real auth is added, we replace the placeholder with real IDs—no schema rewrite.

## Draft storage decision
- Store the **entire DraftState JSON** as the source of truth.
- Keep **debounced saves**.
- Use **last‑write‑wins** for now; add versioning later.
- Keep localStorage as a **fallback cache**.
- Migrate existing local drafts to the DB.
- If we later normalize into tables, treat JSON as primary and backfill tables from it.
- Planned evolution: move toward **per‑section tables** (or a hybrid JSON + tables) for advanced research/analytics once requirements are defined.

## Copilot persistence decision (Phase 8)
- **Option A now**: keep copilot state inside JSON (DraftState + ProjectCopilot state) as the source of truth.
- **Planned evolution**: switch to **Option B (CopilotMessages table)** later for analytics/search, even if it’s more complex.
- Keep **both** copilot channels: project‑level copilot and per‑section draft copilot.
- Retention: **unlimited** for now.
- Migration: **yes**, but only after the DB is stable.

## Files & exports decision (Phase 9)
- Use **object storage** (Supabase Storage or similar) for files; DB stores metadata + URLs.
- **Keep file versions** (don’t overwrite exports).
- **Server‑side generation** for exports.
- Start with **DOCS/DOCX**; document that other formats (PDF/HTML) will be added later.
- **Public URLs for now**; add access controls later.
- No migration needed for existing files.

## Runtime vs Migration URLs
- **DATABASE_URL** → pooled connection (runtime)
- **DIRECT_URL** → direct connection (migrations)

## When to update this file
Update this file whenever:
- A table/model is added/removed/renamed.
- A field changes meaning.
- A new storage strategy is chosen (JSON vs relational).
- The auth/ownership model changes.
