# Technical Debt

Source of truth for temporary dependency pins, workarounds, and technical debt items.

## Active Backlog

- **Interactive CLI for logwatch sync:** Current sync is MCP-only; add full interactive CLI with prompts, date correction, and progress display
- **Enhanced disambiguation UX:** Add poster images and taglines (requires additional API calls)


## Dependency Pins

- _No active dependency pins._

## Future Considerations

### Node.js Version Support
**Current**: Node.js 20.x or later (expressed in `engines` to match Vitest 4 requirements)  
**Consideration**: Keep CI/dev environments on Node.js 20+ so Vitest and Rollup engine checks pass cleanly.

### Dependency Update Strategy
To prevent future dependency pin accumulation:
1. Schedule quarterly dependency audits
2. Test major version updates in feature branches
3. Document breaking changes proactively
4. Use `npm outdated` to track available updates
5. Prioritize security updates over feature updates

---

## Resolved Items

- **Logging UX & Disambiguation (2025-12-16):** Implemented enhanced disambiguation with top 3 matches, preview mode, duplicate detection, and undo support.
- **Bulk Logging & Undo (2025-12-16):** Added bulk operation summary tables, idempotent duplicate checks, and undo/remove support via Trakt history API.
- **Offline Logwatch Core (2025-12-16):** Added parse-on-sync with NL parser, enhanced queue status tracking, and sync tool with dry-run mode.
- **Test Coverage (2025-12-16):** Added 100+ unit and integration tests for NL parser, duplicate detector, queue operations, and sync workflow.
- **Node.js 20 enforcement (2025-12-11):** Added `.nvmrc` (20.19.6), `.npmrc` `engine-strict`, and `scripts/check-node-version.js` wired to `preinstall`; updated README and `docs/DEBUGGING.md` with upgrade steps for brew/nvm.
- **Security audit refresh (2025-12-11):** Ran `npm audit` on Node 20.19.6 (0 vulnerabilities); updated `docs/policies/SECURITY_INVESTIGATION.md` to reflect patched `@modelcontextprotocol/sdk@1.24.x` → `body-parser@2.2.1`.
- **Cache metrics memory tracking (2025-12-11):** Added byte-level tracking, estimation timing, and memory-based eviction/warnings in `src/lib/cache.ts` with coverage in `src/lib/__tests__/cache.test.ts`.
- **Documentation archive cleanup (2025-12-11):** Historical reports consolidated under `docs/archive/`, with `docs/testing/` limited to active guides and an updated `docs/README.md` index.
- **File organization cleanup (2025-12-11):** Manual `.mjs` test scripts moved under `tests/manual/`, artifacts redirected to `tests/results/`, and ignore rules added to `.gitignore`.
- **Body-parser advisory addressed (2025-12-11):** Upgraded to `@modelcontextprotocol/sdk@1.24.x` (transitively `express@5.2.1` / `body-parser@2.2.1`), resolving the previously noted DoS advisory; audit notes remain to be refreshed.
- **Log directory hardening (2025-11-21):** Moved default logs to `~/.trakt-mcp/logs`, enforced `700/600` permissions, and added retention/cleanup logic in `src/lib/logger.ts`.
- **Console.log usage standardization (2025-12-11):** Production code now relies on the shared logger with `no-console` enforced for `src/**/*.ts` (exceptions only for the logger wrapper, tests, and the CLI test runner) to prevent stray debug output.
- **Vitest/@vitest/ui upgrade (2025-12-11):** Bumped `vitest`, `@vitest/ui`, and `@vitest/coverage-v8` to `^4.0.15`; configuration remains the same, but the suite now requires Node 20+ (current environment is Node 16, so tests need rerun after upgrading Node).
- **ora upgrade to 9.0.0 (2025-12-12):** Upgraded from `^8.2.0` to `^9.0.0`; verified CLI spinner behavior in `scripts/bulk-import.ts` works correctly with Node.js 20.x. All spinner methods (start, succeed, fail, text updates) function as expected.
- **Repo structure cleanup (2025-12-12):** Moved audit/security artifacts to `docs/policies/`, created `src/bin/` for entrypoints, and mapped package `bin` to built outputs.
- **Source layering (2025-12-12):** Split code into `src/server`, `src/domain/trakt`, `src/cli`, `src/core`, and `src/shared`; updated imports and entry bootstrap.
- **Tests reorg (2025-12-12):** Consolidated tests under `tests/unit` and `tests/integration`; updated `vitest.config.ts`.
- **Docs consolidation (2025-12-12):** Added `docs/README.md` index; grouped docs into guides, operations, architecture (with ADRs), testing, policies, and archive.
- **Scripts cleanup (2025-12-12):** Grouped scripts into `scripts/dev`, `scripts/data`, `scripts/ops`, and `scripts/tools`; updated `package.json` paths and scripts README.
- **Packaging/release polish (2025-12-12):** Added `files[]` allowlist for publish set; expanded CI Prettier coverage to `tests/**` and `scripts/**`.
- **README polish (2025-12-12):** Updated links and layout overview to match new structure; refreshed references to docs and scripts.
- **E2E enablement (2025-12-13):** Added opt-in Trakt E2E suite (`tests/e2e`), auth seeding helper (`npm run auth:trakt`), and docs/testing guidance for running live API checks with a dedicated test account.
- **E2E workflow (2025-12-14):** Added manual `E2E Trakt (Manual)` GitHub Action (`.github/workflows/e2e.yml`) that runs `npm run test:e2e` on Node 20 with Trakt secrets/token supplied via repo secrets; gated to workflow_dispatch only.

---

**Last Updated**: 2025-12-16
