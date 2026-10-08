# Knowledge graph (graphify)

`graphify-out/` contains a [graphify](https://github.com/safishamsi/graphify) knowledge graph of the code,
docs and Stitch references: `graph.json` (queryable data), `graph.html` (interactive view) and
`GRAPH_REPORT.md` (summary). It is a **navigation aid only** — source code, migrations, tests and ADRs are
authoritative. It is development/documentation tooling: no build, test or runtime step depends on it, and
`graph.json` / `graph.html` are never edited by hand (they are also excluded from Prettier).

## Regenerating

Requires the `graphify` CLI (`uv tool install graphifyy` or `pip install graphifyy`) and, for the docs and
images, an AI assistant with the graphify skill (or `GEMINI_API_KEY`). From the repository root:

```bash
# Incremental: re-extract only new/changed files (code is parsed structurally, no LLM needed)
/graphify . --update            # in Claude Code with the graphify skill
# or, code-only refresh from a terminal:
graphify update .
```

A full rebuild is `/graphify .`. Commit only `graphify-out/graph.json`, `graph.html` and
`GRAPH_REPORT.md`; caches, the manifest, cost tracking and interpreter paths are git-ignored.

When to regenerate: after a phase lands (new modules, packages or ADRs). The graph committed with a phase
may lag behind small later edits; that is acceptable because it is not authoritative.
