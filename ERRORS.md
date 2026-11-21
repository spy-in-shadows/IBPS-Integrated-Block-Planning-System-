# ERRORS.md — repo error audit

Audit date: 2026-11-21 · Branch audited: `main` @ `89a1add`
Raw check outputs saved outside the repo in the session scratchpad (`01_pip_install.txt` … `19_gitignore_check.txt`).

## Check results at a glance

| Check | Result |
|---|---|
| `pip install -r requirements.txt` (.venv, Python 3.11.15) | ✔ exit 0 |
| `pytest -q` | ✔ 35 passed, **2 warnings** (#8, #9) |
| `python -m compileall backend tools tests` | ✔ exit 0 |
| Import every module under `backend/app` | ✔ 0 failures |
| Import `tools/build_sih_project_report.py` deps | ✘ `ModuleNotFoundError: No module named 'docx'` (#2) |
| ruff / pyflakes / mypy | not installed, skipped |
| `npm ci` (lockfile was newer than node_modules) | ✔ exit 0, **2 high-severity audit findings** (#3) |
| `npx tsc -b --noEmit` | ✔ exit 0 |
| `npx oxlint` | ✔ exit 0, **4 warnings** (#13, #14) |
| `npm run build` | ✔ exit 0, chunk-size warning (#18) |
| Backend smoke test, Procfile style (`uvicorn backend.app.main:app`) | ✔ 11 GETs + 2 POSTs → 200, CORS preflight from :5173 → 200 |
| Backend smoke test, Dockerfile/Render style (`cd backend && uvicorn app.main:app`) | ✔ `/api/health` → 200 |
| `docker build` | not run: Docker daemon not running |
| Vite dev server + `/api` proxy | ✔ `/`, `/dashboard`, `/api/health` via proxy → 200 |
| Frontend calls vs backend routes (27 served routes) | ✔ all 20 frontend paths and methods match |
| Frontend `types.ts` vs Pydantic schemas | 1 mismatch (#15) |

**No blockers found.** Everything installs, builds, tests and runs. The entries below are latent bugs, config that doesn't work as documented, and warnings.

---

## Entries (ordered: install/config first)

### ✅ 1. `.gitignore` silently ignores source directories
- **Status:** ✅ Fixed: Anchored `build/`, `lib/`, `lib64/`, `public/` to repo root in .gitignore.
- **Severity:** bug
- **Where:** `.gitignore:22` (`build/`), `.gitignore:28` (`lib/`), `.gitignore:75` (`public/`)
- **Evidence:** `git check-ignore -v --no-index` →
  `.gitignore:28:lib/  frontend/src/lib/newfile.ts`, `.gitignore:75:public/  frontend/public/new.svg`, `.gitignore:22:build/  tools/build/x.py`.
  `git ls-files -ci --exclude-standard` lists `frontend/public/favicon.svg`, `frontend/public/icons.svg` and `frontend/src/lib/labels.ts` as tracked-but-ignored.
- **Root cause:** Unanchored patterns copied from the Python template match any directory with that name at any depth, including frontend source folders.
- **Proposed fix:** Anchor these to the repo root: `build/`→`/build/`, `lib/`→`/lib/`, `lib64/`→`/lib64/`, `public/`→`/public/`. This keeps ignoring the stray root `public/` folder.
- **Verify:** Re-run the same `git check-ignore` command and expect no matches for the frontend paths. Confirm root `public/` is still ignored and `git status` shows no newly untracked files.

### ✅ 2. `tools/build_sih_project_report.py` cannot run: `python-docx` is not a declared dependency
- **Status:** ✅ Fixed: Added `requirements-tools.txt` (python-docx) and a README note; script verified in a clean venv.
- **Severity:** bug
- **Where:** `tools/build_sih_project_report.py:4-10`, `requirements.txt`
- **Evidence:** `ModuleNotFoundError: No module named 'docx'` in the project venv after a clean `pip install -r requirements.txt`.
- **Root cause:** The report-builder script imports `docx` (package `python-docx`), but nothing in the repo declares it.
- **Proposed fix:** ⚠ *Needs your call.* Either (a) add `python-docx` to `requirements.txt`, which also puts it in the Docker/Railway image, or (b) add a new `requirements-tools.txt` with `python-docx` and mention it in the README. I recommend (b).
- **Verify:** Install, then import the script's modules. Then run `python tools/build_sih_project_report.py` with its output redirected to a scratch copy so `deliverables/` is not overwritten.

### ✅ 3. `npm audit`: 2 high-severity advisories (vite 8.2.2, source-map-js ≤1.2.1)
- **Status:** ✅ Fixed: `npm audit fix` (no --force): vite 8.2.2→8.3.8, source-map-js 1.2.1→1.2.4, rolldown 1.2.6→1.2.19; 0 vulnerabilities; package.json unchanged.
- **Severity:** warning (affects the dev server only, not the static production bundle)
- **Where:** `frontend/package-lock.json`
- **Evidence:** `npm audit` reports `vite 8.2.0 - 8.2.2` (GHSA-9jrq-w75r-8gcw, GHSA-rq7h-c2jc-7f22, GHSA-vfpm-58rq-9qcg, launch-editor advisories) and `source-map-js 1.0.0 - 1.2.1` (GHSA-68fv-2mgg-jv7q). "fix available via `npm audit fix`".
- **Root cause:** The lockfile pins versions with known advisories. Patched versions exist within the same major.
- **Proposed fix:** Run `npm audit fix` (no `--force`). npm rewrites the lockfile with patch or minor bumps only, and no file is edited by hand. This changes the lockfile that Vercel/Render build from, so I'll confirm with you before committing.
- **Verify:** `npm audit` reports 0 vulnerabilities. `git diff package.json` shows no major-version changes. Then `tsc -b`, `oxlint` and `npm run build` all pass.

### ✅ 4. Following the README quick-start points the frontend at a placeholder host
- **Status:** ✅ Fixed: Commented out the placeholder in frontend/.env.example and documented when to set it; a build using the copied example now bundles `/api`.
- **Severity:** bug
- **Where:** `frontend/.env.example:3`, `README.md:160`
- **Evidence:** The README says `cp frontend/.env.example frontend/.env`. A build made with that value bakes `` `https://your-api.onrender.com/api` `` into the bundle (`vB=` and `NB=` in `assets/index-*.js`, scratch build B). That skips the Vite dev proxy, so every API call fails. Without the file, the bundle correctly uses `/api` (scratch build A).
- **Root cause:** The example file sets a live-looking placeholder URL instead of leaving the variable unset. The code's `/api` fallback is what local dev (Vite proxy) and Vercel (rewrite in `vercel.json`) actually need.
- **Proposed fix:** Comment out the `VITE_API_BASE_URL=` line in `frontend/.env.example` and add a note: leave it unset for local dev and Vercel, and set it only for a split-origin host such as the Render static site in `render.yaml`.
- **Verify:** Build with the example's values loaded and confirm the bundle contains `` `/api` `` and no `onrender`. Then run the dev server and check that `/api/health` works through the proxy.

### ✅ 5. Root `.env.example` defines `VITE_API_BASE_URL`, but Vite never reads it
- **Status:** ✅ Fixed: Replaced the unread VITE_API_BASE_URL block in root .env.example with a pointer to frontend/.env.example.
- **Severity:** warning (dead config)
- **Where:** `.env.example:14-16`
- **Evidence:** The root `.env` contains `VITE_API_BASE_URL`, yet the built bundle still uses the `/api` fallback (scratch build A). Vite only loads `.env*` from its project root, `frontend/`, and `vite.config.ts` sets no `envDir`.
- **Root cause:** The frontend variable was put in the backend's env file, where nothing reads it.
- **Proposed fix:** Replace the "Frontend Configuration" block in the root `.env.example` with a one-line comment pointing to `frontend/.env.example`. Your local `.env` won't be touched.
- **Verify:** Diff review, and confirm the `/api` fallback still appears in the build.

### ✅ 6. `API_PREFIX` and `DEBUG` env vars are documented but have no effect
- **Status:** ✅ Fixed: Removed DEBUG from both .env.example files and render.yaml; stopped documenting API_PREFIX as configurable (prefix stays hardcoded `/api`, no code change).
- **Severity:** warning (dead config)
- **Where:** `backend/app/core/config.py:28` (`api_prefix: str = "/api"` is hardcoded) and `:31` (`debug` is set but never read anywhere). Documented in `.env.example:8-9`, `backend/.env.example:6-7` and `render.yaml:13-14`.
- **Evidence:** `grep` finds no `os.getenv("API_PREFIX")`. `server_settings.debug` has zero readers in `backend/`.
- **Root cause:** These settings were documented as configurable, but the code never reads them (`API_PREFIX`) or never uses the value it reads (`DEBUG`).
- **Proposed fix:** Make `api_prefix` read `os.getenv("API_PREFIX", "/api")`, the same pattern as `HOST` and `PORT`. Behaviour is unchanged unless someone sets it. ⚠ For `DEBUG`, *your call*: leave it (harmless) or remove it from the example files and `render.yaml`. Removing it touches deploy config.
- **Verify:** Run pytest. Start the server with `API_PREFIX=/v2` and check `/v2/health` → 200, then without it and check `/api/health` → 200.

### ✅ 7. An empty `VITE_API_BASE_URL` drops the `/api` prefix
- **Status:** ✅ Fixed: `??` → `||` in client.ts and ingestion.ts; a build with an empty VITE_API_BASE_URL now bundles `/api`.
- **Severity:** warning
- **Where:** `frontend/src/api/client.ts:3`, `frontend/src/api/ingestion.ts:4`
- **Evidence:** `import.meta.env.VITE_API_BASE_URL ?? '/api'`. `??` only falls back on `null` or `undefined`. A blank `VITE_API_BASE_URL=` (an easy state to reach after #4) gives `""`, so requests go to `/health`, `/tasks` and so on, which the SPA rewrite answers with `index.html`.
- **Root cause:** Nullish coalescing is used where an empty-string fallback is needed.
- **Proposed fix:** Change `??` to `||` on both lines.
- **Verify:** Build with `VITE_API_BASE_URL=` (empty) and confirm the bundle contains `` `/api` ``. Then `tsc -b` and `npm run build`.

### ✅ 8. Deprecated Starlette constant in the 422 handler
- **Status:** ✅ Fixed: Replaced the deprecated constant with literal `422` in errors.py; pytest warnings 2 → 1.
- **Severity:** warning
- **Where:** `backend/app/core/errors.py:35,38`
- **Evidence:** pytest: `StarletteDeprecationWarning: 'HTTP_422_UNPROCESSABLE_ENTITY' is deprecated. Use 'HTTP_422_UNPROCESSABLE_CONTENT' instead.`
- **Root cause:** Starlette 1.x renamed the constant. `requirements.txt` allows any `fastapi>=0.110`, so older Starlette versions without the new name are also possible.
- **Proposed fix:** Use the literal `422` in both places, which works on every Starlette version. Status codes and response bodies stay the same.
- **Verify:** `pytest -q` shows this warning gone, and `test_api_what_if_invalid_payload` still asserts 422.

### 9. Test client warns that `httpx` with `starlette.testclient` is deprecated
- **Severity:** warning
- **Where:** comes from `fastapi/testclient.py:1`, triggered by `tests/api/test_api_endpoints.py`
- **Evidence:** `StarletteDeprecationWarning: Using 'httpx' with 'starlette.testclient' is deprecated; install 'httpx2' instead.`
- **Root cause:** Installed Starlette 1.6 prefers a different HTTP client package than the `httpx` listed in `requirements.txt`.
- **Proposed fix:** ⚠ *Your call.* Fixing it means swapping a dependency (`httpx` → `httpx2`). I recommend **no change for now**, since the tests work and this is only a deprecation notice.
- **Verify:** N/A unless you approve the swap. Then the warning is gone and 35 tests pass.

### ✅ 10. CLI `--audit` flag is accepted but does nothing
- **Status:** ✅ Fixed: `--audit` now prints `DiagnosticService.get_diagnostics()` as JSON after the run (output 25 → 92 lines).
- **Severity:** bug
- **Where:** `backend/app/cli.py:26` (flag defined); `args.audit` is never read. `README.md:201` documents it.
- **Evidence:** `grep "args\." backend/app/cli.py` finds no matches. The flag's help text says "Print solver diagnostic report", but the output is the same with or without it.
- **Root cause:** The flag was added without being wired to any code.
- **Proposed fix:** ⚠ *Your call:* (a) when `--audit` is set, print the existing `DiagnosticService` report (no new logic, just a call to existing code), or (b) remove the flag and drop `--audit` from the README.
- **Verify:** (a) run with and without `--audit` and diff the output; (b) `--help` no longer lists it and the README matches.

### ✅ 11. Running the CLI rewrites tracked data files
- **Status:** ✅ Fixed: CLI writes data/*.json only if missing or with new `--regenerate` flag; a default run leaves `git status` clean.
- **Severity:** warning
- **Where:** `backend/app/cli.py:35-36` → `backend/app/data/loader.py:24-67`
- **Evidence:** `export_demo_fixture()` and `export_full_dataset()` run every time and overwrite `data/fixtures/demo_fixture.json` (with a new `created_at` timestamp) and `data/generated/full_dataset.json`. Both are tracked, so running the README's "CLI audit benchmark" leaves a dirty working tree. Nothing at runtime reads these files: `StateService` uses the generator directly.
- **Root cause:** The demo command has a side effect of regenerating the committed fixture files.
- **Proposed fix:** ⚠ *Your call (behaviour change):* only export when the files are missing (the loader's `load_*` functions already do this), or leave as-is. I recommend the "only when missing" option.
- **Verify:** Run the CLI and check that `git status` is clean.

### ✅ 12. `apiFetch` drops its default headers when a caller passes headers
- **Status:** ✅ Fixed: Spread `...options` before `headers` in apiFetch so caller headers merge with the JSON default.
- **Severity:** warning (latent: no caller passes headers today)
- **Where:** `frontend/src/api/client.ts:17-20`
- **Evidence:** `{ headers: { 'Content-Type': ..., ...options?.headers }, ...options }`. The later `...options` overwrites the merged `headers` object whenever `options.headers` exists.
- **Root cause:** The spread order is wrong.
- **Proposed fix:** Put `...options` first and `headers: {...}` after it.
- **Verify:** `tsc -b`, `npm run build`, and a smoke test of the dev server through the proxy.

### ✅ 13. oxlint: unused catch binding
- **Status:** ✅ Fixed: `catch (_) {}` → `catch {}`; oxlint warnings 4 → 3.
- **Severity:** warning
- **Where:** `frontend/src/api/client.ts:26`
- **Evidence:** `eslint(no-unused-vars): Catch parameter '_' is caught but never used.`
- **Root cause:** The catch clause binds a variable it never uses.
- **Proposed fix:** `} catch (_) {}` → `} catch {}`, the optional catch binding valid for the ES2023 target.
- **Verify:** `npx oxlint` no longer reports it, and `tsc -b` passes.

### 14. oxlint: `useAsync` hook dependency warnings
- **Severity:** warning
- **Where:** `frontend/src/App.tsx:83-92`
- **Evidence:** `react-hooks(exhaustive-deps): ... dependency list that is not an array literal`, `... contains a call to setState`, and `react(set-state-in-effect)`.
- **Root cause:** `useAsync` is a generic hook that forwards a caller-supplied `deps` array, which static analysis can't check. It behaves correctly at runtime.
- **Proposed fix:** ⚠ *Your call:* (a) leave as-is (my recommendation), (b) add one scoped `// oxlint-disable-next-line` with a justification comment, or (c) refactor the hook, which goes beyond the smallest-change rule.
- **Verify:** (b) `npx oxlint` shows only the intended suppression.

### ✅ 15. Frontend `PlanMetrics.plan_id` is declared required, but the API never sends it
- **Status:** ✅ Fixed: `PlanMetrics.plan_id` made optional; cross-check now finds no required field missing from the backend.
- **Severity:** warning
- **Where:** `frontend/src/api/types.ts:179` vs `backend/app/domain/models.py:117-134`
- **Evidence:** A schema cross-check of `PlanMetrics` reports `frontend expects but backend lacks: ['plan_id', ...]`. The other extra fields are already optional fallbacks. Nothing reads `metrics.plan_id`.
- **Root cause:** The type declares a field the backend model doesn't have.
- **Proposed fix:** `plan_id: string;` → `plan_id?: string;`
- **Verify:** `tsc -b` and `npm run build`, then re-run the cross-check.

### 16. Deploy start commands are inconsistent, and Railway's start command is unverified
- **Severity:** warning
- **Where:** `railway.json:8`, `Procfile:1`, `Dockerfile:23`
- **Evidence:** `railway.json` sets `startCommand: "cd backend && uvicorn ... --port $PORT"`, which overrides the Dockerfile `CMD` that already does the same thing through `sh -c`. Railway may run a Dockerfile-build start command without a shell, in which case `cd` and `$PORT` would not expand. I couldn't verify this because the Docker daemon isn't running, and the live deploy is reportedly healthy. Separately, `Procfile` uses `backend.app.main:app` while every other config uses `cd backend && app.main:app`. The Procfile form only works because of the `sys.path` hack in `backend/app/main.py:17-19`, and none of the configured platforms (Railway uses the Dockerfile, Render uses `startCommand`) reads the Procfile. Both forms returned 200 locally.
- **Root cause:** Three deploy configs each define their own start command.
- **Proposed fix:** ⚠ *Needs your approval (deployment).* Remove `deploy.startCommand` from `railway.json` so the Dockerfile `CMD` is the single source of truth, and either align the Procfile with the other configs or delete it.
- **Verify:** Validate the JSON, and run `docker build` plus `docker run -e PORT=9000` with `/api/health` if Docker is available. Otherwise you'd need to confirm on a Railway deploy.

### 17. README out of sync with the code
- **Severity:** warning (documentation)
- **Where:** `README.md:15,130,204` (says 22 tests; actual 35), `:49,127` (says a 610-task/112-block dataset; `full_dataset.json` and the generator give 200 tasks/72 blocks), `:16,356` (links to `LICENSE`, which doesn't exist), `:120` (`frontend/src/pages/` doesn't exist), `:272` (curl example sends `enable_objective`, which the API ignores; the real field is `objective_profile`), `:150` ("Node.js 20+", but Vite 8 requires `^20.19.0 || >=22.12.0`).
- **Root cause:** The README was rewritten without checking it against the code.
- **Proposed fix:** Correct the verifiable facts: test count, `pages/` line, curl body, Node version. ⚠ *Your call:* whether to add a `LICENSE` file (a legal choice) or remove the badge and link, and whether the "610-task" headline metrics come from a dataset I can't see (live upload?) or should change to match the repo.
- **Verify:** Diff review. Run the corrected curl body against the local server and expect 200.

### 18. Build warning: main JS chunk is 674 kB (> 500 kB)
- **Severity:** warning
- **Where:** `npm run build` output (`dist/assets/index-*.js 674.75 kB`)
- **Root cause:** The whole SPA, including Recharts, ships as one chunk.
- **Proposed fix:** **No change proposed.** Fixing this means code-splitting, which is a refactor outside this task's scope.
- **Verify:** N/A
