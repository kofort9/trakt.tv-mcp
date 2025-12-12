# Technical Debt

Source of truth for temporary dependency pins, workarounds, and technical debt items. The historical copy at `docs/TECHNICAL_DEBT.md` now defers to this document.

## Active Backlog

- _No new items added for this cycle._

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

- **Node.js 20 enforcement (2025-12-11):** Added `.nvmrc` (20.19.6), `.npmrc` `engine-strict`, and `scripts/check-node-version.js` wired to `preinstall`; updated README and `docs/DEBUGGING.md` with upgrade steps for brew/nvm.
- **Security audit refresh (2025-12-11):** Ran `npm audit` on Node 20.19.6 (0 vulnerabilities); updated `SECURITY_INVESTIGATION.md` to reflect patched `@modelcontextprotocol/sdk@1.24.x` → `body-parser@2.2.1`.
- **Cache metrics memory tracking (2025-12-11):** Added byte-level tracking, estimation timing, and memory-based eviction/warnings in `src/lib/cache.ts` with coverage in `src/lib/__tests__/cache.test.ts`.
- **Documentation archive cleanup (2025-12-11):** Historical reports consolidated under `docs/archive/`, with `docs/testing/` limited to active guides and an updated `docs/README.md` index.
- **File organization cleanup (2025-12-11):** Manual `.mjs` test scripts moved under `tests/manual/`, artifacts redirected to `tests/results/`, and ignore rules added to `.gitignore`.
- **Body-parser advisory addressed (2025-12-11):** Upgraded to `@modelcontextprotocol/sdk@1.24.x` (transitively `express@5.2.1` / `body-parser@2.2.1`), resolving the previously noted DoS advisory; audit notes remain to be refreshed.
- **Log directory hardening (2025-11-21):** Moved default logs to `~/.trakt-mcp/logs`, enforced `700/600` permissions, and added retention/cleanup logic in `src/lib/logger.ts`.
- **Console.log usage standardization (2025-12-11):** Production code now relies on the shared logger with `no-console` enforced for `src/**/*.ts` (exceptions only for the logger wrapper, tests, and the CLI test runner) to prevent stray debug output.
- **Vitest/@vitest/ui upgrade (2025-12-11):** Bumped `vitest`, `@vitest/ui`, and `@vitest/coverage-v8` to `^4.0.15`; configuration remains the same, but the suite now requires Node 20+ (current environment is Node 16, so tests need rerun after upgrading Node).
- **ora upgrade to 9.0.0 (2025-12-12):** Upgraded from `^8.2.0` to `^9.0.0`; verified CLI spinner behavior in `scripts/bulk-import.ts` works correctly with Node.js 20.x. All spinner methods (start, succeed, fail, text updates) function as expected.

---

**Last Updated**: 2025-12-12
