# Ansible provisioning

Automates GUIDE.md sections 1–2 (Docker + Jenkins on the head node, Docker +
deploy user + SSH trust on the managed node) using the Ansible control setup
you already have on the head EC2.

## 0. Merge the inventory

Don't replace your existing inventory file — just add the `[jenkins_server]`
and `[deploy_server]` groups from [inventory.example.ini](inventory.example.ini)
into it, pointing at the hosts/aliases you already use. `jenkins_server`
should resolve to the head node itself via `ansible_connection=local` (since
Ansible already runs there); `deploy_server` should reuse whatever
alias/IP/user you already have configured for the managed node.

Edit [vars.yml](vars.yml) and set `registry` to your actual Docker Hub
namespace.

## 1. Run the playbooks, in order

From the `ansible/` directory on the head node:

```bash
cd ansible
ansible-playbook site.yml
```

This runs, in order:

1. **playbook-jenkins.yml** — installs Docker on the head node, starts
   Jenkins in a container (host port from `jenkins_ui_port` in vars.yml,
   default 8081), generates an SSH keypair at
   `/var/lib/jenkins_ssh/jenkins_deploy_key`, and fetches the public half
   back to `ansible/files/jenkins_deploy_key.pub` on the control node.
   Prints the Jenkins initial admin password at the end.
2. **playbook-deploy-server.yml** — installs Docker on the managed node,
   creates a `deployer` user, authorizes the key fetched in step 1 for that
   user, creates `/opt/devops-microservices-demo`, and drops
   `docker-compose.prod.yml` + a generated `.env` in place there.

If you'd rather run them one at a time (e.g. to inspect the pub key before
authorizing it):

```bash
ansible-playbook playbook-jenkins.yml
cat files/jenkins_deploy_key.pub   # sanity check
ansible-playbook playbook-deploy-server.yml
```

## 2. Wire up Jenkins credentials

Open `http://<head-public-ip>:8081`, unlock with the password the playbook
printed (or re-fetch it with
`docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword`),
install the suggested plugins plus **SSH Agent** and **Docker Pipeline**.

Then **Manage Jenkins → Credentials → Add Credentials**:

1. **SSH Username with private key**
   - ID: `deploy-server-ssh-key`
   - Username: `deployer`
   - Private key: paste the contents of the key the playbook generated:
     ```bash
     cat /var/lib/jenkins_ssh/jenkins_deploy_key
     ```
2. **Username with password**
   - ID: `dockerhub-credentials`
   - Your Docker Hub username + an access token (not your real password)

Update the `Jenkinsfile`'s `DEPLOY_HOST` to the managed node's IP/alias, then
continue with GUIDE.md section 3 (create the pipeline job + GitHub webhook).

## Load-balanced web servers (optional)

To prepare the extra web servers for the second job
(`multi-server/Jenkinsfile`), run the same playbook against the
`[lb_web_servers]` group:

```bash
ansible-playbook playbook-deploy-server.yml -e @../multi-server/ansible-vars.yml
```

The full setup is in [multi-server/README.md](../multi-server/README.md).

## Re-running

Every task here is idempotent (`creates:` guards, `when: ... rc != 0`
checks) — safe to re-run `ansible-playbook site.yml` any time, e.g. after
pulling repo changes, without recreating the Jenkins container or
regenerating the SSH key.

## 3. Daily backups to S3 (optional)

`playbook-backup.yml` installs [`scripts/backup-to-s3.sh`](../scripts/backup-to-s3.sh)
on the deploy server and runs it from root's crontab every day (default
06:25 server time). Each run archives `deploy_path` (compose file + `.env`)
a `pg_dumpall` of every PostgreSQL container in the project (the login
portal's `auth-db`), and every other Docker volume of the compose project
(TLS certs, acme state), then uploads one tarball to
`s3://<bucket>/<prefix>/<hostname>/YYYY/MM/<hostname>-<timestamp>.tar.gz`.

1. Create the bucket (block public access, turn on default encryption), and
   add a lifecycle rule to expire old backups, e.g. after 30 days:

   ```bash
   aws s3api create-bucket --bucket my-app-backups --region ap-south-1 \
     --create-bucket-configuration LocationConstraint=ap-south-1
   aws s3api put-public-access-block --bucket my-app-backups \
     --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
   aws s3api put-bucket-lifecycle-configuration --bucket my-app-backups \
     --lifecycle-configuration '{"Rules":[{"ID":"expire-backups","Status":"Enabled","Filter":{"Prefix":"backups/"},"Expiration":{"Days":30}}]}'
   ```

2. Give the deploy server's EC2 instance an IAM role (no access keys on the
   box) with this policy:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Action": ["s3:PutObject"],
       "Resource": "arn:aws:s3:::my-app-backups/backups/*"
     }]
   }
   ```

3. Set `backup_s3_bucket` (and optionally the schedule) in `vars.yml`, then:

   ```bash
   ansible-playbook playbook-backup.yml
   ```

4. Check it on the server:

   ```bash
   sudo /usr/local/bin/backup-to-s3.sh      # run once by hand
   sudo crontab -l                          # confirm the schedule
   tail -f /var/log/backup-to-s3.log        # cron output
   ```

Restore: `aws s3 cp s3://.../<file>.tar.gz . && tar xzf <file>.tar.gz`, then
extract `files/*.tar.gz` with `tar -C / -xzf` and each `volumes/<vol>.tar.gz`
into its volume via `docker run --rm -v <vol>:/data -v $PWD/volumes:/in alpine tar -C /data -xzf /in/<vol>.tar.gz`.
Restore the login database from its dump with
`gunzip -c databases/<auth-db container>.sql.gz | docker exec -i <auth-db container> psql -U auth -d postgres`.

### Success / failure alerts (SNS email)

Set `backup_sns_topic_arn` in `vars.yml` and cron runs
[`scripts/backup-with-alert.sh`](../scripts/backup-with-alert.sh) instead,
which runs the backup and publishes `[backup] SUCCESS|FAILED on <host>` with
the log tail to that SNS topic. Create a Standard topic, add email
subscriptions (each recipient must click the confirmation link), and add this
statement to the instance role's policy:

```json
{ "Effect": "Allow", "Action": "sns:Publish", "Resource": "<topic ARN>" }
```
