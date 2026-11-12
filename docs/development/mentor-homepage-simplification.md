# Mentor homepage simplification

The public homepage retains the existing dark navy and gold hero, university crest, branding,
headline, student sign-in and activation actions. The sections below the hero and the scroll cue
are removed from its rendered tree. Their components remain available in the codebase.
The footer contains copyright, Privacy and Terms.

The visual baseline is the unmodified homepage at main
`0a5d9aa86d034d539389706469d2e50b7ff74725`. The crest, fonts and other branding assets are reused.

## Public navigation

Both desktop navigation and the accessible mobile drawer contain the same five links, in order.

| Label                   | Destination                | Availability                  |
| ----------------------- | -------------------------- | ----------------------------- |
| Verify Admission Letter | `/verify/admission-letter` | New informational placeholder |
| Verify Certificate      | `/verify/certificate`      | Existing unavailable page     |
| Verify Registration     | `/verify/registration`     | Existing unavailable page     |
| Check Result            | `/results`                 | Existing unavailable page     |
| Student Sign in         | `/student/login`           | Existing login                |

The brand links to `/`. The hero activation action links to `/student/register`.
Staff retain direct access at `/admin/login`. The public header has no staff shortcut.
The hamburger opens below the desktop navigation breakpoint to keep the five labels on one line.

Public verification API endpoints for result, registration, certificate and admission letter remain
UNAVAILABLE. The admission-letter page collects no identifier and makes no record lookup.
The existing `/verify` redirect and `/verify/qr` placeholder remain available.
No backend, authentication, payment, academic, database, infrastructure or activation contract changes.

Digital certificates remain free. The existing hard-copy-only Razorpay mapping and collection gates
are untouched. The independent verification panel retains its unit safety coverage even though
the compact homepage now navigates directly to the unavailable routes.

## Responsive and accessibility evidence

Before-and-after screenshots are retained outside Git under
`docversity-homepage-review/screenshots`, with desktop, tablet and mobile viewport and full-page
captures, plus tablet/mobile menu captures.

| Width and viewport height | Original page height | Simplified page height |
| ------------------------- | -------------------- | ---------------------- |
| 1440 × 900                | 5,692 px             | 900 px                 |
| 768 × 1024                | 6,395 px             | 1,024 px               |
| 390 × 844                 | 7,072 px             | 893 px                 |

The hero entrance and crest motion are optional and honor reduced motion. ScrollTrigger sequences
for the removed sections and hero scroll parallax are removed. Navigation uses the existing
Radix Sheet for modal focus containment, Escape dismissal and focus restoration.
Enlarged text, keyboard focus, overflow and unavailable routes are covered by browser tests.

## Verification

All commands exited 0.

| Check                                | Result                                                            |
| ------------------------------------ | ----------------------------------------------------------------- |
| `pnpm format:check`                  | Passed                                                            |
| `pnpm lint` and `pnpm typecheck`     | Passed                                                            |
| `pnpm build --force`                 | Passed. Final web build passed again after the header refinement  |
| `pnpm db:deploy` and `pnpm db:check` | Passed in the new isolated synthetic database                     |
| `pnpm test --force`                  | 1,093 tests passed across 134 files                               |
| Full Playwright browser suite        | 79 passed, 0 failed, 0 skipped                                    |
| Final frontend unit suite            | 138 passed across 27 files after the final header refinement      |
| Final public browser suite           | 13 passed, including the added 200% desktop navigation regression |
| Graphify                             | Regenerated with `graphify update .`                              |

The final navigation uses a container query so enlarged desktop text can use the same accessible
drawer without pushing the fifth link outside the viewport. Public browser coverage includes
1440px, 768px, 390px and 320px, plus enlarged text on desktop and mobile. The complete browser
suite preceded this final responsive refinement. The affected frontend and public browser tests
were then rerun on the final source.

Tests use a separate loopback-only synthetic project with PostgreSQL, Redis and MinIO on tmpfs.
Original Docker volumes, the verified release archive and the Hostinger deployment are outside
this test environment. Screenshots contain only the public homepage.

The latest main CI run `43145175682` passed its application and browser job, then failed the
release archive check with `Exported image config digest differs`. That deployment-script
failure predates this branch. The homepage changes leave the archive verifier intact.

## PR summary and remaining boundaries

The change shortens the existing homepage and replaces header navigation with the mentor's five
destinations. Existing university routes and workflows retain their behavior. The only new page is
an unavailable admission-letter explanation.

Real public verification requires separately authorized provenance, disclosure and security work.
No frontend path activates result publication, certificate issuance or payment collection.
Review this branch and its screenshots before authorizing a merge or deployment.
