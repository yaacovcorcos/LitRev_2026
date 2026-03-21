#!/usr/bin/env node

import { buildGovernanceAudit } from "../eslint/audit.mjs";

const audit = buildGovernanceAudit();
console.log(JSON.stringify(audit, null, 2));
