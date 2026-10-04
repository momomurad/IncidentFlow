# Ansible layout

This folder will hold the Ansible automation for preparing the cloud VM and
running IncidentFlow.

Ansible is responsible for server configuration and application deployment. It
must not create cloud infrastructure; that is Terraform's job.

Planned layout:

```text
provision/ansible/
  inventory/
    cloud-proof.ini
  group_vars/
    incidentflow.yml.example
  playbooks/
    deploy-incidentflow.yml
  roles/
    docker_host/
    incidentflow_compose/
```

First cloud VM playbook responsibilities:

- install Docker Engine
- install Docker Compose plugin
- create `/opt/incidentflow`
- place `compose.cloud.yaml`
- create the runtime `.env` file from variables
- pull Docker Hub images
- run `docker compose up -d`
- verify health and readiness endpoints

Required checks:

```powershell
cd D:\IncidentFlow\provision\ansible
Copy-Item inventory\digitalocean-proof.ini.example inventory\digitalocean-proof.ini
Copy-Item group_vars\incidentflow.yml.example group_vars\incidentflow.yml
```

When running from WSL under `/mnt/d`, Ansible may ignore `ansible.cfg` because
the Windows-mounted directory is world-writable. Use explicit environment and
inventory settings:

```bash
cd /mnt/d/IncidentFlow/provision/ansible
export ANSIBLE_HOST_KEY_CHECKING=False
export ANSIBLE_ROLES_PATH=./roles
ansible-playbook -i inventory/digitalocean-proof.ini -e @group_vars/incidentflow.yml --syntax-check playbooks/deploy-incidentflow.yml
ansible-playbook -i inventory/digitalocean-proof.ini -e @group_vars/incidentflow.yml playbooks/deploy-incidentflow.yml
```

Run the playbook twice during proof. The second run should be clean or only
report expected service checks.
