# University logo asset

`university-logo.webp` is the official Docversity University logo supplied by the university on
20 November 2026 (Student Portal simplification request) as a JPEG
(`WhatsApp Image 2026-11-20 at 18.57.31.jpeg`, 1600 × 1199). It is branding, not a signature, seal of
issuance, certificate or verification result. It replaces the earlier UI-04 crest
(`university-crest.png`, SHA-256 `a973157df748fdfff0c8b809c8e015e500821d71703e71dc73935fb255a36fbf`)
on the homepage, the auth shell (student sign-in, activation, Staff Login Centre) and the portal
header mark.

Processing (artwork unchanged): the plain white background connected to the image border was made
transparent with an exact colour-to-alpha against white (so the glow keeps its soft edge and white
lettering inside the ribbon is untouched), the canvas was cropped to the artwork plus 8 px
(1008 × 1065), then scaled (Lanczos) to 485 × 512 — about 2× the largest display size — and saved as
WebP (colour quality 90, lossless alpha), ~93 KB. Next.js serves optimized local WebP/AVIF variants; no image
CDN or external host is added.

Source JPEG SHA-256: `5d651d17b5fd491d21fef5765a4d77da491c27e2c508f0a282046d05c8433b7b`.
Repository WebP SHA-256: `cbc3f736bd39c6b609c958059857144978288d7a3050a187a80d775b75db6aad`.
See `docs/development/ui-04-public-verification-homepage-integration.md` for the homepage motion and
the original crest captures.
