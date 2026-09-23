# Terraform demo: Jenkins manages one EC2 instance

Proof-of-concept only — the pipeline can run `terraform apply` to ensure
exactly **one** demo EC2 instance exists, or `terraform destroy` to remove
that instance. This is deliberately *not* an Auto Scaling Group or real
scaling system; it's a minimal demonstration that Jenkins can drive
infrastructure-as-code.

The Jenkins pipeline has an `INFRA_ACTION` dropdown:

- `BUILD` runs `terraform apply`, then builds and deploys the application.
- `DESTROY` runs `terraform destroy` and skips build, push, and deployment.

Running the pipeline again doesn't create a second instance — Terraform
converges to the same declared state each time (that's normal, correct
behavior, not a bug). It'll update the instance's `BuildNumber` tag on each
run so you can see which build last touched it.

The instance receives an IAM instance profile with
`AmazonSSMManagedInstanceCore`. The pipeline also generates a unique RSA PEM
for the selected `SERVER_NUMBER`, adds the public key to AWS, and publishes
the private key as a protected Jenkins build artifact. The Google Chat
message contains only the protected artifact URL; it never contains the
private key text.

Download the artifact only through an authenticated Jenkins account, then
restrict it locally:

```bash
chmod 600 server-1.pem
ssh -i server-1.pem ubuntu@<public-ip>
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
        "ec2:DescribeInstances",
        "ec2:DescribeImages",
        "ec2:DescribeSecurityGroups",
        "ec2:DescribeSubnets",
        "ec2:DescribeKeyPairs",
        "ec2:CreateTags",
        "ec2:DescribeTags",
        "iam:CreateRole",
        "iam:PutRolePolicy",
        "iam:AttachRolePolicy",
        "iam:CreateInstanceProfile",
        "iam:AddRoleToInstanceProfile",
        "iam:PassRole",
        "iam:DeleteRole",
        "iam:DeleteInstanceProfile",
        "iam:DetachRolePolicy"
      ],
      "Resource": "*"
    }
  ]
}
```

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

## Verifying it worked

```bash
docker run --rm -v $(pwd):/workspace -w /workspace --entrypoint /bin/sh \
  hashicorp/terraform:latest -c "terraform show"
```

Or just check the AWS Console — you should see one instance tagged
`Name = jenkins-demo-instance`, `CreatedBy = jenkins-pipeline`.

## Cleaning up

This creates a real, billed EC2 instance. To remove it when you're done
demonstrating, choose `DESTROY` in Jenkins and click **Build**. Terraform
uses the state in the Jenkins job workspace, so run `DESTROY` from the same
Jenkins job that ran `BUILD`.

```bash
docker run --rm -v $(pwd):/workspace -w /workspace --entrypoint /bin/sh \
  hashicorp/terraform:latest -c "terraform destroy -auto-approve"
```
