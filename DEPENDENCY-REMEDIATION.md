# Dependency remediation candidate — BLOCKED, NOT FOR DEPLOYMENT

Base: `64534b4dd403b33d79e91acc8e01ccbdf7d705df`.
Branch: `security/pnpm-dependencies-20260904`.

This preserves an isolated dependency experiment, not a completed security fix or
production-ready package-manager migration. Do not merge, deploy, or point the
live updater at this branch until the blockers below are resolved and independently
verified. The live checkout was not modified.

## Candidate changes

- Pin pnpm 11.20.0, declare the existing eight-project workspace, generate its
  lockfile with pnpm, and translate manifest scripts and workspace links.
- Preserve the existing dependency overrides and add patched-version overrides
  for browserslist, fast-uri, sanitize-html, and both xmldom version lines.
- Advance desktop Electron and its builder pin from 40.10.2 to 41.10.3.
- Repair the dashboard TypeScript build by assigning the optional React compiler
  filter while preserving its other fields and the existing code regex.
- Keep get-windows optional, as upstream requires for unsupported native targets.
  Making it mandatory allowed a local macOS build, but would change Linux and
  Windows ARM64 installation behavior; that experimental change was reverted.

## Verification on macOS arm64, Node 24.12.0

Commands below were run with pnpm, in this isolated worktree. Raw evidence is kept
outside the repository in the local audit directory; no runtime secrets or raw
application logs are included in this commit.

| Check | Result / local evidence basename |
| --- | --- |
| Dashboard regression before fix: `pnpm --filter web exec tsc -b` | Failed TS18048 on optional `preset.rolldown.filter` |
| `pnpm --filter web run build` after fix | Passed; `resume-web.log` |
| `pnpm --filter web run test` | Passed, 39 files / 291 tests; `resume-web-test.log` |
| `pnpm --filter hermes-tui run build:ink` | Passed; `resume-ink-build.log` |
| TUI test after building Ink | Passed, 161 files / 1742 tests, 3 skipped; `resume-tui-test.log`. Also emitted a Python missing-yaml warning; not a Python-runtime verification. |
| `pnpm --filter hermes-tui run build` | Passed; `resume-tui.log` |
| Desktop build with get-windows temporarily mandatory | Passed; `resume-desktop.log`. NOT a passing build of the final optional-dependency state. |
| Full desktop tests | Bounded rerun timed out at 180 seconds; `resume-desktop-test.log`. No full-suite green claim. |
| Focused desktop pin / managed SSH / remote lifecycle tests | 119 passed, 3 failed; `resume-desktop-focused.log` |
| Final `pnpm install --lockfile-only`, then `pnpm install --frozen-lockfile` | Passed; `resume-lock-refresh.log`, `resume-final-install.log` |
| Final native staging after restoring optional get-windows | FAILED: get-windows omitted, cannot stage darwin-arm64 native payload; `resume-native-stage.log` |
| Final `pnpm audit --json` | Exit 0; no advisories in this pnpm lockfile, all severities zero; `resume-final-audit.json` |
| Dependency tree listing | Passed before restoring optional declaration; `resume-tree.log` |

The previous full desktop run (`desktop-test.log`) completed with 866 files passed,
5 failed, 2 skipped; 9331 tests passed, 5 failed, 6 skipped. Two failures were
5-second git-operation timeouts. The bounded focused rerun reproduced the other
three: npm lockfile Electron mismatch, managed updater status 127, and remote
lifecycle process recognition. The latter two have not been established as caused
by this candidate; do not silently dismiss or patch unrelated runtime behavior.

## Release blockers

1. **Incomplete package-manager migration.** Existing `package-lock.json` is
   deliberately preserved as evidence, not maintained as a compatible second
   lockfile. It still pins Electron 40.10.2; the candidate pins 41.10.3, and its
   `workspace:*` links are not an npm-compatible installation contract.
2. **Runtime/CI still owns npm paths.** Examples include
   `hermes_cli/main_install_repair.py`, `hermes_cli/tools_config_post_setup.py`,
   `hermes_cli/doctor_tools.py`, `.github/workflows/e2e-desktop.yml`, and desktop
   packaging scripts (`test-desktop.mjs`, `run-short-session-hang-repro.mjs`).
   Manifest substitutions alone do not migrate installer, updater, doctor,
   packaging, cache keys, lockfile checks, or their tests.
3. **Native optional installation unresolved.** Restoring upstream optional
   get-windows semantics causes pnpm to omit it again on this Mac. The native
   staging guard correctly fails closed. Do not bypass the guard or permanently
   make this cross-platform optional package required merely to get a green build.
4. **Desktop verification is not green.** See failures and timeout above. No
   packaged-app, installed-artifact, UI, updater, or cross-platform smoke proof.
5. **Audit scope is limited.** Zero findings cover this generated pnpm graph only,
   not the live installation, retained npm lockfile, Python, or the separate
   website dependency tree. Overrides and the Electron major upgrade still need
   compatibility review. Existing per-package override semantics and pnpm
   lifecycle-script behavior also need migration review.

A future migration must choose one canonical lockfile, port command-bearing
runtime/CI/package paths with behavioral tests, resolve platform-native lifecycle
policy, and verify frozen clean installation, tests, packaging, and actual launched
artifacts. That is deliberately outside this bounded preservation task.
