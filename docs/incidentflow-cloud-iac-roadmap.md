# IncidentFlow cloud IaC roadmap

IncidentFlow cloud work must be reproducible. Do not create the cloud proof by
clicking through a portal and then trying to remember the steps later.

## Tool boundary

Terraform owns cloud infrastructure:

- provider and region configuration
- VM or Kubernetes runtime
- virtual network, subnet, firewall/security rules, and public IP
- SSH key registration
- optional managed database or object storage
- outputs needed by Ansible, such as public IP and SSH user

Ansible owns server preparation and app deployment:

- install Docker and Docker Compose plugin
- create the IncidentFlow application directory
- write the cloud `.env` file from variables or a secrets source
- place `compose.cloud.yaml`
- log in to the container registry if private images are used
- pull versioned IncidentFlow images
- run `docker compose up -d`
- verify `/api/ready` through the exposed sites

Jenkins can call both tools later:

```text
Jenkins -> tests/build -> image push -> terraform plan -> approval -> terraform apply -> ansible deploy -> smoke test
```

## First cloud proof

Use a single small VM first. It is the cheapest useful proof because it shows
IaC, configuration management, Docker deployment, networking, smoke testing, and
cleanup without paying for a managed Kubernetes cluster.

Target runtime:

```text
VM
  Docker Engine
  Docker Compose
  incidentflow API
  incidentflow user UI
  incidentflow support UI
  incidentflow admin UI
  PostgreSQL temporary volume
```

## Required proof

- `terraform fmt`
- `terraform validate`
- `terraform plan`
- reviewed plan summary before apply
- Ansible playbook syntax check
- Ansible idempotence: second run reports no unexpected changes
- cloud URLs respond
- `/api/ready` responds
- admin creates users
- user reports an incident
- support takes and resolves the incident
- admin dashboard shows timing metrics
- resources are stopped or destroyed after evidence is captured

## Not yet

Provider choice: DigitalOcean.

First implementation target:

- Terraform environment: `infrastructure/terraform/environments/digitalocean-proof`
- Ansible playbook: `provision/ansible/playbooks/deploy-incidentflow.yml`
- Apply runbook: `docs/digitalocean-terraform-ansible-apply-runbook.md`
- Runtime: one Ubuntu Droplet running Docker Compose
- Size: start with `s-1vcpu-2gb`; resize only if memory pressure is proven
- Region: `fra1` unless a closer or cheaper region is selected

Do not run `terraform apply` until the plan, expected cost, and cleanup command
are reviewed.
