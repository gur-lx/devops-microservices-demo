# Security Audit — devops-microservices-demo

_Audit date: 2026-10-23._ This is a training project, so several findings are
acceptable for a demo but **must not** ship to a real environment. Severity is
rated for the "if this were production" case.

| # | Finding | Severity | Location |
|---|---------|----------|----------|
| 1 | Hardcoded demo credentials (plaintext) | High | `services/auth-service/server.js` |
| 2 | Fake, unsigned auth token (no JWT/expiry/validation) | High | `services/auth-service/server.js` |
| 3 | Vulnerable transitive dependency (`braces`/`micromatch` DoS) | High | `services/api-gateway` deps |
| 4 | Infra details committed in `Jenkinsfile` | Medium | `Jenkinsfile` env block |
| 5 | `StrictHostKeyChecking=no` on deploy SSH/SCP | Medium | `Jenkinsfile` deploy stage |
| 6 | No auth / CORS / rate limiting at the gateway | Medium | `services/api-gateway/server.js` |
| 7 | Swagger UI exposes full API surface publicly | Low/Med | `services/api-gateway/server.js` |
| 8 | Frontend renders backend data via `innerHTML` (XSS) | Medium | `services/frontend/app.js` |
| 9 | Dependencies unpinned, no lockfiles | Low | all `package.json` |
| 10 | `.gitignore` does not cover `*.pem` | Low | `.gitignore` |

---

## 1 & 2 — auth-service: hardcoded creds + fake token

```js
const accounts = [
  { username: 'alice', password: 'password1' },
  { username: 'bob',   password: 'password2' },
];
// ...
res.json({ token: `mock-token-${username}-${Date.now()}`, username });
```

- Credentials are plaintext and in source control.
- The "token" is predictable (`username` + timestamp), unsigned, never
  expires, and is never validated by any service.
- Comparison is not constant-time.

**Recommended for production:** store users in a database with per-user salted
hashes (bcrypt/argon2), issue a signed JWT with an expiry using a secret from
an env var / secret manager, and verify that JWT at the gateway.

## 3 — Vulnerable dependency (DoS)

`npm audit` on `services/api-gateway` reports **3 high-severity** advisories:
`braces` → `micromatch` → `http-proxy-middleware`
([GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm),
stack-exhaustion DoS via deeply nested patterns). The project pins
`http-proxy-middleware ^3.0.0`; the latest line is `4.2.0`.

**Recommended:** upgrade `http-proxy-middleware` (test the proxy routes after,
since v4 is a major bump) or run `npm audit fix`, and commit a lockfile so the
resolved tree is reproducible.

## 4 — Infra details committed in Jenkinsfile

The `environment` block hardcodes deploy host IP, deploy path, public domain,
and a personal Let's Encrypt email. Actual *secrets* (Docker Hub login, SSH
key, chat webhook) are correctly pulled from Jenkins credentials — good — but
the infra metadata is still sensitive in a public repo.

**Recommended:** move these to Jenkins job parameters / credentials or a
non-committed config, and scrub the values from history if the repo is public.

## 5 — StrictHostKeyChecking=no

The deploy stage disables SSH host-key verification for both `ssh` and `scp`,
which removes protection against MITM on the deploy connection.

**Recommended:** pre-seed the deploy host key in `known_hosts` (e.g. via
`ssh-keyscan` stored as a Jenkins credential) and verify it.

## 6 & 7 — Gateway has no auth/CORS; Swagger is public

The gateway blindly proxies any `/api/*` path with no authentication,
authorization, CORS policy, or rate limiting, and serves Swagger UI at
`/api-docs` publicly.

**Recommended:** add JWT verification middleware, an explicit CORS allow-list,
and rate limiting; gate `/api-docs` behind auth or disable it in production.

## 8 — Frontend XSS via innerHTML

`app.js` injects backend-provided strings straight into `innerHTML` for the
users/products/orders/inventory tables and the console log, with no escaping.
If any backend returned attacker-controlled HTML (e.g. a user name containing
a `<script>` / `<img onerror>` payload via `POST /api/users`), it would
execute in the dashboard.

**Recommended:** escape dynamic values before insertion (e.g. a small
`escapeHtml()` helper, or build nodes with `textContent` instead of template
strings). A fix for this is applied as part of this review.

## 9 — Unpinned dependencies

All `package.json` files use caret ranges and there are no `package-lock.json`
files, so builds are not reproducible and a compromised upstream patch could
be pulled automatically.

**Recommended:** commit lockfiles and consider pinning exact versions for the
gateway's proxy/swagger deps.

## 10 — .gitignore missing *.pem

The Terraform stage generates `.pem` private keys in the workspace. They are
handled carefully in CI (archived + `rm -f`), but `.gitignore` does not list
`*.pem`, so an accidental local `git add` could commit one.

**Recommended:** add `*.pem` (and `terraform/*.tfstate*`) to `.gitignore`.

---

## What was changed in this review

- Added `*.pem` and Terraform state to `.gitignore` (finding 10).
- Hardened the frontend against XSS by escaping dynamic values (finding 8).

The remaining findings are documented here as follow-ups because they change
runtime auth/deploy behaviour and should be decided by the maintainer.
