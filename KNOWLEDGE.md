# Project Knowledge Base — devops-microservices-demo

A single reference for what this project is, how it's wired, and how to run,
deploy, and extend it. This complements `GUIDE.md` (the step-by-step CI/CD
walkthrough) with a structured map of the whole system.

> **In one line:** the app is deliberately trivial; the real subject is the
> CI/CD pipeline (Jenkins → SonarQube → Docker Hub → Compose deploy →
> Terraform → Prometheus/Loki/Grafana).

---

## 1. Architecture

```
 Dev ──git push──► GitHub ──webhook──► Jenkins (Server A)
                                        │ build · SonarQube gate · push
                                        ▼
                                   Docker Hub registry
                                        │ pull
                                        ▼
                             Deploy Server (Server B)
                             nginx-proxy + acme (SSL)
                                   │            │
                              frontend :80   api-gateway :8080
                                                │
                           ┌────────────────────┴─────────────────────┐
                           ▼  12× backend microservices (internal)     ▼
            user · product · order · cart · inventory · payment ·
            notification · review · auth · shipping · search · analytics
```

The **frontend** container is the only public entry point. It serves the
dashboard UI and reverse-proxies `/api/*` to the **api-gateway** over the
internal Docker network. The gateway in turn proxies each `/api/<x>` path to
the matching backend service. No backend is exposed on the host.

There is **no database** — every backend keeps data in in-memory arrays, so
state resets on container restart. This is intentional to keep the focus on
the pipeline.

---

## 2. Services

All backends are Node.js 20 + Express 4, one `server.js` file each, built from
`node:20-alpine`. Ports come from `process.env.PORT || <default>`.

| Service               | Port | Public path (`/api/...`) | Key routes |
|-----------------------|------|--------------------------|------------|
| api-gateway           | 8080 | —                        | `/health`, `/version`, `/api-docs`, `/api-docs.json`, `/api/health/<svc>`, proxies all `/api/*` |
| user-service          | 3001 | `/api/users`             | `GET /users`, `GET /users/:id`, `POST /users` |
| product-service       | 3002 | `/api/products`          | `GET /products`, `GET /products/:id` |
| order-service         | 3003 | `/api/orders`            | `GET /orders`, `GET /orders/:id`, `POST /orders` |
| cart-service          | 3004 | `/api/cart`              | `GET /cart`, `GET /cart/:id`, `POST /cart` |
| inventory-service     | 3005 | `/api/inventory`         | `GET /inventory`, `GET /inventory/:id` |
| payment-service       | 3006 | `/api/payments`          | `GET /payments`, `GET /payments/:id`, `POST /payments` |
| notification-service  | 3007 | `/api/notifications`     | `GET /notifications`, `POST /notifications` |
| review-service        | 3008 | `/api/reviews`           | `GET /reviews`, `POST /reviews` |
| auth-service          | 3009 | `/api/auth`*             | `POST /login` |
| shipping-service      | 3010 | `/api/shipments`         | `GET /shipments`, `GET /shipments/:id` |
| search-service        | 3011 | `/api/search`            | `GET /search?q=` |
| analytics-service     | 3012 | `/api/stats`             | `GET /stats` |

Every service also exposes `GET /health`, surfaced through the gateway at
`/api/health/<service>` and shown live on the dashboard.

> \*Gateway routing note: the gateway maps `/api/auth` with an empty
> `targetPath`, but auth-service only implements `/login` (not `/` or
> `/auth`). As wired today, calling `/api/auth/...` through the gateway does
> not reach the login handler cleanly. See `SECURITY.md` and the "known
> gaps" below.

### Dependencies

- Backends: `express ^4.19.2` only.
- api-gateway: `express ^4.19.2`, `http-proxy-middleware ^3.0.0`,
  `swagger-ui-express ^5.0.1`.
- Versions use caret ranges and there are no lockfiles — pinning is a
  recommended hardening step.

---

## 3. Frontend (`services/frontend/`)

Plain static HTML/CSS/JS, no framework, served by `nginx:alpine`.

| File         | Role |
|--------------|------|
| `index.html` | The dashboard: architecture diagram, live health grid, API console, data tables, analytics, tech-stack. |
| `docs.html`  | Project documentation page, served at `/docs`. |
| `app.js`     | All dashboard behaviour (health polling, data loading, the animated API console). |
| `style.css`  | Dashboard styling (dark/light theme via `data-theme`). |
| `docs.css`   | Docs-page styling. |
| `nginx.conf` | Reverse-proxies `/api/`, `/gateway-health`, `/version`, `/api-docs`, `/docs` to `api-gateway:8080`; SPA-style fallback to `index.html`. |

**Live refresh behaviour** (bottom of `app.js`): polling timers re-fetch and
re-render on an interval — `pollHealth` and `loadStats` every 8s,
`loadDeployInfo` every 30s. Each re-render reassigns `innerHTML`, which can
cause a brief visual flash. See "Known gaps" and `SECURITY.md`.

There is currently **no login page / auth UI** in the frontend.

---

## 4. Running locally

```bash
docker compose up --build
# dashboard:
open http://localhost:8090
# direct checks:
curl http://localhost:8090/gateway-health
curl http://localhost:8090/api/users
curl http://localhost:8090/api/products
```

`docker-compose.yml` builds every service from source and exposes only the
frontend on `8090:80`; everything else stays internal on the `app-net`
network.

---

## 5. Deployment & CI/CD

- **`Jenkinsfile`** — declarative pipeline:
  Checkout → SonarQube Analysis → Quality Gate → build 14 images →
  push to Docker Hub → SSH deploy to Server B (`docker compose pull && up -d`)
  → manage demo EC2 via Terraform → Google Chat notification.
- **`Jenkinsfile.ansible`** — Ansible-driven variant of the pipeline.
- **`docker-compose.prod.yml`** — production topology: `nginx-proxy` +
  `acme-companion` (Let's Encrypt TLS) in front, services pulled as
  `${REGISTRY}/<svc>:${IMAGE_TAG}`.
- **`ansible/`** — playbooks to install Docker, set up Jenkins, and create the
  deploy user (`playbook-deploy-server.yml`, `playbook-jenkins.yml`,
  `playbook-deploy-app.yml`, `site.yml`).
- **`terraform/`** — provisions/destroys a demo AWS EC2 instance (referenced
  by the Jenkinsfile; generated artifacts are gitignored).
- **`scripts/deploy.sh`** — manual deploy helper (`docker compose pull && up -d`).

### Environment variables (`.env` on the deploy server)

| Var | Purpose |
|-----|---------|
| `REGISTRY` | Docker registry/namespace, e.g. `docker.io/youruser` |
| `IMAGE_TAG` | Image tag to deploy (defaults to `latest`) |
| `DOMAIN` | Public domain for nginx-proxy / Let's Encrypt |
| `LETSENCRYPT_EMAIL` | ACME registration email |

See `.env.example`.

---

## 6. Monitoring (`monitoring/`)

- `prometheus/prometheus.yml` — scrape config.
- `loki/loki-config.yaml` — log store.
- `promtail/promtail-config.yaml` — log shipping.
- `grafana-local/` — Grafana provisioning (datasources + dashboards); Grafana
  runs off-server as a viewer to keep the deploy box light.

---

## 7. Known gaps / things to watch

1. **No login UI** despite an `auth-service` existing. The service also uses
   hardcoded demo credentials and a fake token — fine for training, not for
   real auth. (Details in `SECURITY.md`.)
2. **Gateway `/api/auth` routing** doesn't line up with auth-service's
   `/login` route.
3. **Frontend renders backend data with `innerHTML`** and no escaping — an
   XSS vector if a backend ever returns attacker-controlled strings.
4. **Dependencies are unpinned** and there are no lockfiles.
5. **Infra details are committed** in the `Jenkinsfile` environment block.

---

## 8. File map (top level)

```
.env.example              docker-compose.yml        services/
.gitignore                docker-compose.prod.yml   scripts/
GUIDE.md                  Jenkinsfile               ansible/
KNOWLEDGE.md (this file)  Jenkinsfile.ansible       ci/
SECURITY.md               monitoring/               docs/
                                                    terraform/ (gitignored artifacts)
```

_Maintained alongside the code. When you add a service or change the
pipeline, update this file and the diagram in `index.html`._
