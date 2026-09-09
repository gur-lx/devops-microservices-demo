# DevOps CI/CD Training: Two-Server Jenkins → Docker Deployment

This repo is a working demo: a `frontend` dashboard plus 3 backend
microservices (`api-gateway`, `user-service`, `product-service`), each in its
own Docker container, wired together with Docker Compose, built and deployed
by Jenkins.

Architecture:

```
 [Local/Cloud dev]        [Server 1: Jenkins]           [Server 2: Deploy]
 git push  ─────────►  webhook triggers pipeline
                        1. checkout code
                        2. docker build (per service)
                        3. docker push -> registry ───►  4. docker compose pull
                                                          5. docker compose up -d
                                                                 │
                                                        frontend :8090  (public)
                                                                 │
                                                     api-gateway :8080 (internal)
                                                        │      │
                                              user-service  product-service
```

The `frontend` container is the only public entry point (port 8090). It serves
the dashboard UI and reverse-proxies `/api/*` requests to `api-gateway` over
the internal Docker network — `api-gateway` itself is not exposed on the host.

---

## 0. Prerequisites

- 2 servers (VMs, cloud instances, or even 2 local VirtualBox boxes to start):
  - **Server A – Jenkins/CI**: runs Jenkins + Docker (to build/push images)
  - **Server B – Deploy/Prod**: runs Docker + Docker Compose (runs the app)
- A Docker registry account (Docker Hub is easiest to start with — free, public repos)
- A Git repo (GitHub/GitLab) for this project, with a webhook Jenkins can reach

If you're just training and don't have 2 real servers yet, you can do all of
this with 2 local VMs (VirtualBox/Multipass) or 2 cheap cloud VMs (e.g. one
$5/mo droplet each). Nothing here is cloud-specific.

---

## 1. Server B first: prepare the deployment target

Open inbound port **8090** on Server B's security group/firewall — that's
the `frontend` container, the only public entry point. Port 22 (SSH) for you
and Jenkins is the only other inbound port needed; `api-gateway` and the
backend services stay internal to the Docker network and don't need a rule.

SSH into Server B and install Docker:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

Create a non-root deploy user (Jenkins will SSH in as this user — never deploy as root):

```bash
sudo adduser deployer
sudo usermod -aG docker deployer
sudo mkdir -p /opt/devops-microservices-demo
sudo chown deployer:deployer /opt/devops-microservices-demo
```

Generate an SSH keypair *for Jenkins to use* (do this on Server A later, then
paste the **public** key here):

```bash
# on Server B, as deployer
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo "<paste jenkins public key here>" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

Copy `.env.example` to `/opt/devops-microservices-demo/.env` and fill in your
registry:

```
REGISTRY=docker.io/yourdockerhubusername
IMAGE_TAG=latest
```

---

## 2. Server A: install Jenkins

Easiest path — run Jenkins itself in Docker, with access to the host's Docker
daemon so it can build/push images:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

docker volume create jenkins_home

docker run -d --name jenkins \
  -p 8081:8080 -p 50000:50000 \
  -v jenkins_home:/var/jenkins_home \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v $(which docker):/usr/bin/docker \
  --restart unless-stopped \
  jenkins/jenkins:lts
```

Visit `http://<server-a-ip>:8081`, unlock with:

```bash
docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword
```

Install suggested plugins, plus these two extra ones (Manage Jenkins → Plugins):

- **SSH Agent** (lets pipeline steps use an SSH credential)
- **Docker Pipeline** (nice-to-have for docker steps)

Generate the SSH key Jenkins will use to reach Server B:

```bash
# inside the jenkins container, or on the host and then copy into jenkins_home
ssh-keygen -t ed25519 -f jenkins_deploy_key -N ""
cat jenkins_deploy_key.pub   # paste into Server B's authorized_keys (step 1)
```

In Jenkins: **Manage Jenkins → Credentials → (global) → Add Credentials**:

1. Kind: **SSH Username with private key**
   - ID: `deploy-server-ssh-key`
   - Username: `deployer`
   - Private key: paste contents of `jenkins_deploy_key`
2. Kind: **Username with password**
   - ID: `dockerhub-credentials`
   - Username/password: your Docker Hub login (use an access token, not your real password)

Also add `deploy-server` as a resolvable host — either use Server B's real IP
directly in the Jenkinsfile's `DEPLOY_HOST`, or add an entry to
`/etc/hosts` / `~/.ssh/config` on Server A.

---

## 3. Create the Jenkins pipeline job

1. New Item → **Pipeline** → name it `devops-microservices-demo`
2. Build Triggers → check **GitHub hook trigger for GITScm polling** (if using GitHub)
3. Pipeline → **Pipeline script from SCM** → Git → paste your repo URL →
   Script Path: `Jenkinsfile`
4. Save

In your Git host (GitHub/GitLab), add a webhook pointing at:

```
http://<server-a-ip>:8081/github-webhook/
```

(For GitLab, use the "Jenkins" integration and `/project/<job-name>`.)

Now: `git push` → webhook fires → Jenkins builds, pushes images, SSHes into
Server B, and runs `docker compose up -d` with the new images.

---

## 4. Try it locally first (before touching servers)

Sanity-check the app itself runs correctly with plain Docker Compose:

```bash
cd devops-microservices-demo
docker compose up --build
open http://localhost:8090   # or just curl it:
curl http://localhost:8090/gateway-health
curl http://localhost:8090/api/users
curl http://localhost:8090/api/products
```

---

## 5. Try the deploy step manually (before wiring Jenkins)

From your dev machine, once images are pushed to your registry once by hand:

```bash
docker build -t docker.io/youruser/api-gateway:latest ./services/api-gateway
docker build -t docker.io/youruser/user-service:latest ./services/user-service
docker build -t docker.io/youruser/product-service:latest ./services/product-service
docker login
docker push docker.io/youruser/api-gateway:latest
docker push docker.io/youruser/user-service:latest
docker push docker.io/youruser/product-service:latest
```

Then on Server B:

```bash
cd /opt/devops-microservices-demo
cp docker-compose.prod.yml docker-compose.yml   # from this repo
./scripts/deploy.sh    # or: docker compose pull && docker compose up -d
```

Once that works by hand, let Jenkins do it automatically via the `Jenkinsfile`.

---

## 6. Where to go next (microservice-architecture growth path)

This demo intentionally keeps each service tiny so the CI/CD wiring is the
focus. Natural next steps, roughly in order of value for a training journey:

1. **Per-service independent pipelines** — split the one Jenkinsfile into one
   per service (each triggers only on changes to its own folder), so services
   deploy independently instead of all-or-nothing.
2. **Add a database per service** (e.g. Postgres for user-service) — teaches
   the "database per microservice" principle and Compose volumes/secrets.
3. **Add environment promotion**: `staging` vs `prod` Compose files/servers,
   image tags gated by a manual Jenkins approval step before prod deploy.
4. **Move from Compose to orchestration**: once comfortable, try Docker Swarm
   (minimal jump from Compose) or Kubernetes (bigger jump, but the industry
   standard) for multi-node deployment and rolling updates.
5. **Add centralized logging/monitoring**: Prometheus + Grafana, or the
   ELK/EFK stack, as a 4th "service" in Compose.
6. **Secrets management**: stop putting credentials in `.env` files on disk;
   move to Jenkins Credentials + Docker secrets or Vault.

Each of these is its own self-contained lesson — don't try to do all of them
at once. Get steps 1–5 above (basic 2-server CI/CD) working end-to-end
first; that's the core DevOps skill this repo is built to teach.
