# Terraform layout

This folder will hold the provider-specific Terraform code for the IncidentFlow
cloud proof.

Terraform is responsible for creating and destroying cloud infrastructure. It
must not configure the application inside the server; that is Ansible's job.

Planned layout after provider choice:

```text
infrastructure/terraform/
  environments/
    cloud-proof/
      backend.tf
      providers.tf
      main.tf
      variables.tf
      outputs.tf
      terraform.tfvars.example
  modules/
    network/
    vm/
```

Minimum outputs for Ansible:

- public IP or DNS name
- SSH username
- SSH private key path or key reference
- opened HTTP ports

Required workflow:

```powershell
terraform fmt -recursive
terraform init
terraform validate
terraform plan -out=tfplan
```

Do not run `terraform apply` until the plan, expected cost, and cleanup command
are reviewed.
