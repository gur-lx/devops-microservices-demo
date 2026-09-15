# Monitoring stack: Prometheus + Loki + Grafana

Observability for the deployed app: **Prometheus** scrapes metrics
(container resource usage via cAdvisor, host stats via node-exporter),
**Loki** collects logs (shipped by **Promtail**, which tails every
container's logs via the Docker socket), and **Grafana** is the dashboard
that ties both together — one UI, metrics and logs side by side.

This is deliberately a **separate compose file** from the app
(`docker-compose.prod.yml`) and from Jenkins — it's a different concern with
a different lifecycle, and keeping it separate means you can stop/start/move
it without touching the app.

## Where to run this

**Given what we already learned the hard way**: both existing EC2 boxes
(Jenkins server and deploy server) are t3.micro (≈1GB RAM) and are already
near their limit at idle. This stack adds 6 more containers (Prometheus,
node-exporter, cAdvisor, Loki, Promtail, Grafana) — each individually light
(cAdvisor and Grafana are the heaviest, maybe 100-150MB each), but added on
top of either existing box it risks the same OOM crash-looping we spent an
hour debugging earlier.

**Strongly recommended:** run this on a **third, small EC2 instance**
dedicated to observability (a `t3.micro` is fine just for this stack alone,
since it's not also running Jenkins or the app). This also matches how
monitoring is usually deployed for real — on its own infrastructure, so it
keeps working (and keeps showing you *why* something broke) even if the app
server itself is unhealthy.

If you deploy it on its own box, point `node-exporter`/`cadvisor` there at
*that* box's stats — to actually monitor the **deploy server**, either:
- run this compose file **on the deploy server itself** (accepting the
  resource risk noted above), or
- point Prometheus's scrape targets at the deploy server's IP instead of
  `node-exporter`/`cadvisor` as local service names, opening the relevant
  ports (9100, 8080) on the deploy server's security group so this
  monitoring box can reach them remotely.

The default config here assumes **option 1** (running alongside what it's
monitoring) for simplicity — adjust `prometheus/prometheus.yml` targets if
you go with a remote setup instead.

## Running it

```bash
cd monitoring
docker compose up -d
```

## Accessing it

| Service | Port | What it's for |
|---|---|---|
| Grafana | `3000` | The dashboard UI — login `admin` / `changeme` (**change this immediately** in production) |
| Prometheus | `9090` | Raw metrics UI/API — useful for testing PromQL queries directly |
| cAdvisor | `8081` | Its own basic UI showing per-container stats |
| Loki | `3100` | Internal API only, not meant to be browsed directly — query it through Grafana |

Open Grafana at `http://<this-box-ip>:3000`. Both **Prometheus** and
**Loki** datasources are already provisioned automatically (see
`grafana/provisioning/datasources/datasources.yml`) — no manual setup
needed, they'll already be there under Connections → Data sources.

## Getting dashboards without building your own

Rather than building panels from scratch, import these well-known community
dashboards (Grafana → Dashboards → New → Import → paste the ID):

- **1860** — Node Exporter Full (host CPU/mem/disk/network)
- **14282** — cAdvisor / Docker container metrics
- Explore tab → select the **Loki** datasource → query `{container="devops-microservices-demo-frontend-1"}` (or any container name) to see live logs, filterable by container

## Security group reminder

Open port **3000** (Grafana) inbound on whichever box runs this. Keep
**9090** (Prometheus) and **3100** (Loki) restricted to your own IP or
closed entirely if not needed externally — they have no built-in auth by
default (`auth_enabled: false` in `loki-config.yaml`), unlike Grafana which
requires login.
