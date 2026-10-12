# @docversity/documents

Phase 11B implements **synthetic preview only**: code-versioned A4 templates, fixed invented
fixtures and a validated PDFKit renderer returning PDF bytes. Official issuance is unavailable.

- `renderMarksheetPreview(input, template)` validates both boundaries; it never queries a database,
  fetches assets, writes storage, signs, publishes or calculates academic values.
- `marksheetTemplate('sample-academic', 1)` selects the internal PREVIEW_ONLY registry entry.
- `syntheticMarksheet('semester' | 'year' | 'stress')` returns fresh fictitious examples.
- Input and template schemas live in `@docversity/validation`; unknown fields, URLs, paths,
  excessive rows/text and watermark-suppression options are rejected.
- Noto Sans regular/bold are embedded from bundled, fixed font paths. SIL OFL is included.
- Every page carries `SAMPLE — NOT VALID FOR OFFICIAL USE`, the synthetic footer and page numbers.
- Staff see **the actual generated PDF**, and download those same bytes. There is no separate HTML
  facsimile and no production Chromium/native rendering dependency.
- Only the existing templates.write permission authorizes previews. There is no student download.

The earlier HTML/worker/QR plan was a placeholder, not implemented behavior. The user-authorized
Phase 11B contract now uses vector PDFs for previews; official templates, policy, provenance,
signing and private issuance must be implemented and approved separately in Phase 11C.

See [Phase 11B](../../docs/development/phase-11b-marksheet-infrastructure.md).
