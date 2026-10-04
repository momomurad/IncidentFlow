# LinkedIn Post

I completed a lived DigitalOcean cloud deployment proof for IncidentFlow, my incident ticket workflow app.

The goal was long-term hosting. The goal was to prove the full DevOps path from local Docker work to a real cloud VM, using infrastructure as code and configuration automation.

The carousel shows the results:

- Terraform created the DigitalOcean Droplet, SSH key, firewall, and output URLs.
- Ansible configured the server, wrote the environment, deployed Docker Compose, and verified all three sites.
- The second Ansible run was idempotent: `ok=11`, `changed=0`, `failed=0`.
- Docker Compose showed the backend, PostgreSQL, user portal, support portal, and admin portal running healthy.
- The user site reported incidents on port `8084`.
- The support site took and resolved tickets on port `8085`.
- The admin site tracked workflow metrics on port `8086`.
- The cloud proof cost was about `$ 24.

The important part for me was the discipline:

```text
small cloud resource
-> Terraform apply
-> Ansible deploy
-> Docker Compose health check
-> app workflow smoke test
-> screenshots and evidence
```

IncidentFlow is intentionally split into separate user, support, and admin portals. That made the cloud proof stronger because it tested the real workflow, not only a static page.

Stack: DigitalOcean, Terraform, Ansible, Docker, Docker Compose, Docker Hub, React, Express, PostgreSQL.

Code: https://github.com/momomurad/IncidentFlow

Images:
https://hub.docker.com/r/momo1029/task-manager-api
https://hub.docker.com/r/momo1029/incidentflow-user-ui
https://hub.docker.com/r/momo1029/incidentflow-support-ui
https://hub.docker.com/r/momo1029/incidentflow-admin-ui

#DevOps #Terraform #Ansible #Docker #DigitalOcean #CloudComputing #PostgreSQL #Project

# Publishing Files

Use `incidentflow-digitalocean-carousel-v2.pdf` for the LinkedIn document carousel. The matching editable source is `incidentflow-digitalocean-carousel-v2.pptx`.

Suggested document title: IncidentFlow DigitalOcean Proof
