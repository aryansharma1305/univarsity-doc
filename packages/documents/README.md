# @docversity/documents

Official document layouts. **Empty in Phase 1 by design** — no layouts are implemented until the
client supplies approved samples, wording, fonts, seals and signatory details.

## Planned structure

```text
src/
├── layouts/
│   ├── result-statement/            public result download / print
│   ├── registration-verification/   registration verification download / print
│   ├── provisional-certificate/
│   ├── transcript/
│   └── character-certificate/
├── shared/                          print CSS, QR block, signatory block, page frame
└── index.ts                         render(layoutKey, data) → HTML string
```

## Rules (from the migration plan)

- A **template** = a code-defined layout (here) + database configuration (wording, signatories, asset
  keys, number pattern). Program-specific variants are configuration, not copy-pasted layouts.
- Admin-authored arbitrary HTML is not supported (injection risk; preview/PDF drift).
- The same HTML is used for preview and PDF. PDF rendering happens only in `apps/worker`.
- QR codes encode only an opaque verification URL — never names, numbers or marks.
- Totals, percentages and GPAs shown on documents are always derived from stored data, never typed.
