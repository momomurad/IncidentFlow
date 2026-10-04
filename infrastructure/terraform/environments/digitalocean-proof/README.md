# DigitalOcean proof environment

This environment creates one temporary DigitalOcean Droplet for the IncidentFlow
cloud proof. Ansible deploys the app after Terraform creates the infrastructure.

## What Terraform creates

- one Ubuntu Droplet
- one uploaded SSH public key
- one DigitalOcean firewall
- inbound ports:
  - `22` for SSH
  - `8084` for the user site
  - `8085` for the support site
  - `8086` for the admin site

## Required local setup

Set the DigitalOcean API token in the shell. Do not commit it.

```powershell
$env:DIGITALOCEAN_TOKEN = "replace-with-your-digitalocean-token"
```

Create a dedicated SSH key for this proof:

```powershell
ssh-keygen -t ed25519 -f $env:USERPROFILE\.ssh\incidentflow_do -C incidentflow-do-proof
```

Copy the example variables:

```powershell
Copy-Item terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` before planning. Set `ssh_allowed_cidr` to your public
IP with `/32` if possible.

## Commands

```powershell
terraform fmt -recursive
terraform init
terraform validate
terraform plan -out=tfplan
```

Stop here and review the plan before apply. This creates paid resources.

```powershell
terraform apply tfplan
terraform output ansible_inventory_line
```

After proof, destroy the resources:

```powershell
terraform destroy
```
