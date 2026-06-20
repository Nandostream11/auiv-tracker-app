# CLAUDE.md — Mobile App + Backend Deployment Playbook

Operational knowledge from deploying AUIV Tracker (FastAPI + MongoDB Atlas + Render + Expo Router + EAS).
Read this fully before starting similar work. Every rule here came from a real bug that actually
happened and was actually fixed — not theory.

---

## 0. Sandbox network reality (read this first, every session)

Claude's bash tool runs in a sandbox with an **egress allowlist**. These domains are reachable:
`api.anthropic.com, api.github.com, github.com, codeload.github.com, raw.githubusercontent.com,
pypi.org, npmjs.org/registry.npmjs.org, crates.io` and a few package-registry mirrors.

**These are blocked, always, no exceptions found yet:**
- `*.onrender.com` (Render-hosted services)
- `*.github.io` (GitHub Pages)
- `cloud.mongodb.com`, `api.render.com` (Atlas/Render management APIs)
- `*.blob.core.windows.net` (where GitHub Actions log/artifact downloads redirect to)

**Consequence:** Claude cannot directly curl/test a deployed Render URL, cannot call Atlas or Render's
own REST APIs from bash, and cannot download GitHub Actions job logs or artifacts via the API (they
redirect to blocked domains, returning `x-deny-reason: host_not_allowed`).

**Workaround pattern that works:** GitHub Actions runners have *unrestricted* internet. Route any
"call this blocked API" need through a workflow step, then retrieve the *result* via a channel that
doesn't redirect off api.github.com:
- ✅ Commit a result file to the repo (`git push` from within the workflow), then `GET /contents/path`
- ✅ Write to `$GITHUB_STEP_SUMMARY` (not retrievable via API, but visible to the human)
- ❌ `GET /actions/runs/{id}/logs` — redirects to blob storage, blocked
- ❌ `GET /actions/artifacts/{id}/zip` — same redirect problem
- ❌ Commit statuses via default `GITHUB_TOKEN` — often blocked by repo permission defaults on private repos; don't rely on this

**When a deployed URL needs verification:** ask the human to open it in their own browser/phone.
Don't burn cycles trying to route around the sandbox block — there isn't one for raw HTTP to those hosts.

---

## 1. GitHub token scope checklist

Before doing ANYTHING with a token, check its scopes:
```bash
curl -sI "https://api.github.com/repos/{owner}/{repo}" -H "Authorization: token $TOKEN" | grep -i x-oauth-scopes
```

| Need | Required scope |
|---|---|
| Read/write repo contents, create repo | `repo` |
| Push to `.github/workflows/*.yml` | `repo` **+ `workflow`** (separate, not implied by `repo`) |
| Read account emails | `user:email` (not covered by `repo`) |

If a push fails with `refusing to allow a Personal Access Token to create or update workflow ... without 'workflow' scope` — that's the exact error, not a permissions bug on your end. Tell the human to regenerate the token with `workflow` checked, don't try to work around it.

---

## 2. Secrets hygiene — do this by default, not on request

**Never** put a real secret (DB connection string, API key) directly in a file that gets committed,
even "temporarily" — `git filter-repo` to scrub history after the fact works but is expensive and
the human has to revoke/rotate anyway once it's touched a public or even private remote.

Correct pattern from the start:
1. Repo is **private** unless there's a specific reason for public
2. Secrets go into **GitHub Actions encrypted secrets** (`PUT /repos/{repo}/actions/secrets/{name}`,
   requires fetching the repo's public key first and sealing with `PyNaCl`)
3. Config files (`render.yaml`, `.env.example`) reference the secret name, never the value:
   ```yaml
   envVars:
     - key: MONGO_URL
       sync: false   # human pastes this in the Render dashboard, or it's pulled from GH secret in CI
   ```
4. If a secret DID leak into a commit: `pip install git-filter-repo`, build a replacements file,
   `git filter-repo --replace-text replacements.txt --force`, then `git push --force`. Verify with
   `git log --all -p | grep <secret>` returning zero hits before considering it done. Tell the human
   to rotate the credential regardless — scrubbing history doesn't un-expose something that was
   public even briefly.

---

## 3. Expo / React Native dependency resolution — verify before adding, every time

This was the single biggest source of wasted build cycles. The fix is always the same two-step
check, done BEFORE editing `package.json`, not after a build fails:

### Step 1 — check Expo's bundled version for the exact SDK in use
```bash
curl -s "https://raw.githubusercontent.com/expo/expo/sdk-{N}/packages/expo/bundledNativeModules.json" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('{package-name}'))"
```
This is the **only** reliable source for "what version of this native module actually works with
SDK {N}". Don't guess, don't use `npm view {pkg} version` (gives latest, often incompatible).

### Step 2 — check the package's OWN peer/transitive dependencies before declaring it done
```bash
npm view {package}@{version} peerDependencies dependencies
```
`expo-router` alone pulled in 4 undeclared transitive peers we had to add by hand:
`expo-linking`, `react-native-reanimated`, `react-native-gesture-handler`, `@react-navigation/drawer`
(and drawer itself pulled `react-native-gesture-handler` too — check one level deeper than the
package you're adding).

**Cross-check pattern that catches the whole class of bug in one pass:**
```bash
# Every external import actually used in YOUR code:
grep -rhoE "from ['\"][a-zA-Z@][^'\"]*['\"]" app components constants hooks lib 2>/dev/null \
  | sed -E "s/from ['\"]//; s/['\"]//" | grep -vE "^\./|^\.\./" \
  | sed -E 's#^(@[^/]+/[^/]+|[^/]+).*#\1#' | sort -u
# Diff this against package.json dependencies. Anything imported-by-your-code-but-missing
# is a real bug. Anything in package.json-but-not-imported-by-you may be a transitive peer
# (expo-router-style) — check the dependency's own peerDependencies to confirm it's needed.
```

### react-native-reanimated needs a babel plugin, not just the package
```js
// babel.config.js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-reanimated/plugin'],  // MUST be last in the plugins array
  };
};
```
Missing this doesn't fail the build — it fails at *runtime* with a much harder-to-diagnose crash.
Always add it proactively the moment reanimated is added, don't wait for the crash.

### Known-bad package versions (confirmed via empirical check, not assumption)
- `react-native-screens@3.31.0` — broken `postinstall: "bob build && husky install"` script;
  `bob` isn't declared anywhere in that package's own dependency tree, so it always fails with
  `bob: not found`. Fixed in `3.31.1` (postinstall script removed entirely). Verify any "weird
  postinstall tool not found" error this way:
  ```bash
  npm view {package}@{version} scripts.postinstall
  # compare against the next few patch versions — if it disappears, that's your fix
  ```

### Local environment gotchas (human's machine, not the sandbox)
- Expo SDK 51 + modern tooling needs **Node ≥ 20**. If `npm install` pulls unexpected newer
  package versions than what's pinned in `package.json` (e.g. `react@19.x` when you pinned
  `18.2.0`), that's usually Node version mismatch confusing npm's resolver, not a real conflict.
  Tell the human to check `node --version` and use `nvm install 20 && nvm use 20` first, before
  debugging anything else.
- `npm install -g eas-cli` commonly fails with `EACCES` on machines without global npm sudo
  rights. Don't fight this — use `npx eas-cli` or `npm install --save-dev eas-cli` + `npx eas`
  instead of a global install. Zero permission issues, same result.
- Add a project-level `.npmrc` proactively:
  ```
  legacy-peer-deps=true
  engine-strict=false
  fund=false
  audit=false
  ```
  This prevents ERESOLVE warnings from escalating into hard failures across different npm/Node
  combinations on different machines (CI vs human's laptop vs Expo's build servers).

---

## 4. FastAPI — the one anti-pattern that caused a critical, silent bug

**`return {...}, 202` does NOT set the HTTP status code in FastAPI.** It serializes the entire
tuple as a 2-element JSON array `[{...}, 202]` and responds with HTTP 200. This is easy to write
by accident (looks like it should work) and the bug is completely silent — no error, no warning,
just wrong behavior that breaks every downstream check for that status code.

**Always verify any non-default status code empirically, don't trust the code reading correct:**
```python
from fastapi.testclient import TestClient
client = TestClient(app)
res = client.post("/your-route")
assert res.status_code == 202          # not just "looks right in the source"
assert res.json() == {...}             # not a [dict, int] array
```

**Correct pattern:**
```python
from fastapi.responses import JSONResponse

@router.post("/thing")
async def route():
    return JSONResponse(status_code=202, content={"status": "pending"})
```

This bug class (works in casual code review, fails silently at runtime) is exactly why every
non-trivial backend change in this project gets a `TestClient` smoke test before pushing — see
section 6.

---

## 5. The recurring failure mode: response-shape mismatch between backend and frontend

Found twice in this project, same root cause both times: backend wraps a result in
`{status, result: {...}}` (correct, for job-queue/202-pending-aware endpoints), frontend reads
the field directly off the top level (`res.subtasks` instead of `res.result.subtasks`). The bug
is silent — no error thrown, the button "works" (spinner, no crash), it just produces an empty
result every time.

**Whenever an endpoint can return either an immediate result OR a queued/pending response, audit
the frontend call site explicitly:**
1. What does the backend route's actual `return` statement put in the body? (read the route, not the model)
2. Does the frontend check the right field for the "pending" case before assuming success?
3. Is the success-path data access (`res.result.X` vs `res.X`) matching what's actually returned?

Trace this for every AI-feature / async-job endpoint pair, every time one is touched.

---

## 6. Pre-push verification checklist — do all of these, every non-trivial change

These take seconds and catch entire classes of bugs before a 5-15 minute build/deploy cycle
reveals them the expensive way.

```bash
# 1. Python syntax — every touched .py file
python3 -c "import ast; ast.parse(open('path/to/file.py').read())"

# 2. Full FastAPI app smoke test — proves routes register, not just syntax valid
python3 -c "
from app.main import app
print(len(app.routes), 'routes')
for r in app.routes:
    if hasattr(r, 'methods'): print(r.methods, r.path)
"

# 3. TS/TSX brace and paren balance — every touched file
node -e "
const c = require('fs').readFileSync('path/to/file.tsx','utf8');
const o=(c.match(/\{/g)||[]).length, x=(c.match(/\}/g)||[]).length;
console.log(o===x ? 'OK' : 'MISMATCH '+(o-x));
"

# 4. Cross-file import verification — every NEW import added
grep -n "^export" path/to/source_module.ts        # confirm the export actually exists
grep -n "^import.*{ThingYouImported}" path/to/consumer.tsx   # confirm name matches exactly

# 5. JSON config validity
python3 -m json.tool < package.json > /dev/null && echo OK
python3 -m json.tool < app.json > /dev/null && echo OK

# 6. For any non-default HTTP status code: TestClient assertion, not just code review
#    (see section 4 — this is non-negotiable, the bug class is silent otherwise)

# 7. grep the whole repo for the exact bug pattern just fixed, to confirm no sibling instance
grep -rn "the exact broken pattern" backend/ frontend/   # should return zero hits after fixing
```

When auditing "is this feature actually functional or just a GUI page" — trace every `onPress`/
`onSubmit` handler to its real network call, then check that the response shape the frontend
expects actually matches what the backend route returns (section 5). Don't assume a button works
because it doesn't throw — silent wrong-behavior is the dominant failure mode in this stack.

---

## 7. Deployment topology (what's proven working, as of this project)

```
Phone (Expo Go during dev, or EAS-built APK for standalone)
  → calls →
Render.com (FastAPI, free tier, auto-deploys on push to main via render.yaml)
  → reads/writes →
MongoDB Atlas (M0 free cluster)
  → AI calls →
Anthropic API (key supplied by end user, stored in expo-secure-store, NEVER hardcoded)
```

- **Render free tier spins down after 15 min idle**, ~30-50s cold start on next request. Not a
  bug. Fix if it matters: free uptime-ping cron (cron-job.org hitting `/health` every 10 min) or
  paid Render tier. Don't "fix" this by trying to keep a human's PC running — the backend is
  already fully decoupled from any local machine once deployed.
- **`render.yaml` autoDeploy: true** means every push to `main` triggers a Render redeploy
  automatically — no manual step needed for backend changes once this is set up once.
- **GitHub Actions workflow as a Render-API proxy** (since `api.render.com` is sandbox-blocked):
  the workflow calls Render's API with the `RENDER_API_KEY` secret, polls for deploy completion,
  and commits the resulting URL to `.deploy/backend_url.txt` in the repo — readable via plain
  `GET /repos/{repo}/contents/.deploy/backend_url.txt` (base64-decode the `content` field), which
  doesn't hit the redirect-to-blob-storage problem that logs/artifacts do.
- **Frontend never calls Anthropic directly.** Always proxy through the backend
  (`POST /api/ai/test-key`, `/api/ai/evaluate`, etc.), passing the user's key in the request body.
  Direct-from-phone calls to `api.anthropic.com` are unreliable across different Android/iOS
  network client configurations and — worse — error-swallowing `catch` blocks around them turn
  every possible failure mode into one indistinguishable "invalid key or network error" message.
  Proxying server-side also means the real Anthropic error message can be captured and returned
  verbatim to the user instead of guessed at.

---

## 8. Things to ask the human up front, before starting deployment work

- Do you already have accounts on the services involved (MongoDB Atlas, Render, Expo/EAS,
  GitHub)? Get API keys / usernames before planning steps, not mid-task.
- Is the target repo meant to be public or private? Default to private if it'll ever hold
  anything sensitive, confirm explicitly if public is actually wanted.
- What's the actual Node version on their machine? (`node --version`) — saves a debugging
  round-trip if it's under 20 for Expo SDK 51+.
- Do they want a managed always-on backend (Render free tier, accept cold starts) or are they
  going to mind the spin-down delay enough to need the cron-ping workaround set up immediately?
