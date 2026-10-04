locals {
  droplet_name = "${var.project_name}-vm"
}

resource "digitalocean_ssh_key" "incidentflow" {
  name       = "${var.project_name}-key"
  public_key = file(pathexpand(var.ssh_public_key_path))
}

resource "digitalocean_droplet" "incidentflow" {
  name       = local.droplet_name
  region     = var.region
  size       = var.droplet_size
  image      = var.image
  ssh_keys   = [digitalocean_ssh_key.incidentflow.fingerprint]
  monitoring = true
  backups    = false
  ipv6       = true
  tags       = var.tags
}

resource "digitalocean_firewall" "incidentflow" {
  name        = "${var.project_name}-firewall"
  droplet_ids = [digitalocean_droplet.incidentflow.id]
  tags        = var.tags

  inbound_rule {
    protocol         = "tcp"
    port_range       = "22"
    source_addresses = [var.ssh_allowed_cidr]
  }

  inbound_rule {
    protocol         = "tcp"
    port_range       = "8084"
    source_addresses = var.http_allowed_cidrs
  }

  inbound_rule {
    protocol         = "tcp"
    port_range       = "8085"
    source_addresses = var.http_allowed_cidrs
  }

  inbound_rule {
    protocol         = "tcp"
    port_range       = "8086"
    source_addresses = var.http_allowed_cidrs
  }

  outbound_rule {
    protocol              = "tcp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "udp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "icmp"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }
}
