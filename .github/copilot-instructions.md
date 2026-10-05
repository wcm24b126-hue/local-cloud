# GitHub Copilot Instructions for LocalCloud

LocalCloud is a lightweight, fully local Google Cloud Platform (GCP) emulator with a complete web console UI. It runs offline on student machines without billing risk or cloud dependencies.

## Architecture Guidelines

1. **Separation of Concerns:**
   - Keep domain business logic inside `src/server/services/<service>/` as pure TypeScript functions (no Next.js/Vite or UI framework imports).
   - API route handlers and server actions are thin adapters that parse requests, invoke domain services, and return GCP-compatible JSON shapes.
   - UI components live in `src/components/` and consume state via context or typed hooks.

2. **GCP REST API Compatibility:**
   - Emulated REST endpoints must match GCP URL paths:
     - Storage: `/api/gcp/storage/v1/b` (buckets), `/api/gcp/storage/v1/b/{bucket}/o` (objects)
     - Compute: `/api/gcp/compute/v1/projects/{project}/zones/{zone}/instances`
     - IAM: `/api/gcp/iam/v1/projects/{project}/serviceAccounts`
     - Billing: `/api/gcp/cloudbilling/v1/billingAccounts`
   - GCP Error Response Format:
     ```json
     {
       "error": {
         "code": 404,
         "message": "The resource 'projects/my-proj/zones/us-central1-a/instances/vm-1' was not found",
         "status": "NOT_FOUND"
       }
     }
     ```

3. **Operations & State Machine:**
   - Mutations that take time (creating VMs, creating Cloud SQL instances) must return a GCP `Operation` object:
     `{ "id": "operations/op-123", "status": "RUNNING", "progress": 0 }`
   - Progress through states: `PROVISIONING` -> `STAGING` -> `RUNNING` (or `TERMINATED` on delete).

4. **UI & Styling Rules:**
   - Dark theme default matching Google Cloud Console (`#131314` shell, `#202124` header, `#1e1f20` surface, `#0e0e0f` canvas, `#3c4043` border, `#8ab4f8` accent blue).
   - Support light mode via `.light` CSS variables.
   - Use clean unboxed metadata with `·` separators; no arbitrary pill badges.
   - Numbers in tables and metric stats must use `font-mono tabular-nums`.

5. **Security & Offline Guarantee:**
   - Never make external cloud calls or send telemetry.
   - Virtual credits default to $300.00 USD.
   - Service accounts and keys are simulated offline.
