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

## Re-running

Every task here is idempotent (`creates:` guards, `when: ... rc != 0`
checks) — safe to re-run `ansible-playbook site.yml` any time, e.g. after
pulling repo changes, without recreating the Jenkins container or
regenerating the SSH key.
