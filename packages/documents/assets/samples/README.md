# Fixed student training sample

`training-v1.pdf` is the approved Phase 12A `sample-training` template v1 rendered with
`syntheticTrainingCertificate('standard')` using the existing structured HTML/CSS renderer.
It is a single-page synthetic example, not an issued document. No authenticated student data was
supplied. Branding/seal assets retain Phase 12A provenance; signature lines are unsigned.
The QR encodes only `https://example.invalid/docversity/sample-training?token=SYNTHETIC-TRAINING-PREVIEW`;
this fixed synthetic label is not a generated verification token or a functioning verification URL.
Registration/reference and dates are fictional fields in the approved sample, not student promises.

Rendered once for UI-05; shipped as a private package asset, never under the web public directory.
Student requests serve these fixed bytes, with no rendering, MinIO write or issuance record.
SHA-256: `42624f64d67bbc6447b839b5b1136cdd450ca4bb5cb6bd6d54394a3daebd5d40` (716,549 bytes).
The loader pins that hash and a 1 MB bound. Changing this file requires a deliberate new reviewed
sample version, updated integrity pin and PDF/privacy tests. Do not regenerate it during requests.

# Fixed student academic samples (Phase 12C.1)

`academic/*.pdf` are the approved Phase 12C academic templates (v1) rendered once with their
`standard` synthetic records by `scripts/generate-academic-samples.mjs`, using the existing renderer.
Fictitious institution and student, `SAMPLE-` identifiers, SAMPLE banner/watermark/footer on every
page, unsigned signature lines, no QR code, token or link. No authenticated student data was used.

| File                              | Type              | Bytes  | SHA-256                                                            |
| --------------------------------- | ----------------- | ------ | ------------------------------------------------------------------ |
| `sample-course-completion-v1.pdf` | COURSE_COMPLETION | 92,257 | `c124b9c093342685758c02b9586a7c346d5b7616863fc27c4d3ffc1c0532791c` |
| `sample-transcript-v1.pdf`        | TRANSCRIPT        | 77,283 | `b4003704dc2c0ad1cdba26c187913a2e63951e5c71045d09964f53cb7edd3f45` |
| `sample-provisional-v1.pdf`       | PROVISIONAL       | 94,463 | `de846bae590eb474efb298ba417da2b349209b84926dc49bea2eb474846ae314` |
| `sample-character-v1.pdf`         | CHARACTER         | 85,575 | `3a894c5ab72e59befcf9d0d40deb8c0eb77b068eadd056d24bc0268bf0a9cd8a` |
| `sample-migration-v1.pdf`         | MIGRATION         | 86,955 | `e68c94b3db0d55e7dcaa27dc6125005f73b9f8164eef2507861f85127df47490` |

`academicCertificateSample()` (src/academic-certificate-samples.ts) refuses an unknown identifier, a
type mismatch, an oversized or wrong-size file, a missing PDF header or a SHA-256 mismatch, and never
echoes caller input in its error. The documents tests re-render each template and compare a
structural fingerprint (page geometry, drawing operators with their arguments, placed text) with the
shipped file, so a template change cannot silently diverge from what students see. Regenerating
requires review, updated pins here and in code, and passing tests. Never regenerate during requests.
