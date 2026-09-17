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
