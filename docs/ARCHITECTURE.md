# LocalCloud Architecture Documentation

## Overview

**LocalCloud** is an independent educational project and a fully local Google Cloud Platform (GCP) emulator; it is not affiliated with, sponsored by, or endorsed by Google. It provides both an authentic, high-fidelity Google Cloud Console web interface and GCP-compatible REST/CLI endpoints so learners can develop cloud engineering skills with zero risk, zero credit card requirements, and zero cloud billing surprises.

---

## 1. Core Principles

- **Zero Cloud Dependency:** Everything runs locally on student hardware (8 GB RAM target).
- **Look-alike Console Fidelity:** The web console mirrors the navigation, layout, flyout menus, and workflows of Google Cloud Console (dark/light themes).
- **Educational Gating:** Like real GCP, paid compute services require an active Cloud Billing account, and disabled APIs must be activated before their endpoints can be used.
- **Auditability:** Every mutation writes to an Audit Log stream, mirroring Cloud Audit Logs.

---

## 2. Phase 1 Implementation Architecture

### A. Resource Manager & Projects
- Projects are the top-level container for all cloud resources.
- Default project: `optical-order-460008-i6` (Number: `460008`, Name: `My First Project`).
- Project Selector allows creating new projects and switching active context across the entire console.

### B. Cloud Billing & Virtual Quotas
- Every user starts with a simulated **My Billing Account** loaded with **$300.00 in virtual credits**.
- Resources check billing linkage before provisioning.
- Real-time simulation of virtual consumption teaches cost awareness and budget planning.

### C. Identity and Access Management (IAM)
- Principals: Human user accounts and workload Service Accounts (`*.gserviceaccount.com`).
- Predefined Roles: `roles/owner`, `roles/editor`, `roles/viewer`, `roles/compute.admin`, `roles/storage.admin`, `roles/bigquery.admin`.
- Key Generation: Generates and downloads standard GCP service account JSON credential files.

### D. APIs and Services Gating
- Services like Compute Engine (`compute.googleapis.com`), Storage (`storage.googleapis.com`), and Cloud Run (`run.googleapis.com`) can be toggled on/off in the API Library.
- Attempting to use a disabled service prompts the learner to enable it first.

### E. Interactive Cloud Shell & CLI
- In-browser terminal docked at bottom of screen.
- Emulates `gcloud` and `gsutil` commands:
  - `gcloud projects list`
  - `gcloud config set project <ID>`
  - `gcloud billing accounts list`
  - `gcloud iam service-accounts list`
  - `gcloud services list --enabled`
  - `gcloud services enable <API>`
  - `gcloud compute instances list`
  - `gsutil ls`

---

## 3. Phase 2 Architecture: Cloud Storage

- **Buckets & Objects**: Full bucket hierarchy with region types, storage classes (`STANDARD`, `NEARLINE`, `COLDLINE`, `ARCHIVE`), and access control (`UNIFORM` vs `FINE_GRAINED`).
- **Bucket Tabs**: Objects browser with virtual folder hierarchy, Configuration, IAM Permissions, and Lifecycle Rules.
- **File Upload / Download**: Drag-and-drop object upload, base64 content persistence, and one-click downloading.
- **GCS JSON API**: Endpoints conforming to `/api/gcp/storage/v1` (`listBuckets`, `getBucket`, `insertBucket`, `deleteBucket`, `listObjects`, `insertObject`, `deleteObject`).
- **gsutil Commands**: Interactive CLI commands for `gsutil ls`, `gsutil mb`, `gsutil cp`, and `gsutil rm`.

---

## 4. Phase 3 Architecture: Compute Engine & VPC Network

### A. Long-Form Instance Creator
- Full recreation of Google Cloud Console "Create an instance" flow:
  - Instance name with RFC 1035 format validation and description.
  - Multi-region & multi-zone selection with independent failure domains.
  - Machine families (*General-purpose*, *Compute-optimized*, *Memory-optimized*) and series (*E2*, *N2*, *C2*, *M2*) with dynamic vCPU and RAM allocation.
  - Boot disk configurator with OS images (Debian 12, Ubuntu 22.04 LTS, RHEL 9, Rocky 9, Windows Server 2022) and disk types (`pd-standard`, `pd-balanced`, `pd-ssd`).
  - Firewall toggle checkboxes for port 80 (HTTP) and port 443 (HTTPS), with network tags and service accounts.

### B. Live Cost Estimate Engine
- Sticky sidebar calculating real-time monthly and hourly costs based on machine tier and persistent storage size.
- Automatic **Free Tier Eligible** badge for `e2-micro` instances in US regions.
- Costs automatically deduct from the project's virtual billing account balance.

### C. Operations Pattern & State Machine
- Asynchronous worker simulating standard GCP operation progress:
  `PROVISIONING` (0–1.5s) → `STAGING` (1.5–3.5s) → `RUNNING`.
- Complete instance lifecycle management: Start, Stop (`TERMINATED`), Reset (`REPAIRING`), and Delete.
- Operation resources created under `operations/op-vm-*` and recorded in the audit log.

### D. VM Details & Observability
- Hardware and networking overview (internal IP, external IP, NAT configs).
- Live monitoring charts (CPU utilization %, network throughput KiB/s, disk IOPS).
- Serial Port 1 (Console) tab streaming simulated Linux kernel boot sequence and systemd daemon startup.
- In-browser simulated SSH terminal directly integrated into the Cloud Shell drawer via `gcloud compute ssh`.

### E. VPC Networks & Distributed Firewalls
- Auto-mode VPC network with multi-region subnets (`us-central1`, `us-east1`, `europe-west1`, `asia-east1`) and CIDR blocks.
- Stateful firewall rules table with direction (`INGRESS`/`EGRESS`), priorities (1-65535), target tags, and source IP ranges.
- Interactive modal to provision custom firewall rules.

### F. Optional Docker Engine Backend (`ENABLE_DOCKER_BACKEND`)
- Toggle switch in UI and backend flag to map virtual machines to lightweight local Docker containers with port forwarding, falling back gracefully to simulator mode when Docker is unavailable.

---

## 5. Phase 5 Architecture: Pub/Sub & Cloud Run

### A. Cloud Pub/Sub
- **Topics & Subscriptions**:
  - Full topic creation with configurable message retention (1-31 days).
  - Subscriptions with **PULL** or **PUSH** delivery types, configurable acknowledgment deadlines (10-600s), and retention policies.
- **Publishing Engine**:
  - Interactive publishing interface supporting formatted JSON and raw payloads.
  - Custom key-value attribute mapping and optional ordering keys.
- **Pull & Acknowledgment Workflows**:
  - In-console message puller retrieving unacknowledged items from the subscription backlog.
  - Per-message **ACK** (acknowledge and purge) and **NACK** (re-queue with attempt counter) controls.
- **Dead-Letter Queue (DLQ) Automation**:
  - Subscriptions configure maximum delivery attempt thresholds (5-100) and designated dead-letter topics.
  - When messages exceed maximum delivery attempts via NACKs, LocalCloud automatically moves them to the Dead-Letter Queue and logs a warning audit event.

### B. Cloud Run (Serverless Microservices)
- **Deployment Wizard**:
  - Deploy from container images (e.g., `gcr.io/google-samples/hello-app:1.0`) or directly from **inline Node.js (Express)** or **Python (Flask)** source code.
  - Regional placement (`us-central1`, `us-east1`, `europe-west1`, `asia-east1`) with automated vanity URLs (`https://<service>-<project>-<reg>.a.run.app`).
  - Autoscaling controls with **scale-to-zero** (min: 0, max: 10) and hardware configuration (vCPU and Memory allocation).
- **Reverse Proxy Invocations Engine**:
  - Local proxy emulator with HTTP method selection (GET, POST, PUT, DELETE), custom endpoints (`/`, `/healthz`, `/echo`), headers, and request body payloads.
  - Live response inspector displaying status codes, round-trip latency (ms), and JSON body output.
  - Visual scale-from-zero instance activation during invocations.
- **Revisions & Structured Logging**:
  - Revision history tracking traffic allocations and source configurations.
  - Live structured request logs with severity levels (INFO, WARNING, ERROR), HTTP status, latency, and container stdout/stderr.

---

## 6. Phase 6 Architecture: Observability, Secret Manager & BigQuery-lite

### A. Secret Manager
- **Centralized Secrets Vault**:
  - Securely store API tokens, database connection strings, and certificates with version history.
  - Create, view, add versions (rotated credentials), and destroy secret versions.
  - Masked secret payload display with one-click eye toggle to reveal or copy values.
  - Audit logging of all secret creation and version additions.

### B. BigQuery Studio (BigQuery-lite)
- **Explorer Tree**:
  - Navigable project and dataset hierarchy (`billing_export`, `app_telemetry`).
  - Table schema viewer with field types and nullable/required modes.
- **In-Browser SQL Query Engine**:
  - ANSI SQL query execution supporting `SELECT`, `WHERE`, `ORDER BY`, `GROUP BY`, `LIMIT`, and `count(*)`.
  - Live query syntax validator estimating bytes processed before execution.
  - Results grid with execution latency (ms), byte measurements, and one-click **Export to CSV / JSON**.
  - Query History tab recording past queries.

### C. Logs Explorer (Cloud Logging)
- **Unified Log Feed**:
  - Aggregates Cloud Audit Logs and Cloud Run application logs into a real-time searchable stream.
  - Resource filters (Cloud Run, Compute Engine, GCS, Pub/Sub, IAM) and Severity filters (INFO, WARNING, ERROR).
  - Expandable structured JSON payload viewer with copy support.
  - Streaming mode toggle.

---

## 7. Upcoming Phases

- **Phase 4: Cloud SQL**: Managed relational databases, instances, users, backups.
