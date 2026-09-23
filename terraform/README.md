# Terraform demo: Jenkins manages one EC2 instance

Proof-of-concept only — the pipeline can run `terraform apply` to ensure
exactly **one** demo EC2 instance exists, or `terraform destroy` to remove
that instance. This is deliberately *not* an Auto Scaling Group or real
scaling system; it's a minimal demonstration that Jenkins can drive
infrastructure-as-code.

The Jenkins pipeline has an `INFRA_ACTION` dropdown:

- `BUILD` runs `terraform apply`, then builds and deploys the application.
- `DESTROY` runs `terraform destroy` and skips build, push, and deployment.

**Every successful `BUILD` run replaces the instance and its SSH key**, on
purpose — the pipeline passes `-replace` on the key pair, private key, and
instance resources, forcing Terraform to destroy and recreate all three
even though nothing in their configuration changed. This is a deliberate
tradeoff: AWS ties an SSH key to instance *launch*, so there's no way to
rotate the key on a running instance without relaunching it. If you want a
genuinely new PEM every build (which is what this demo does), you accept
a new instance every build too — this is **not** the "converges to the
same instance" idempotent behavior a normal `terraform apply` would give
you, and it means each `BUILD` run bills for a fresh instance-hour and
takes as long as a full instance boot, not just a tag update.

The instance receives an IAM instance profile with
`AmazonSSMManagedInstanceCore`. Each `BUILD` run generates a fresh RSA
keypair, adds its public half to AWS as `jenkins-demo-server-<SERVER_NUMBER>`
(same name every time — only the key *material* is new each build, not the
AWS-side key pair name), and publishes the private key as a Jenkins build
artifact named `server-<SERVER_NUMBER>-build-<BUILD_NUMBER>.pem` — unique
per build, so old builds' artifact lists keep their own (now-orphaned,
since the instance they matched is gone) PEMs for reference. The Google
Chat message contains only the protected artifact URL; it never contains
the private key text.

Download the artifact only through an authenticated Jenkins account, then
restrict it locally:

```bash
chmod 600 server-1-build-42.pem   # match the actual filename Jenkins gave you
ssh -i server-1-build-42.pem ubuntu@<public-ip>
```

SSM remains available without a PEM:

```bash
aws ssm start-session --target <instance-id> --region <aws-region>
```

The AMI must include the SSM Agent (current Ubuntu and Amazon Linux AMIs
usually do), and the instance must be able to reach the SSM endpoints through
its network route/NAT gateway or VPC endpoints.

## Setup (do this once, on Server A)

### 1. Create and attach an IAM role

AWS Console → IAM → Roles → Create role → AWS service → EC2. Attach a
policy with exactly these permissions (create a new policy with this JSON
rather than using a broad managed policy):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ec2:RunInstances",
        "ec2:TerminateInstances",
        "ec2:CreateTags",
        "ec2:ImportKeyPair",
        "ec2:DeleteKeyPair",
        "ec2:Describe*",
        "iam:CreateRole",
        "iam:DeleteRole",
        "iam:GetRole",
        "iam:TagRole",
        "iam:PutRolePolicy",
        "iam:DeleteRolePolicy",
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
        "iam:ListAttachedRolePolicies",
        "iam:ListRolePolicies",
        "iam:CreateInstanceProfile",
        "iam:DeleteInstanceProfile",
        "iam:GetInstanceProfile",
        "iam:TagInstanceProfile",
        "iam:AddRoleToInstanceProfile",
        "iam:RemoveRoleFromInstanceProfile",
        "iam:PassRole"
      ],
      "Resource": "*"
    }
  ]
}
```

`ec2:Describe*` is a read-only wildcard covering `DescribeInstances`,
`DescribeImages`, `DescribeInstanceTypes`, etc. — safe to broaden since none
of these can change anything, and it avoids re-discovering one missing
Describe permission at a time as the AWS provider reads back more computed
attributes (which is exactly what happened before this policy was widened).

Name the role something like `jenkins-terraform-demo`, then: AWS Console
→ EC2 → Instances → select Server A → Actions → Security → **Modify IAM
role** → attach the role you just created.

### 2. Fix the IMDS hop limit (required for Docker containers to use the role)

By default, AWS's instance metadata service only allows 1 network "hop" —
and a Docker container counts as one hop past the host itself, so without
this, the `hashicorp/terraform` container won't be able to fetch the
role's credentials at all:

```bash
aws ec2 modify-instance-metadata-options \
  --instance-id <server-a-instance-id> \
  --http-put-response-hop-limit 2 \
  --http-tokens required
```

(Find `<server-a-instance-id>` in the EC2 console, or `aws ec2
describe-instances` if you have the CLI configured locally.)

### 3. Create terraform.tfvars on Server A (not committed to git)

```bash
cd ~/ci/jenkins-workspace-or-wherever/devops-microservices-demo/terraform  # adjust to your actual Jenkins workspace path
cp terraform.tfvars.example terraform.tfvars
nano terraform.tfvars   # fill in ami_id and security_group_id
```

The actual path is `<jenkins-job-workspace>/terraform/terraform.tfvars` —
find your job's workspace path from the Jenkins job page (left sidebar
shows "Workspace" once a build has run at least once), or just let the
first build fail at this stage and create the file at the path it reports.

**If you already had a `terraform.tfvars` from before `server_number` was
introduced**, edit it — remove any `key_name = "..."` line (that variable
no longer exists; the key pair is generated automatically now) and add
`server_number = "1"` instead. Leaving a stale `key_name` line in there
will make every `terraform` command fail immediately with "Error: Value
for undeclared variable."

## Verifying it worked

Run this **on Server A** (not inside a plain `docker run -v $(pwd)...` --
that binds an empty host directory instead of the real workspace, since
`docker run` from inside the Jenkins container talks to the host's docker
daemon, and `jenkins_home` is a named volume, not literally a folder at
that path on the host):

```bash
docker run --rm -v jenkins_home:/var/jenkins_home \
  -w /var/jenkins_home/workspace/devops-microservices-demo/terraform \
  hashicorp/terraform:latest show
```

Or just check the AWS Console — you should see one instance tagged
`Name = jenkins-demo-instance`, `CreatedBy = jenkins-pipeline`.

## Cleaning up

This creates a real, billed EC2 instance. To remove it when you're done
demonstrating, choose `DESTROY` in Jenkins and click **Build** (matching
`SERVER_NUMBER`). Terraform uses the state in the Jenkins job workspace, so
run `DESTROY` from the same Jenkins job that ran `BUILD` -- this is the
supported path, not a manual `terraform destroy` from the command line.

If you ever do need to run it manually (e.g. debugging on Server A
directly), use the same named-volume mount as the verification command
above, not a plain `-v $(pwd):/workspace` -- see the note in "Verifying it
worked."
