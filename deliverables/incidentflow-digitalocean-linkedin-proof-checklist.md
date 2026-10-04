# IncidentFlow DigitalOcean LinkedIn Proof Checklist

Use these screenshots in this order.

## Recommended carousel order

1. Terraform proof
   - Screenshot: `Screenshot 2026-10-04 120058.png`
   - Shows `terraform output` and `terraform state list`.

2. Ansible idempotence proof
   - Screenshot: `Screenshot 2026-10-04 120351.png`
   - Shows `ok=11`, `changed=0`, `unreachable=0`, `failed=0`.

3. Docker cloud proof
   - Screenshot: `Screenshot 2026-10-04 120556.png`
   - Shows all five containers healthy on the Droplet.

4. User portal
   - Screenshot: `Screenshot 2026-10-04 120730.png`
   - Shows the cloud user site on port `8084`.

5. Support portal
   - Screenshot: `Screenshot 2026-10-04 120938.png`
   - Shows the cloud support site on port `8085`.

6. Admin dashboard
   - Screenshot: `Screenshot 2026-10-04 121119.png`
   - Shows the cloud admin site on port `8086`, dashboard metrics, support performance, and user reporting.

7. Cost-control proof
   - Add screenshot after `terraform destroy`.
   - Best line: `Destroy complete`.

## Caption angle

Focus on proof, not hype:

- Local app moved to cloud.
- Terraform created infrastructure.
- Ansible configured and deployed.
- Docker Compose ran the application.
- Three public portals were verified.
- Second Ansible run proved idempotence.
- Total short proof cost was about `$0.06`.
- Resources were destroyed after evidence.

## Do not include

- DigitalOcean API token.
- Admin password.
- PostgreSQL password.
- Private SSH key.
- `group_vars/incidentflow.yml`.
- `terraform.tfvars`.

## AWS transition note

After this post, the next portfolio proof should be AWS using the same pattern:

```text
Terraform -> EC2/security group/key pair -> Ansible -> Docker Compose -> smoke test -> destroy
```

Use the DigitalOcean post as proof of process before starting the AWS version.
