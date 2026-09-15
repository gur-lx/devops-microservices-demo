# Monitoring stack: Prometheus + Loki + Grafana

Observability for the deployed app, split across two locations:

- **On the deploy server** (`monitoring/docker-compose.yml`): **Prometheus**
  scrapes metrics (container resource usage via cAdvisor, host stats via
  node-exporter), and **Loki** collects logs shipped by **Promtail** (which
  tails every container's logs via the Docker socket).
- **On your local machine** (`monitoring/grafana-local/docker-compose.yml`):
  **Grafana** — just the dashboard UI, querying the server's Prometheus/Loki
  over the network. Grafana itself never touches the server or its Docker
  socket.

This split exists because Grafana is one of the heavier pieces of this
stack, and the deploy server (a t3.micro, ~1GB RAM, already running 14
microservices + nginx-proxy + acme-companion) has no headroom to spare — we
already spent a good while debugging OOM crash-loops on this box. Moving
Grafana off it entirely, onto your own machine, removes that risk and gives
you a snappier dashboard besides.

## 1. Server-side: Prometheus + Loki + Promtail

Run on the deploy server:
```bash
cd monitoring
docker compose up -d
```

Open these ports in the deploy server's security group, **restricted to
your own home/office IP** (not `0.0.0.0/0`) — neither Prometheus nor Loki
has authentication built in:
- `9090` (Prometheus)
- `3100` (Loki)

(`8081`/cAdvisor doesn't need to be open externally — only Prometheus, which
runs on the same box, needs to reach it, over the internal Docker network.)

## 2. Local: Grafana

Run on your own machine:
```bash
cd monitoring/grafana-local
docker compose up -d
```

Open `http://localhost:3000`, log in `admin` / `changeme`, and **change the
password immediately** when prompted — this matters more once the server's
ports are reachable from your home IP.

Both **Prometheus** and **Loki** datasources are already provisioned
automatically, pointed at the deploy server's public IP (see
`grafana-local/provisioning/datasources/datasources.yml`) — no manual "Add
data source" needed. If the deploy server's IP ever changes, update that
file and restart this container.

## Getting dashboards without building your own

Rather than building panels from scratch, import these well-known community
dashboards (Grafana → Dashboards → New → Import → paste the ID):

- **1860** — Node Exporter Full (host CPU/mem/disk/network)
- **14282** — cAdvisor / Docker container metrics
- Explore tab → select the **Loki** datasource → query
  `{container="devops-microservices-demo-frontend-1"}` (or any other
  container name) to see live logs, filterable by container

## Why this works even though Grafana is "remote"

Grafana only needs to reach Prometheus's and Loki's HTTP APIs — it doesn't
need to be on the same host or even the same network as what it's
monitoring. The server's Prometheus does the actual scraping of local
containers (that part stays local to the server, as it must), and Loki
receives log pushes from the local Promtail — Grafana just queries both
over the internet afterward, the same way any client hits a public API.
