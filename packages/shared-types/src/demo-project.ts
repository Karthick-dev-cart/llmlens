// Fixed, stable identifiers for the public demo org/project (Week 9 —
// "no-login public demo with always-fresh seeded data"). Hardcoded rather
// than looked up by slug or read from an env var: this ID never changes
// across environments, there's exactly one demo project, and every
// consumer (the one-time row-seed script, the recurring refresh job, and
// the public /v1/demo/* routes) needs the same constant — a fixed UUID is
// simpler than a lookup and removes any chance of drift between them.
export const DEMO_ORG_ID = "00000000-0000-0000-0000-00000000de30";
export const DEMO_PROJECT_ID = "00000000-0000-0000-0000-00000000de90";
