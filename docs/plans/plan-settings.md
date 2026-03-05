# Settings Plan

## Purpose
Define user-configurable settings in one canonical place so behavior defaults are stable now and adjustable later.

## Current Architecture
- There is no dedicated settings plan file; settings-related work is scattered across feature plans.
- Conversation entry behavior is currently not managed through a user-facing settings model.

## Active Tasks
- [ ] `SET-001` Add user-configurable conversation restore timeout in Settings:
  - Setting purpose: control how long the last conversation remains restorable after leaving a project.
  - Default value: `15 minutes`.
  - Initial allowed values: `5`, `10`, `15`, `20` minutes (expandable later).
  - When timeout expires, returning in conversation mode should open a new conversation.
  - Scope target: user-level default first; per-project override can be considered later.

## Recently Completed
- [x] Settings plan initialized and linked from `docs/plans/README.md`.
