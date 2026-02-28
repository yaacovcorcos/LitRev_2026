# Eval Harness Foundation

This directory hosts runnable eval scripts and fixtures for agent-quality gates.

Wave 1 scaffolding currently defines the canonical scenario catalog in:

- `lib/server/evals/scenario-catalog.ts`

Future waves should add:

- executable runners (`run-*.ts`)
- provider/model matrix config
- artifactized reports for CI gating

