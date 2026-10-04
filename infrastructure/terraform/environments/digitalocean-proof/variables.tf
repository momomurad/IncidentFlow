variable "project_name" {
  description = "Short name used for DigitalOcean resource names."
  type        = string
  default     = "incidentflow-proof"

  validation {
    condition     = can(regex("^[a-z0-9-]{3,40}$", var.project_name))
    error_message = "project_name must be 3-40 lowercase letters, numbers, or hyphens."
  }
}

variable "region" {
  description = "DigitalOcean region slug. Frankfurt is a good default near Jordan."
  type        = string
  default     = "fra1"
}

variable "droplet_size" {
  description = "Droplet size. 2 GB is the minimum practical size for API, three UIs, PostgreSQL, and Docker."
  type        = string
  default     = "s-1vcpu-2gb"
}

variable "image" {
  description = "DigitalOcean image slug."
  type        = string
  default     = "ubuntu-24-04-x64"
}

variable "ssh_public_key_path" {
  description = "Path to the SSH public key that Terraform uploads to DigitalOcean."
  type        = string
  default     = "~/.ssh/incidentflow_do.pub"
}

variable "ssh_allowed_cidr" {
  description = "CIDR allowed to SSH into the Droplet. Replace with your public IP /32 before apply."
  type        = string
  default     = "0.0.0.0/0"
}

variable "http_allowed_cidrs" {
  description = "CIDRs allowed to reach the IncidentFlow web ports."
  type        = list(string)
  default     = ["0.0.0.0/0", "::/0"]
}

variable "tags" {
  description = "Tags applied to all DigitalOcean resources."
  type        = list(string)
  default     = ["incidentflow", "cloud-proof", "temporary"]
}
