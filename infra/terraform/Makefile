# Per-environment Terraform helper.
#
# Usage:
#   make fmt
#   make validate
#   make init     ENV=staging
#   make plan     ENV=staging
#   make apply    ENV=staging
#   make destroy  ENV=staging   (will prompt for confirm)
#
# ENV must be one of: staging, production.

ENV ?=
VALID_ENVS := staging production

ifneq (,$(filter $(MAKECMDGOALS),init plan apply destroy output))
ifeq ($(ENV),)
$(error ENV is required. Use ENV=staging or ENV=production)
endif
ifeq ($(filter $(ENV),$(VALID_ENVS)),)
$(error ENV must be one of: $(VALID_ENVS). Got: $(ENV))
endif
endif

BACKEND_CFG := environments/$(ENV)/backend.hcl
TFVARS      := environments/$(ENV)/terraform.tfvars

.PHONY: fmt validate init plan apply destroy output

fmt:
	terraform fmt -recursive

validate:
	terraform validate

init:
	terraform init -reconfigure -backend-config=$(BACKEND_CFG)

plan:
	terraform plan -var-file=$(TFVARS)

apply:
	terraform apply -var-file=$(TFVARS)

destroy:
	terraform destroy -var-file=$(TFVARS)

output:
	terraform output
