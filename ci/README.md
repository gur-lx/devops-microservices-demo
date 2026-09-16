# CI stack: Jenkins + SonarQube (Server A)

Consolidates what were previously three separate `docker run` commands into
one compose file, with memory limits on each container so a runaway one
gets contained (OOM-killed and restarted on its own) instead of taking the
whole host down.

## Before running this

Confirm the docker group's GID matches what's in the file (currently `109`
under `jenkins.group_add`):
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

Server A has ~908Mi of real RAM. Jenkins + SonarQube (which itself runs
three JVMs: web, compute engine, and an embedded Elasticsearch) + Postgres
genuinely want more than that. `mem_limit`/`memswap_limit` here don't
create more RAM -- they cap each container so if one tries to exceed its
budget, only *that* container gets killed and auto-restarts (`restart:
unless-stopped`), rather than the kernel's OOM-killer picking an arbitrary
victim process on the whole host -- which is what happened before, killing
Jenkins' own JVM mid-build.

This makes failures predictable and recoverable. It does not make the box
capable of comfortably running all three at once — if this stack is still
struggling, the actual fix is a bigger instance (t3.small/t3.medium), not
tighter limits.

## Checking it's stable

```bash
sudo docker stats --no-stream
free -h
```
