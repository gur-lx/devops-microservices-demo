# CI stack: Jenkins + SonarQube (Server A)

Consolidates what were previously three separate `docker run` commands into
one compose file, with memory limits on each container so a runaway one
gets contained (OOM-killed and restarted on its own) instead of taking the
whole host down.

## Before running this

**1. Make sure you have 4GB of swap, not 2GB.** This file's limits assume
1GB RAM + 4GB swap. If you only added one 2GB swapfile earlier, add a
second:
```bash
sudo fallocate -l 2G /swapfile2
sudo chmod 600 /swapfile2
sudo mkswap /swapfile2
sudo swapon /swapfile2
echo '/swapfile2 swap swap defaults 0 0' | sudo tee -a /etc/fstab
free -h   # should show Swap: 4.0Gi
```

**2. Confirm the docker group's GID matches what's in the file** (currently
`109` under `jenkins.group_add`):
```bash
getent group docker
```
Update the compose file if it differs on your box.

## Bringing it up

Stop and remove the old ad-hoc containers first (keep the volumes --
they're reused, not recreated):
```bash
sudo docker rm -f jenkins sonarqube sonar-db 2>/dev/null
```

Then:
```bash
cd ci
sudo docker compose up -d
```

Jenkins jobs/credentials and SonarQube's database both survive this, since
they live in the pre-existing named volumes (`jenkins_home`,
`sonar_db_data`, `sonarqube_data`, etc.), which this file reuses via
`external: true` rather than recreating.

## What the memory limits actually do (and don't)

Server A has ~908Mi of real RAM, now paired with 4GB of swap (5GB total
addressable). Jenkins + SonarQube (which itself runs three JVMs: web,
compute engine, and an embedded Elasticsearch) + Postgres genuinely lean on
all of that. Each service's `memswap_limit` (its combined RAM+swap
ceiling) is sized so the three sum to ~3.8GB, deliberately leaving ~1.2GB
of slack for the OS, sshd, and dockerd itself — so a runaway container
gets stopped by its own limit before it can starve the host.

`mem_limit`/`memswap_limit` don't create more RAM — they cap each
container so if one tries to exceed its budget, only *that* container gets
killed and auto-restarts (`restart: unless-stopped`), rather than the
kernel's OOM-killer picking an arbitrary victim process on the whole host
— which is what happened before, killing Jenkins' own JVM mid-build.

This makes failures predictable and recoverable, and swap gives real
headroom instead of the box crashing outright. It does not make the box
*fast* — expect noticeable slowness whenever a container leans on swap,
since it's disk-backed. If this stack is still struggling even with 4GB of
swap, the actual fix is a bigger instance (t3.small/t3.medium), not more
swap or tighter limits.

## Checking it's stable

```bash
sudo docker stats --no-stream
free -h
```
