# DigitalOcean Terraform and Ansible apply runbook

This runbook creates a short-lived DigitalOcean VM, deploys IncidentFlow with
Ansible, captures proof, then destroys the VM to control cost.

Do not commit tokens, real passwords, private keys, `terraform.tfvars`,
Ansible variable files, Terraform state, or plan files.

## 0. Tool locations

Use PowerShell for Terraform.

Use WSL Ubuntu for Ansible. Ansible does not run natively from Windows as a
control node; WSL is acceptable for this lab proof.

## 1. Install tools

PowerShell:

```powershell
winget install Hashicorp.Terraform
terraform version
```

WSL Ubuntu:

```bash
sudo apt update
sudo apt install -y ansible openssh-client
ansible --version
```

## 2. Create DigitalOcean API token

In DigitalOcean:

```text
API -> Tokens -> Generate New Token
```

Use a token with write access for this proof. Keep it private.

In PowerShell:

```powershell
$env:DIGITALOCEAN_TOKEN = "replace-with-your-digitalocean-token"
```

## 3. Create SSH key

PowerShell:

```powershell
ssh-keygen -t ed25519 -f $env:USERPROFILE\.ssh\incidentflow_do -C incidentflow-do-proof
```

WSL Ubuntu needs the private key with Linux permissions:

```bash
mkdir -p ~/.ssh
cp /mnt/c/Users/PC/.ssh/incidentflow_do ~/.ssh/incidentflow_do
chmod 600 ~/.ssh/incidentflow_do
```

## 4. Prepare Terraform variables

PowerShell:

```powershell
cd D:\IncidentFlow\infrastructure\terraform\environments\digitalocean-proof
Copy-Item terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars`:

```hcl
region              = "fra1"
droplet_size        = "s-1vcpu-2gb"
ssh_public_key_path = "~/.ssh/incidentflow_do.pub"
ssh_allowed_cidr    = "YOUR_PUBLIC_IP/32"
```

If you cannot get your public IP yet, keep `0.0.0.0/0` only for a short proof
window, then destroy the VM after the test.

## 5. Plan Terraform

PowerShell:

```powershell
terraform fmt -recursive
terraform init
terraform validate
terraform plan -out=tfplan
```

Stop here. Review the plan before creating paid resources.

Expected creates:

- one `digitalocean_ssh_key`
- one `digitalocean_droplet`
- one `digitalocean_firewall`

## 6. Apply Terraform

Only after reviewing the plan and accepting the short-lived cost:

```powershell
terraform apply tfplan
terraform output public_ipv4
terraform output ansible_inventory_line
terraform output user_site_url
terraform output support_site_url
terraform output admin_site_url
```

Copy the public IPv4 for Ansible.

## 7. Prepare Ansible inventory and variables

WSL Ubuntu:

```bash
cd /mnt/d/IncidentFlow/provision/ansible
cp inventory/digitalocean-proof.ini.example inventory/digitalocean-proof.ini
cp group_vars/incidentflow.yml.example group_vars/incidentflow.yml
```

Edit `inventory/digitalocean-proof.ini`:

```ini
[incidentflow]
incidentflow ansible_host=YOUR_DROPLET_IP ansible_user=root ansible_ssh_private_key_file=~/.ssh/incidentflow_do
```

Edit `group_vars/incidentflow.yml`:

```yaml
incidentflow_postgres_password: long_random_cloud_password
incidentflow_admin_username: admin
incidentflow_admin_password: long_random_admin_password
```

Keep Docker Hub image tags pinned when possible. Avoid `latest` for final
portfolio evidence.

## 8. Run Ansible

WSL Ubuntu:

```bash
export ANSIBLE_HOST_KEY_CHECKING=False
export ANSIBLE_ROLES_PATH=./roles

ansible-playbook -i inventory/digitalocean-proof.ini -e @group_vars/incidentflow.yml --syntax-check playbooks/deploy-incidentflow.yml
ansible-playbook -i inventory/digitalocean-proof.ini -e @group_vars/incidentflow.yml playbooks/deploy-incidentflow.yml
ansible-playbook -i inventory/digitalocean-proof.ini -e @group_vars/incidentflow.yml playbooks/deploy-incidentflow.yml
```

Run twice. The second run proves idempotence.

## 9. Smoke test

PowerShell or WSL:

```powershell
curl.exe http://DROPLET_IP:8084/api/ready
curl.exe http://DROPLET_IP:8085/api/ready
curl.exe http://DROPLET_IP:8086/api/ready
```

Browser proof:

```text
http://DROPLET_IP:8084
http://DROPLET_IP:8085
http://DROPLET_IP:8086
```

Test the flow:

1. Log in to admin site.
2. Create one normal user and one support user.
3. Log in to user site and report an incident.
4. Log in to support site and move it to In progress, then Resolved.
5. Confirm admin dashboard timing metrics update.

## 10. Capture evidence

Record:

- Terraform plan summary.
- Terraform outputs.
- Ansible play recap.
- `docker compose ps` from the VM.
- all three `/api/ready` checks.
- screenshots of the three sites.
- admin dashboard after a resolved incident.

## 11. Destroy resources

PowerShell:

```powershell
cd D:\IncidentFlow\infrastructure\terraform\environments\digitalocean-proof
terraform destroy
```

Confirm in DigitalOcean that the Droplet is gone. Destroying is safer for cost
than only powering off the VM.
