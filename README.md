# LocalCloud ☁️

> A lightweight, fully local Google Cloud Platform (GCP) emulator with a complete web console UI for students, developers, and educators.

---

## 🚀 Quick Start

### 1. Requirements
- Node.js 22 LTS
- pnpm (`corepack enable && corepack prepare pnpm@latest --activate`)

No Docker, container runtime, or cloud account is required. LocalCloud is a
simulation: it never launches containers and never calls a Google Cloud API.

### 2. Run LocalCloud
```bash
# Install dependencies
pnpm install

# Start the console dev server (Vite middleware + API)
pnpm dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

### 3. Production build
```bash
pnpm build   # bundles the client into dist/
pnpm start   # serves dist/ and the API from Express
```

### 4. Tests
```bash
pnpm typecheck   # tsc --noEmit
pnpm test        # Vitest unit + integration tests
pnpm test:e2e    # Playwright browser tests
```

---

## ✨ What's in Phase 0 + Phase 1

1. **Complete Google Cloud Console Web Shell (`AppShell`):**
   - **Top bar:** Hamburger menu, LocalCloud logo (cloud glyph in 4 Google palette colors), Project Selector pill, wide centered global search bar (`/` shortcut), Gemini-style Assistant panel button, Cloud Shell terminal icon, Notifications bell, Theme toggle (Dark default & Light), User profile menu.
   - **Navigation Drawer:** Pinned top group (*Cloud Hub*, *Cloud overview*, *Solutions*, *Recently visited*), Favourites with persistent star toggles, All Products list with flyout submenus, "View all products" and "Get API key" buttons.
   - **Inset Page Canvas:** Large rounded-corner dark surface matching Google Cloud Console.

2. **Home / Welcome Page (Pixel-close reproduction of Screenshot 1):**
   - Project info with Project Number (`460008`) and Project ID (`optical-order-460008-i6`) + copy-to-clipboard icons.
   - Outlined quick-action buttons with `+` icon (*Create a VM*, *Create a storage bucket*, *Run a query in BigQuery*, *Deploy an application*, *Create an agent*, *Create API key*).
   - Decorative geometric shapes (blue dot, green blob, yellow dot, red dot, triangle outline).
   - Promo card: "Join the LocalCloud learning track" with interactive labs checklist modal.
   - Quick access grid (4 columns × 2 rows): APIs & services, IAM & admin, Billing, Compute Engine, Cloud Storage, BigQuery, VPC network, Kubernetes Engine.

3. **Cloud Billing & Virtual Credits Simulator:**
   - Account overview ("My Billing Account") with **$300.00 virtual free credit balance**.
   - Project billing linkage: gating paid services like Compute Engine until billing is enabled.
   - Live cost simulation and credit top-up tool.

4. **IAM & Admin:**
   - Permissions / Members table with role chips and revoke actions.
   - "Grant access" modal with categorized role selector (Owner, Editor, Viewer, Compute Admin, Storage Admin, BigQuery Admin).
   - Service Accounts management + downloadable simulated JSON credential keys.
   - Real-time Cloud Audit Logs stream.

5. **APIs & Services:**
   - Enabled APIs dashboard with simulated traffic chart.
   - API Library with search, category filtering, and one-click Enable / Disable toggles.

6. **Interactive Cloud Shell Terminal:**
   - In-browser terminal docked at bottom with command history (Up/Down arrow).
   - Supports: `gcloud projects list`, `gcloud config set project`, `gcloud services enable/disable`, `gcloud billing accounts list`, `gcloud iam service-accounts list`, `gcloud compute instances list/create/start/stop/delete/describe`, `gcloud compute ssh`, `gcloud compute networks list`, `gcloud compute firewall-rules list`, `gsutil ls`, `gsutil mb`, `gsutil cp`, `gsutil rm`, `help`, `clear`.

---

## 📦 Phase 2: Cloud Storage
- **Storage Buckets List & Creation:** Multi-step wizard (name, location type, storage class `STANDARD`/`NEARLINE`/`COLDLINE`/`ARCHIVE`, access control, public access prevention).
- **Bucket Details:** Objects browser with folder simulation, Configuration, IAM Permissions, Lifecycle Rules.
- **Object Upload & Download:** Drag-and-drop file upload with MD5 hashes and instant download.
- **GCS JSON API:** Local REST compatibility engine at `/api/gcp/storage/v1`.

---

## ⚡ Phase 3: Compute Engine & VPC Network
- **Create an Instance Page:** Full recreation of Google Cloud Console form with name validation, multi-zone selection, machine families (*General-purpose*, *Compute-optimized*, *Memory-optimized*), machine types (`e2-micro`, `e2-small`, `e2-medium`, `e2-standard-2`, etc.), boot disk selector (Debian 12, Ubuntu 22.04 LTS, RHEL 9, Rocky 9, Windows Server 2022), persistent disk types (`pd-standard`, `pd-balanced`, `pd-ssd`), and firewall checkboxes (HTTP/HTTPS).
- **Live Sticky Cost Sidebar:** Real-time monthly and hourly cost estimate with Free Tier callout badge and virtual billing account charge calculation.
- **VM State Machine & Operations Engine:** Simulated background worker cycling instances through `PROVISIONING` → `STAGING` → `RUNNING`, with full Start, Stop, Reset, and Delete operations.
- **VM Details & Observability:** Detailed hardware specs, real-time SVG monitoring charts (CPU %, Network KiB/s, Disk IOPS), Serial Port 1 console boot log streaming, and one-click in-browser SSH terminal via Cloud Shell.
- **VPC Networks & Firewalls:** Auto-mode networks, regional subnets, distributed firewall rule inspection and custom firewall rule creation modal.
- **Simulation-only by construction:** there is no container backend. `ENABLE_DOCKER_BACKEND` is accepted and ignored, with a one-time warning.

---

## 📬 Phase 5: Pub/Sub & Cloud Run
- **Cloud Pub/Sub Messaging:**
  - Topic creation with message retention configuration.
  - Subscriptions with PULL and PUSH delivery, acknowledgment deadlines, and Dead-Letter Queue (DLQ) integration.
  - Interactive **Publish Message UI** with custom attributes and ordering keys.
  - In-console **PULL & ACK/NACK Engine**: pulls unacknowledged messages, supports single-click ACK (removal) or NACK (retry), and automatically forwards poison messages exceeding delivery thresholds to the dead-letter topic.
  - Cloud Shell CLI: `gcloud pubsub topics list/create/delete/publish` and `gcloud pubsub subscriptions list/create/pull`.
- **Cloud Run Serverless Compute:**
  - Deploy services from Docker container images or directly from **inline Node.js (Express)** or **Python (Flask)** source code.
  - Autoscaling with true **scale-to-zero** (min: 0, max: 10) and instant activation.
  - Interactive **Local Reverse Proxy & Invocations Console**: sends HTTP requests (GET, POST, PUT, DELETE) with path parameters, headers, and payload to live container/microservice handlers, returning formatted responses and latency.
  - **Revisions & Structured Logs**: revision history with traffic splits and structured request logs.
  - Cloud Shell CLI: `gcloud run services list/describe/delete` and `gcloud run deploy`.

---

## 🔍 Phase 6: Observability, Secret Manager & BigQuery-lite
- **Secret Manager:**
  - Secure credential vault with automatic replication.
  - Multi-version management (rotation, destroy, enable).
  - Masked values with eye-reveal toggles and copy-to-clipboard.
  - Cloud Shell CLI: `gcloud secrets list/create` and `gcloud secrets versions access latest --secret=<NAME>`.
- **BigQuery Studio (BigQuery-lite):**
  - Dataset and table Explorer hierarchy (`billing_export`, `app_telemetry`).
  - Interactive SQL query editor with ANSI SQL parsing and query cost validation.
  - Tabular results viewer with execution metrics and instant **Export to CSV / JSON**.
  - Cloud Shell CLI: `bq ls` and `bq query "<SQL>"`.
- **Logs Explorer & Cloud Observability:**
  - Aggregated real-time stream of audit trails and container logs.
  - Filter by Resource, Severity (INFO, WARNING, ERROR), and full-text search.
  - Structured JSON payload expander.
- **Educational Support Updates:**
  - LocalCloud Assistant drawer updated with GCS architecture concepts, gsutil cheat sheets, and Terraform HCL snippets for static website hosting.
  - Learning track updated with Lab 5 (Static Website on Cloud Storage), Lab 6 (Serverless Event Architecture with Cloud Run & Pub/Sub), and Lab 7 (Observability, Secrets & BigQuery).

---

## 🧪 Networking Lab (Phase 7)

A pure-function simulator of GCP VPC networking, living entirely in `src/sim/`.
It has no I/O: every operation is a reducer over an immutable `SimState`, so the
same code drives the UI, the Cloud Shell commands, and the tests.

### What you can do
- **VPC networks, subnetworks, VM instances, persistent disks, routes, load balancers
  and firewall policies** with real dependency validation (deleting a VPC offers a
  cascade; deleting a subnet holding VMs is refused with a reason).
- **Packet tracer:** send a packet between any two addresses and see every hop.
- **Topology graph:** nodes are laid out from the live state, coloured by type, with
  firewall policy targets drawn as rings.
- **Guided lab:** a four-step exercise with progress that survives a reload.
- **Simulated Cloud Shell:** `gcloud` commands operate on lab state, and
  `gcloud compute ssh`/`scp` are explicitly refused because nothing is really executed.

### Address allocation
`10.0.1.0/24` is allocated as: network `.0` (not assignable), gateway `.1`,
then hosts from `.2` upwards. Subnet capacity is reported as *usable* hosts
(253 for a `/24`), excluding network, gateway and broadcast. The bundled sample
network therefore produces `10.0.1.2`, `10.0.2.2`, `10.0.3.2` for `web-1`, `app-1`
and `db-1`.

### How a packet is evaluated
`evaluatePacket()` in `src/sim/packetTracer.ts` is a single deterministic function:

1. **Resolve** the destination against load balancer frontends, then VM internal
   and external IPs.
2. **Select a route** with longest-prefix matching. Implicit local routes exist for
   every attached subnet, so a VM always has a route to its own subnet. VPC peering
   and custom routes are matched by `0.0.0.0/0` default route.
3. **Deny by default** at ingress. Only firewall rules attached to the target
   subnet are consulted; the highest-priority matching rule wins, and an explicit
   deny beats an allow. Because the database rule allows only `10.0.2.0/24`, `app-1`
   reaches `db-1` while `web-1` is blocked.
4. **Evaluate egress rules** on the source subnet for ICMP error replies only, then
   record the hop-by-hop result with a human-readable reason for each decision.

Because it is a pure function, the same trace is produced in the browser, in a
unit test, and from the shell.

### Sample network
`demo-vpc` with three tiers, wired so the four demo packets disagree on purpose:

| Resource | Value |
| --- | --- |
| Subnetworks | `web-subnet` `10.0.1.0/24`, `app-subnet` `10.0.2.0/24`, `db-subnet` `10.0.3.0/24` |
| VMs | `web-1` (`10.0.1.2`, external `34.72.0.1`), `app-1` (`10.0.2.2`), `db-1` (`10.0.3.2`) |
| Load balancer | `web-lb`, external HTTP on port 80, backend `web-1` |
| Firewall | `web-nsg` (allow 80 from anywhere, SSH from an office range, deny rest), `db-nsg` (allow 5432 from `10.0.2.0/24`, the app tier, only) |

The four canonical traces live in `EXPECTED_TRACES` (`src/sim/seed.ts`) and are
offered as one-click presets in the packet tracer and the guided lab.

### Persistence
`localStorage` is the default and always works, so the lab needs zero setup. Setting
`DATABASE_URL` on the server additionally mirrors the state to Postgres so a lab
survives a browser change or a different machine.

- The browser never sees `DATABASE_URL`; it asks the same-origin
  `/api/netlab/state` route which backend is active and only mirrors when the answer
  is `postgres`.
- State is stored as one versioned JSONB row. A corrupt or unknown-version payload is
  discarded rather than crashing the app on boot.
- With no database the route still responds with JSON, so the client can distinguish
  "no persistence configured" from "endpoint missing".

### Simulated Cloud Shell
`gcloud` commands for the lab are parsed and executed against `SimState`; nothing is
passed to a shell.

```bash
gcloud compute networks list
gcloud compute networks create demo-vpc --subnet-mode=custom
gcloud compute networks subnets create web-subnet --network=demo-vpc --range=10.0.1.0/24 --region=us-central1
gcloud compute instances create web-1 --subnet=web-subnet --external-ip
gcloud compute routes list
gcloud compute forwarding-rules list
gcloud compute firewall-rules describe web-nsg
gcloud compute networks topologies export demo-vpc   # indented tree
lc lab sample        # load the sample network
lc lab reset         # clear the lab
lc lab verify-traces # self-check the four demo packets against their expectations
```

Errors mimic gcloud: the operation appears as `ERROR:` and the cause as `HINT:`.

---

## ⚙️ Environment variables

All values are optional.

| Variable | Default | Effect |
| --- | --- | --- |
| `ENABLE_DOCKER_BACKEND` | `false` | Accepted and ignored; prints a warning. The lab never launches containers. |
| `ENABLE_CLOUD_SHELL` | `true` | Whether the simulated Cloud Shell is available. |
| `ENABLE_LAB` | `true` | Whether the guided lab and sample-network helpers are available. |
| `SIMULATION_SPEED` | `1.0` | Multiplier for lifecycle delays and tracer hops, clamped to `0.1`–`10`. |
| `DATABASE_URL` | unset | Enables server-side Postgres mirroring. Server-only; never bundled. |
| `PORT` | `3000` | Port the Express server listens on. |
| `DISABLE_HMR` | `false` | Disable the Vite HMR websocket (useful in containers). |
| `APP_URL` | `http://localhost:3000` | Display only. |

The unprefixed flag names are exposed to the client deliberately: `vite.config.ts`
extends `envPrefix` so `import.meta.env.ENABLE_CLOUD_SHELL` and friends resolve
without renaming them.

---

## 🔒 Safety model

The lab is an emulator for learning, so "it never touches your machine" is a
requirement rather than a nice-to-have.

- **No process execution.** No `child_process`, `exec`, or `spawn` anywhere in `src/`.
- **No containers.** The Docker backend was removed; the flag is ignored with a warning.
- **No external requests.** The only two `fetch()` call sites are same-origin
  relative paths: `/api/netlab/state` and the `/api/run/...` Cloud Run proxy.
  `googleapis.com` strings elsewhere are display fields (`selfLink`, `targetLink`),
  not requests.
- **No secrets in the browser.** `DATABASE_URL` is read only by the Express server.
- **Verified by capture.** Running the production build under
  `tshark -i lo` while exercising the tracer and the shell produced only loopback
  conversations and no DNS or external connections.

`pnpm audit --audit-level=low` reports no known vulnerabilities.

> Exact parity with the live GCP Console has not been machine-verified, because
> `console.cloud.google.com` requires an authenticated account. The emulator is
> modelled on documented GCP behaviour rather than on a captured session.

---

## ⚖️ Legal & Educational Disclaimer

*LocalCloud is an educational emulator. It is not affiliated with, sponsored by, or endorsed by Google LLC. All trademarks and brand names are the property of their respective owners.*
