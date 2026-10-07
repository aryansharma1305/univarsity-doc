# Stitch migration rules

## What the Stitch export is

The Google Stitch export in [`references/stitch/`](../../references/stitch/) is a **visual and design
reference**. It is **not production source code**.

It consists of six static HTML screens (each with a full-page `screen.png`) and one design-token document
(`academic_trust_matrix/DESIGN.md`). It has no framework, no build, no components, no API calls and no data
layer. Every link is `href="#"`, and every interaction is a local DOM trick (`alert()`, `confirm()`, class
toggles, toasts, `window.print()`).

The folder is kept **byte-for-byte unmodified** (verify with `shasum -a 256 -c references/stitch/SHA256SUMS`).

## Rules

1. **No inline Stitch JavaScript is copied.** It contains fake behaviour, including a manual-lookup form that
   reports "Record Located & Cryptographically Intact" for _any_ input and a "SHA-256" generated with
   `Math.random()`. Every verification outcome shown in the product must come from the API.
2. **No fake Stitch data is copied.** No names, marks, counts, hashes, serials, signatories, file names or
   timestamps.
3. **No Stitch CDN dependencies are copied.** No Tailwind Play CDN, no Google-hosted images, no Material
   Symbols icon font links. Fonts are self-hosted via `next/font`; icons come from a tree-shaken SVG library.
4. **No unsupported claims are copied.** ISO 27001, FERPA/GDPR compliance, blockchain, Arweave, HSM, PKI
   signatures, "ECC-200", "zero-knowledge", "decentralized nodes", "atomic rollback" and similar copy are
   excluded unless implemented **and** formally confirmed by the client
   (see [product decisions](./product-decisions.md#e-unsupported-claims)).
5. **Components are rebuilt** as typed React components with Tailwind (and shadcn/ui primitives) in later
   phases, using the screenshots and markup as a _specification_ of layout, hierarchy and spacing.
6. **No control ships without behaviour.** A button or link either performs a real action or is not
   rendered (or is visibly marked unavailable).
7. **Generated route/IDs are not trusted.** Stitch's `data-path` attributes and duplicated element IDs are
   ignored; routes follow the agreed route map.

## Screen → future route map

| Stitch screen                         | Future route(s)                                   | Notes                                                                            |
| ------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------- |
| `public_verification_portal_home`     | `/`                                               | Keep layout; rewrite copy; remove claims and fake statistics                     |
| `academic_result_verification_detail` | `/results` (form → result view)                   | Basis for all public verification result pages and the result PDF layout         |
| `qr_document_scanner_verifier`        | `/verify/qr`, `/verify/qr/[token]`                | Rebuild all behaviour; the fake success panel must not be reproduced             |
| `admin_registry_dashboard`            | `/admin`                                          | Metrics must come from real aggregates; fix clipped table and missing mobile nav |
| `excel_bulk_import_validation`        | `/admin/imports/[id]`                             | Shared by student and result imports (one import subsystem)                      |
| `certificate_management_preview`      | `/admin/certificates`, `/admin/certificates/[id]` | Preview and PDF must share one layout (`packages/documents`)                     |

About 18 required screens have **no** Stitch design (registration/certificate verification, login,
students, results admin, templates, logs, users, settings, mobile navigation). They will be designed from
the extracted component system rather than generated separately.

## Design system notes carried forward

- `DESIGN.md` contains two inconsistent palettes (YAML values vs prose). Tokens need client sign-off before
  they are implemented in `packages/ui`.
- The Stitch Tailwind config **remaps** the radius scale (`rounded-full` = 12 px, `rounded-xl` = 8 px).
  Class names must not be copied verbatim into a standard Tailwind setup.
- Status colours (success/warning) are missing from the Stitch tokens and must be added.
- Numerals in tables and documents use `tabular-nums lining-nums`.
