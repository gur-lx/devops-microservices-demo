# jenkins.run.place: one domain, two backends

Routes a single domain to both services by path:
- `https://jenkins.run.place/` &rarr; Jenkins
- `https://jenkins.run.place/sonar/` &rarr; SonarQube

This is different from the deploy server's `nginx-proxy` setup, which only
does one hostname per container — that doesn't support splitting one
domain across two backends by path, so this uses a hand-written nginx
config + certbot instead.

Tested locally before this was written: the config's syntax was validated
directly against nginx, and the actual path-based routing was verified
end-to-end against dummy backend containers (root path and `/sonar/` both
confirmed reaching the correct container). Also verified nginx starts
cleanly even when `jenkins`/`sonarqube` aren't resolvable yet at boot
(via `resolver 127.0.0.11` + variables in `proxy_pass`) — without that,
nginx would refuse to start at all if this container came up before the
other two, which would happen on every host reboot.

## ⚠️ Required Jenkins config change

Setting `SONAR_WEB_CONTEXT=/sonar` (needed so SonarQube knows it's served
under a subpath) changes **all** of SonarQube's URLs, including its API —
not just the web UI. This breaks your already-working Jenkins integration
unless you update it:

**Manage Jenkins → System → SonarQube servers** — change the Server URL
from `http://sonarqube:9000` to **`http://sonarqube:9000/sonar`**.

Do this *before* redeploying with `SONAR_WEB_CONTEXT` set, or your next
build's `SonarQube Analysis` stage will fail (it'll be hitting API paths
that no longer exist at the old URL).

## First-time setup (bootstrap sequence)

Getting a real Let's Encrypt cert has a chicken-and-egg problem: nginx
won't start without a cert file existing at the path it's configured to
use, but Let's Encrypt needs nginx running (to serve the HTTP challenge)
before it'll issue one. Standard fix: start with a throwaway self-signed
cert, then replace it.

**1. DNS first** — make sure `jenkins.run.place` actually resolves to
Server A's IP before continuing (Let's Encrypt will fail otherwise):
```bash
dig +short jenkins.run.place
```

**2. Generate a dummy cert** so nginx has something to load on first boot:
```bash
cd ~/ci
sudo docker compose up -d   # creates the certbot_conf volume if it doesn't exist yet

DOMAIN=jenkins.run.place
sudo docker run --rm -v ci_certbot_conf:/etc/letsencrypt alpine sh -c "
  apk add --no-cache openssl >/dev/null &&
  mkdir -p /etc/letsencrypt/live/$DOMAIN &&
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout /etc/letsencrypt/live/$DOMAIN/privkey.pem \
    -out /etc/letsencrypt/live/$DOMAIN/fullchain.pem \
    -subj '/CN=$DOMAIN'
"
```

**3. Bring up the reverse proxy** (it can now start, since the dummy cert exists):
```bash
sudo docker compose up -d reverse-proxy
sudo docker compose ps reverse-proxy   # confirm it's Up, not restarting
```

**4. Get the real certificate** via the HTTP-01 webroot challenge (nginx is
already serving `/.well-known/acme-challenge/` from the shared volume):
```bash
sudo docker compose run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
  -d jenkins.run.place \
  --email gurpiyar656@gmail.com --agree-tos --no-eff-email --force-renewal" certbot
```

**5. Reload nginx to pick up the real cert:**
```bash
sudo docker compose exec reverse-proxy nginx -s reload
```

**6. Start the renewal loop** (checks twice daily, only actually renews
within ~30 days of expiry):
```bash
sudo docker compose up -d certbot
```

**7. Verify:**
```bash
curl -I https://jenkins.run.place/
curl -I https://jenkins.run.place/sonar/
```
Both should return real HTTP responses (Jenkins' login page, SonarQube's
UI) over a certificate that isn't self-signed.

## After this is working

- Update the GitHub webhook to `https://jenkins.run.place/github-webhook/`
- Consider closing direct external access to ports 8080/9000 in the
  security group once you've confirmed the domain works end-to-end — the
  reverse proxy is the intended entry point now, not those ports directly

## Load balancer for learning.run.place (3 web servers)

The same nginx also load-balances the app domain across the three web
servers the Jenkinsfile deploys to (`deployTargets`), working like an ALB:
TLS ends here, and each server serves plain HTTP on port 8090 over the
private network.

```
                         ┌──> server-1  <private-ip>:8090
 https://learning.run.place ──> reverse-proxy (Jenkins box) ──> server-2  (this box):8090
                         └──> server-3  <private-ip>:8090
```

- **Sticky by client IP** (`ip_hash`): each server has its own `auth-db`,
  so a login only works on the server that issued it.
- **Failover**: a server that errors or is mid-deploy is skipped
  (`proxy_next_upstream`), and after 3 failures it's out of rotation for 30s.
- **`X-Upstream` response header** shows which server answered, and
  `/version` returns `"server": "server-N"`.

### One-time cutover

DNS for `learning.run.place` points at server-1 today, and server-1 keeps
serving it with its own Let's Encrypt setup (`profiles: 'standalone-tls'`
in the Jenkinsfile) until step 5. The site stays up the whole time.

**1. Let the Jenkins box reach port 8090.** Add an inbound rule for TCP
8090 to the security groups of server-1 and server-3, with the Jenkins
box's security group (or private IP) as the source. Don't open it to
`0.0.0.0/0`, because the load balancer is meant to be the only way in.

**2. Deploy to all three first.** Fill in the hosts in `deployTargets`,
push, and let the pipeline go green. Then check each backend from the
Jenkins box:
```bash
for ip in <SERVER_1_PRIVATE_IP> <JENKINS_PRIVATE_IP> <SERVER_3_PRIVATE_IP>; do curl -s http://$ip:8090/version; echo; done
```

**3. Enable the config with a dummy cert** (nginx won't start without a
cert file, and a failed reload would take jenkins.run.place down too):
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
cp reverse-proxy/conf.d/learning.run.place.conf.example reverse-proxy/conf.d/learning.run.place.conf
# edit the three <..._PRIVATE_IP> placeholders, then:
sudo docker compose exec reverse-proxy nginx -t && sudo docker compose exec reverse-proxy nginx -s reload
```

**4. Move DNS, then get the real cert.** Point the `learning.run.place` A
record at the Jenkins box's public IP. Once `dig +short learning.run.place`
shows it:
```bash
sudo docker compose run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
  -d learning.run.place \
  --email gurpiyar656@gmail.com --agree-tos --no-eff-email --force-renewal" certbot
sudo docker compose exec reverse-proxy nginx -s reload
```
The `certbot` container that's already running renews this cert along with
jenkins.run.place's.

**5. Retire server-1's own TLS.** In the Jenkinsfile, set server-1's
`profiles` to `''`, push, then on server-1:
```bash
docker rm -f nginx-proxy acme-companion
```

**6. Verify** that traffic is spread across the servers. The same client IP
sticks to one server, so compare from different networks, or stop one
server's frontend and watch the header change:
```bash
curl -sI https://learning.run.place/ | grep -i x-upstream
curl -s https://learning.run.place/version
```

> An AWS Application Load Balancer + ACM certificate would do the same job
> as a managed service (health checks, no single box), but it costs money
> and needs DNS-validated certs. This setup reuses the nginx that's already
> running on the Jenkins box, at the cost of that box being a single point
> of entry.
