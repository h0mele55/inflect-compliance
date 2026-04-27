# Terraform — `infra/terraform/`

Infrastructure-as-code for the inflect-compliance platform. Targets
**AWS**. Remote state in **S3** with **DynamoDB** locking, separate
state files per environment.

## Layout

```
infra/terraform/
├── README.md                    ← this file
├── Makefile                     ← per-env helpers (init / plan / apply / fmt / validate)
├── versions.tf                  ← terraform + provider version pins
├── providers.tf                 ← aws provider, default_tags
├── backend.tf                   ← s3 backend (partial — config from environments/<env>/backend.hcl)
├── main.tf                      ← root composition: locals, tags, module wiring
├── variables.tf                 ← project-wide inputs
├── outputs.tf                   ← top-level outputs
├── environments/
│   ├── staging/
│   │   ├── backend.hcl          ← bucket + key + table for staging state
│   │   ├── terraform.tfvars     ← non-sensitive staging values
│   │   └── README.md            ← env-scoped operator notes
│   └── production/
│       ├── backend.hcl
│       ├── terraform.tfvars
│       └── README.md
├── bootstrap/                   ← ONE-SHOT: creates state buckets + lock table
└── modules/
    ├── vpc/        ← networking (stub)
    ├── database/   ← RDS Postgres (stub)
    ├── redis/      ← ElastiCache (stub)
    └── storage/    ← S3 app data buckets (stub)
```

## Environment separation model

- **One S3 bucket per environment** — `inflect-compliance-tfstate-<env>`. A
  compromised staging credential cannot touch production state.
- **One state object per environment** — `env/<env>/root.tfstate`.
- **Single DynamoDB lock table**, shared across environments. The Terraform
  S3 backend computes a per-state `LockID` so cross-env contention is
  architecturally impossible.
- **No workspaces.** Workspaces share the bucket-level IAM scope, which
  makes blast-radius isolation impossible. Separate backend keys win.

## First-time setup

```bash
# 1. Bootstrap (once per AWS account, by an admin).
cd infra/terraform/bootstrap
terraform init
terraform apply

# 2. Init the root module against staging.
cd ..
terraform init -backend-config=environments/staging/backend.hcl

# 3. Plan + apply.
terraform plan  -var-file=environments/staging/terraform.tfvars
terraform apply -var-file=environments/staging/terraform.tfvars
```

## Switching environments

```bash
terraform init -reconfigure -backend-config=environments/production/backend.hcl
terraform plan  -var-file=environments/production/terraform.tfvars
```

`-reconfigure` is required when changing backends — Terraform refuses
to silently retarget remote state.

## Make targets

```
make fmt                        # terraform fmt -recursive
make validate                   # terraform validate (assumes init has run)
make init  ENV=staging          # init against env's backend config
make plan  ENV=staging          # plan with env's tfvars
make apply ENV=staging          # apply (interactive confirm)
```

`ENV` must be `staging` or `production`. The Makefile passes
`-backend-config` and `-var-file` automatically.

## Secrets policy

Committed `environments/<env>/terraform.tfvars` carry **non-sensitive** values only —
project name, region, owner tag, etc. Secrets travel via:

- `TF_VAR_<name>` env vars set in the operator's shell or CI secret store, OR
- `data "aws_secretsmanager_secret_version" ...` blocks reading from
  AWS Secrets Manager / SSM Parameter Store — never inlined in tfvars.

The repo's `.gitignore` excludes `*.secret.tfvars`, `*.auto.tfvars`,
`*.tfstate*`, and `*.tfplan*` so accidental local-state or
auto-loaded secret files cannot land in commits.

## Verification

The repo carries a structural ratchet at
`tests/guards/terraform-foundation.test.ts` that fails CI if:

- any of the four canonical files (`main.tf`, `variables.tf`,
  `outputs.tf`, `versions.tf`) goes missing,
- the AWS provider pin drifts off `>= 5.0`,
- the backend block stops being a partial config (i.e. someone
  hardcodes a bucket name into `backend.tf`),
- per-env backend configs or tfvars disappear,
- a module placeholder loses its `variables.tf` / `outputs.tf`
  contract.

## CI integration

`.github/workflows/terraform.yml` is the delivery pipeline:

| Trigger | Behaviour |
|---|---|
| **Pull request** touching `infra/terraform/**` | `fmt -check`, `validate`, `plan` against BOTH staging + production. Plan output posted as a sticky PR comment (one per env). |
| **Push to `main`** touching `infra/terraform/**` | `fmt -check`, `validate`, then **auto-apply staging**, then **apply production** (gated by the GitHub Environment's required-reviewers protection rule). |
| **`workflow_dispatch`** (manual) | Apply only the chosen env. Production still requires the env's reviewer approval. |

**Auth**: AWS credentials come from OIDC — the workflow assumes
`secrets.AWS_ROLE_TO_ASSUME` (one secret per GitHub Environment).
No long-lived AWS access keys live in the repo or in workflow files.

**Setup prerequisites** (each env, once):
1. Configure GitHub Environments named `staging` and `production`.
   `production` MUST have **required reviewers** — that's the
   manual-approval gate.
2. Set environment secret `AWS_ROLE_TO_ASSUME` per env.
3. Create the IAM role + OIDC trust in each AWS account.
4. Run the bootstrap stack (`bootstrap/`) once per AWS account to
   create the state bucket + lock table.

Per-env READMEs (`environments/staging/README.md`,
`environments/production/README.md`) cover the IAM/OIDC details.

The terraform workflow is **complementary** to the existing
`.github/workflows/deploy.yml` — terraform.yml provisions
infrastructure, deploy.yml ships the application Docker container to
the provisioned compute. They share the GitHub Environment
nomenclature but use independent secrets.

## Adding a new module

1. Create `modules/<name>/{main,variables,outputs}.tf` following the
   stub pattern (variables.tf locks the input contract; main.tf can be
   a comment-only stub during design; outputs.tf returns null literals).
2. Add a commented `module "<name>" { ... }` block in the root
   `main.tf`. Uncomment when the implementation lands.
3. Add the module's outputs to the root `outputs.tf` if cross-module
   consumers need them.
4. Add a test case in `tests/guards/terraform-foundation.test.ts`.
