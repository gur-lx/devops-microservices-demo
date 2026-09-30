# Load-balanced deploy: 3 web servers behind one domain

A second Jenkins job, separate from the original single-server pipeline
(`../Jenkinsfile`, which is unchanged). On every GitHub push it builds the
images once, then deploys them to three web servers **one after another**.
An nginx load balancer on the Jenkins box, working like an ALB, serves
`https://learning.run.place` from all three.

```
 git push ─> Jenkins job "microservices-lb" (multi-server/Jenkinsfile)
              Sonar ─> quality gate ─> build ─> push :lb-N
              ─> deploy server-1 ─> health ─> server-2 ─> health ─> server-3 ─> health
                         (stops at the first failure)

                                             ┌─> server-1  <private-ip>:8090
 https://learning.run.place ─> nginx LB ─────┼─> server-2  (the Jenkins box):8090
                               (Jenkins box) └─> server-3  <private-ip>:8090
```

| File | What it is |
| --- | --- |
| [Jenkinsfile](Jenkinsfile) | The pipeline. The server list is `deployTargets` at the top. |
| [docker-compose.yml](docker-compose.yml) | What runs on each server. It's the prod stack without nginx-proxy/Let's Encrypt: the frontend is plain HTTP on port 8090 and the LB handles TLS. Project name `microservices-lb`. |
| [nginx/learning.run.place.conf.example](nginx/learning.run.place.conf.example) | Load balancer config for the existing reverse-proxy in `../ci`. |
| [ansible-vars.yml](ansible-vars.yml) | Points `ansible/playbook-deploy-server.yml` at the new servers and directory. |

**How it stays apart from the original job**
- **Deploy directory:** its own on every server (`/opt/microservices-lb`, and `/home/ubuntu/microservices-lb` on server-1).
- **Compose project:** its own (`microservices-lb`), so it doesn't replace or remove the original stack's containers on server-1.
- **Image tags:** `lb-<build>`, with no `:latest` push, so tags never collide with the original job's.
- **Pipeline stages:** no Terraform stage and no BUILD/DESTROY parameters.

**How the load balancer behaves**
- **Sticky by client IP** (`ip_hash`): each server has its own `auth-db`, so a login only works on the server that issued it.
- **Failover:** a server that errors or is mid-deploy is skipped for that request, and after 3 failures it's out of rotation for 30s.
- **Seeing which server answered:** the `X-Upstream` response header, and `/version` returns `"server": "server-N"`.

## Setup

**1. Fill in the servers.** In [Jenkinsfile](Jenkinsfile), set the private
IPs for `server-2` (the Jenkins box) and `server-3`. Any build fails in
seconds while a placeholder is still there. Put the same IPs in
`ansible/inventory.ini` under `[lb_web_servers]` (see
[inventory.example.ini](../ansible/inventory.example.ini)).

**2. Prepare server-2 and server-3** from the Ansible control node:
```bash
cd ansible
ansible-playbook playbook-deploy-server.yml -e @../multi-server/ansible-vars.yml
```
This installs Docker, creates the `deployer` user, and writes
`/opt/microservices-lb/.env`.
- **Secrets:** `AUTH_DB_PASSWORD`, `JWT_SECRET` and `ADMIN_PASSWORD` are generated once into `ansible/files/secrets/` (gitignored) and shared by both servers. An existing `.env` is never overwritten.
- **SSH key:** the playbook authorizes `ansible/files/jenkins_deploy_key.pub`, which must be the public half of the key in Jenkins' `deploy-server-ssh-key` credential. If it isn't, overwrite that file with the right public key first (e.g. from server-1's `~ubuntu/.ssh/authorized_keys`).

**3. Prepare server-1** (set up by hand, user `ubuntu`). Reuse the existing
secrets. This stack gets a new, empty `auth-db` volume, so any password
works there:
```bash
mkdir -p ~/microservices-lb
cp /var/www/html/microservices-devops.app/devops-microservices-demo/.env ~/microservices-lb/.env
```

**4. Open port 8090 to the Jenkins box only.** Add an inbound rule for TCP
8090 to the security groups of server-1 and server-3, with the Jenkins
box's security group (or private IP) as the source. Don't open it to
`0.0.0.0/0`.

**5. Create the Jenkins job.** New Item → Pipeline → `microservices-lb`:
- Build Triggers: **GitHub hook trigger for GITScm polling**.
- Pipeline script from SCM, same repo, Script Path **`multi-server/Jenkinsfile`**.

The existing webhook (`https://jenkins.run.place/github-webhook/`) now
triggers both jobs. Build once, then check each backend from the Jenkins box:
```bash
for ip in <SERVER_1_PRIVATE_IP> <JENKINS_PRIVATE_IP> <SERVER_3_PRIVATE_IP>; do curl -s http://$ip:8090/version; echo; done
```

## Cutting learning.run.place over to the load balancer

Until step 7, DNS still points at server-1 and the original job's stack
serves the site, so the site stays up the whole time.

**6. Enable the LB config with a dummy cert.** nginx won't start without a
cert file, and a failed reload would take jenkins.run.place down too:
```bash
cd ~/ci
DOMAIN=learning.run.place
sudo docker run --rm -v ci_certbot_conf:/etc/letsencrypt alpine sh -c "
  apk add --no-cache openssl >/dev/null &&
  mkdir -p /etc/letsencrypt/live/$DOMAIN &&
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout /etc/letsencrypt/live/$DOMAIN/privkey.pem \
    -out /etc/letsencrypt/live/$DOMAIN/fullchain.pem \
    -subj '/CN=$DOMAIN'
"
cp ../multi-server/nginx/learning.run.place.conf.example reverse-proxy/conf.d/learning.run.place.conf
# edit the three <..._PRIVATE_IP> placeholders, then:
sudo docker compose exec reverse-proxy nginx -t && sudo docker compose exec reverse-proxy nginx -s reload
```

**7. Move DNS, then get the real cert.** Point the `learning.run.place` A
record at the Jenkins box's public IP. Once `dig +short learning.run.place`
shows it:
```bash
sudo docker compose run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
  -d learning.run.place \
  --email gurpiyar656@gmail.com --agree-tos --no-eff-email --force-renewal" certbot
sudo docker compose exec reverse-proxy nginx -s reload
```
The `certbot` container that's already running renews it along with
jenkins.run.place's cert.

**8. Retire the single-server stack on server-1.** Its nginx-proxy can no
longer renew certs for a domain that no longer points at it. Turn off the
GitHub trigger on the original job, then on server-1:
```bash
cd /var/www/html/microservices-devops.app/devops-microservices-demo && docker compose down
```
This keeps the old `auth-db` volume. Add `-v` only if you want to delete it.

**9. Verify.** The same client IP sticks to one server, so compare from
different networks, or stop one server's frontend and watch the header
change:
```bash
curl -sI https://learning.run.place/ | grep -i x-upstream
curl -s https://learning.run.place/version
```

## Things to know

- **Both jobs run on every push** until step 8, so the Jenkins box builds all 14 images twice. It already runs Jenkins and SonarQube with 2GB limits each, and server-2 adds the app stack on top. If builds start getting OOM-killed, move to a bigger instance.
- **Server-1 is doubled up:** until step 8 it runs both stacks.
- **Managed alternative:** an AWS Application Load Balancer + ACM certificate would do the same job, with managed health checks and no single entry box, but it costs money and needs DNS-validated certs. This setup reuses the nginx that's already on the Jenkins box, so that box is the single point of entry.
