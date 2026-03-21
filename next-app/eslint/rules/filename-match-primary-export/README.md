# litrev/filename-match-primary-export

When a governed UI file has one obvious primary export, LitRev prefers the filename to match it.

This rule stays intentionally lightweight:
- it applies only to the governed UI surface
- it reports only when there is exactly one obvious collected export
- it does not try to infer a broader "best export" from multi-export adapter files

Ignored buckets include:
- framework route files
- tests
- generated files
- obvious utility buckets such as `utils.ts`, `constants.ts`, `index.ts`, and `providers.tsx`

When a real UI file still reports, prefer the smallest cleanup that aligns the file and export before adding a new ignore.
