# Stitch export — visual reference only

`stitch_docversity_ui_ux_design_system/` is an **unmodified** copy of the Google Stitch export for Docversity.

| | |
|---|---|
| Original source | `~/Downloads/stitch_docversity_ui_ux_design_system.zip` (client-supplied export) |
| ZIP SHA-256 | `880ace5df5d00a8ffbcdd66a7f95840abad9c681ff3f6239a1528e432a1f4bd6` |
| Copied | 2026-10-07; verified byte-identical to the ZIP contents with `diff -r` |
| Per-file checksums | [`SHA256SUMS`](./SHA256SUMS) |

Verify the copy has not been edited:

```bash
cd references/stitch && shasum -a 256 -c SHA256SUMS
```

## Rules

- **Do not edit, reformat or "fix" anything in this folder.** It is excluded from Prettier and ESLint on purpose.
- It is **not production source code**. No file here is imported, bundled or served.
- Do not copy its inline JavaScript, its hard-coded people/marks/counts, its CDN `<script>`/`<link>` tags, its Google-hosted images, or its unsupported claims (ISO 27001, FERPA/GDPR, blockchain, Arweave, HSM, PKI, …).

See [`docs/architecture/stitch-migration.md`](../../docs/architecture/stitch-migration.md) for how the screens will be rebuilt.
