output "droplet_id" {
  description = "DigitalOcean Droplet ID."
  value       = digitalocean_droplet.incidentflow.id
}

output "public_ipv4" {
  description = "Public IPv4 address for the IncidentFlow proof VM."
  value       = digitalocean_droplet.incidentflow.ipv4_address
}

output "user_site_url" {
  description = "User reporting site URL."
  value       = "http://${digitalocean_droplet.incidentflow.ipv4_address}:8084"
}

output "support_site_url" {
  description = "Support console URL."
  value       = "http://${digitalocean_droplet.incidentflow.ipv4_address}:8085"
}

output "admin_site_url" {
  description = "Admin dashboard URL."
  value       = "http://${digitalocean_droplet.incidentflow.ipv4_address}:8086"
}

output "ansible_inventory_line" {
  description = "Inventory line to paste into provision/ansible/inventory/digitalocean-proof.ini."
  value       = "incidentflow ansible_host=${digitalocean_droplet.incidentflow.ipv4_address} ansible_user=root ansible_ssh_private_key_file=~/.ssh/incidentflow_do_rsa"
}
