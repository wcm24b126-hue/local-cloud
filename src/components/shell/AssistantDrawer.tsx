import React, { useState } from 'react';
import { Sparkles, X, Copy, Check, Terminal, BookOpen, Code2, HelpCircle } from 'lucide-react';
import { useLocalCloud } from '../../context/LocalCloudContext';

export const AssistantDrawer: React.FC = () => {
  const {
    isAssistantOpen,
    setIsAssistantOpen,
    activeView,
    currentProject,
    setIsCloudShellOpen,
    executeCliCommand,
    showToast,
  } = useLocalCloud();

  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'learn' | 'gcloud' | 'terraform'>('learn');

  if (!isAssistantOpen) return null;

  const copyToClipboard = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    showToast('Copied to clipboard');
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const runCommandInShell = (cmd: string) => {
    setIsCloudShellOpen(true);
    executeCliCommand(cmd);
    showToast(`Ran "${cmd}" in Cloud Shell`);
  };

  // Dynamic learning content depending on active view
  const getContent = () => {
    switch (activeView) {
      case 'billing':
        return {
          title: 'Cloud Billing & Virtual Credits',
          concept:
            'In Google Cloud, resources like VMs and SQL databases cannot be provisioned unless the project is linked to an active Cloud Billing account. LocalCloud gives you $300 in simulated virtual credits so you can practice budgeting without fear of accidental credit card charges.',
          gcloudCommands: [
            `gcloud billing accounts list`,
            `gcloud billing projects link ${currentProject.projectId} --billing-account=01D5B2-99F4A1-7788C3`,
            `gcloud beta billing accounts get-spending-information 01D5B2-99F4A1-7788C3`,
          ],
          terraform: `resource "google_project" "lab_project" {
  name       = "${currentProject.name}"
  project_id = "${currentProject.projectId}"
  billing_account = "01D5B2-99F4A1-7788C3"
}`,
        };
      case 'iam':
        return {
          title: 'Identity and Access Management (IAM)',
          concept:
            'IAM lets you grant granular permissions to specific Google Cloud resources and prevents unwanted access. A "Principal" can be a human user or a Service Account (used by workloads). Roles group permissions into convenient bundles like Viewer, Editor, or Owner.',
          gcloudCommands: [
            `gcloud projects get-iam-policy ${currentProject.projectId}`,
            `gcloud projects add-iam-policy-binding ${currentProject.projectId} --member="user:alice@example.com" --role="roles/viewer"`,
            `gcloud iam service-accounts create my-backend-sa --display-name="Backend API Runner"`,
          ],
          terraform: `resource "google_project_iam_member" "viewer_binding" {
  project = "${currentProject.projectId}"
  role    = "roles/viewer"
  member  = "user:alice@example.com"
}`,
        };
      case 'storage':
      case 'bucket-create':
      case 'bucket-details':
        return {
          title: 'Google Cloud Storage (GCS) & Static Web Hosting',
          concept:
            'GCS Architecture Concepts:\n• Global Namespace: Bucket names must be globally unique across all of Google Cloud.\n• Object Immutability: Objects are immutable; editing uploads a new version.\n• Location Types: Region (low latency, data residency), Dual-region, Multi-region (geo-redundant 99.95% SLA).\n• Storage Classes: Standard (active data/web hosting), Nearline (30-day min), Coldline (90-day min), Archive (365-day min for disaster recovery).\n• Access Control: Uniform bucket-level access (IAM best practice) vs Fine-grained ACLs.\n• Static Web Hosting: Grant "allUsers" the role "roles/storage.objectViewer" and configure website main_page_suffix to "index.html".',
          gcloudCommands: [
            `# 1. Create a public static website bucket`,
            `gsutil mb -p ${currentProject.projectId} -l us-central1 -c standard gs://${currentProject.projectId}-site`,
            `# 2. Upload website files`,
            `gsutil cp index.html gs://${currentProject.projectId}-site/`,
            `gsutil cp 404.html gs://${currentProject.projectId}-site/`,
            `# 3. Grant public read access to allUsers`,
            `gsutil iam ch allUsers:objectViewer gs://${currentProject.projectId}-site`,
            `# 4. Configure website index and error pages`,
            `gsutil web set -m index.html -e 404.html gs://${currentProject.projectId}-site`,
            `# 5. Check bucket web configuration`,
            `gsutil web get gs://${currentProject.projectId}-site`,
          ],
          terraform: `# Terraform HCL: Static Website Hosting on Cloud Storage
resource "google_storage_bucket" "static_website" {
  name          = "${currentProject.projectId}-site"
  location      = "US-CENTRAL1"
  storage_class = "STANDARD"
  force_destroy = true

  uniform_bucket_level_access = true

  website {
    main_page_suffix = "index.html"
    not_found_page   = "404.html"
  }

  cors {
    origin          = ["*"]
    method          = ["GET", "HEAD"]
    response_header = ["*"]
    max_age_seconds = 3600
  }
}

# Public read access for static website hosting
resource "google_storage_bucket_iam_member" "public_read" {
  bucket = google_storage_bucket.static_website.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}

# Upload index.html
resource "google_storage_bucket_object" "index_html" {
  name         = "index.html"
  bucket       = google_storage_bucket.static_website.name
  content_type = "text/html"
  content      = "<html><body><h1>Hello from LocalCloud GCS!</h1></body></html>"
}`,
        };
      case 'apis':
        return {
          title: 'APIs and Services Gating',
          concept:
            'By default in GCP, most APIs are disabled to enforce security and resource governance. Before you can deploy a Cloud Run service or create a Compute Engine VM, the corresponding service API (e.g., compute.googleapis.com) must be enabled.',
          gcloudCommands: [
            `gcloud services list --enabled`,
            `gcloud services enable compute.googleapis.com`,
            `gcloud services enable run.googleapis.com`,
            `gcloud services disable run.googleapis.com`,
          ],
          terraform: `resource "google_project_service" "compute_api" {
  project = "${currentProject.projectId}"
  service = "compute.googleapis.com"
  disable_on_destroy = false
}`,
        };
      default:
        return {
          title: 'LocalCloud Architecture & Labs',
          concept:
            'LocalCloud is your personal, local GCP sandbox. It simulates the Google Cloud Console experience, REST APIs, and command line tools without requiring internet access or billing credentials. Everything persists safely right in your environment.',
          gcloudCommands: [
            `gcloud config get-value project`,
            `gcloud projects list`,
            `gcloud services list --enabled`,
            `gcloud billing accounts list`,
          ],
          terraform: `# LocalCloud Provider configuration
provider "google" {
  project = "${currentProject.projectId}"
  region  = "us-central1"
}`,
        };
    }
  };

  const content = getContent();

  return (
    <aside className="fixed top-12 right-0 bottom-0 z-30 w-80 sm:w-96 bg-[var(--bg-surface)] border-l border-[var(--border-color)] shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="h-12 px-4 border-b border-[var(--border-color)] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[var(--accent-blue)]" />
          <span className="font-semibold text-xs text-[var(--text-primary)]">LocalCloud Assistant</span>
        </div>
        <button
          onClick={() => setIsAssistantOpen(false)}
          className="p-1 rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--card-hover)]"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="px-3 pt-2 border-b border-[var(--border-subtle)] flex items-center gap-1 shrink-0">
        <button
          onClick={() => setActiveTab('learn')}
          className={`px-3 py-1.5 text-xs font-medium rounded-t-lg transition-colors border-b-2 flex items-center gap-1.5 ${
            activeTab === 'learn'
              ? 'border-[var(--accent-blue)] text-[var(--accent-blue)] font-semibold'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>Concepts</span>
        </button>
        <button
          onClick={() => setActiveTab('gcloud')}
          className={`px-3 py-1.5 text-xs font-medium rounded-t-lg transition-colors border-b-2 flex items-center gap-1.5 ${
            activeTab === 'gcloud'
              ? 'border-[var(--accent-blue)] text-[var(--accent-blue)] font-semibold'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>gcloud CLI</span>
        </button>
        <button
          onClick={() => setActiveTab('terraform')}
          className={`px-3 py-1.5 text-xs font-medium rounded-t-lg transition-colors border-b-2 flex items-center gap-1.5 ${
            activeTab === 'terraform'
              ? 'border-[var(--accent-blue)] text-[var(--accent-blue)] font-semibold'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Code2 className="w-3.5 h-3.5" />
          <span>Terraform</span>
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {activeTab === 'learn' && (
          <div className="space-y-3">
            <h3 className="font-semibold text-sm text-[var(--text-primary)]">{content.title}</h3>
            <p className="text-[var(--text-secondary)] leading-relaxed">{content.concept}</p>

            <div className="p-3 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] space-y-2">
              <span className="font-semibold text-xs text-[var(--text-primary)] flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-[var(--accent-blue)]" />
                Student Learning Goal
              </span>
              <p className="text-[11px] text-[var(--text-secondary)]">
                Try interacting with this screen in the console, then use the <strong>gcloud CLI</strong> tab to test the exact same operations via the Cloud Shell terminal below.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'gcloud' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs text-[var(--text-primary)]">Equivalent CLI commands</span>
              <span className="text-[10px] text-[var(--text-muted)]">Click Run to execute</span>
            </div>
            <div className="space-y-2">
              {content.gcloudCommands.map((cmd, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] font-mono text-[11px] space-y-2 group"
                >
                  <div className="text-[var(--text-primary)] break-all">{cmd}</div>
                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-[var(--border-subtle)]">
                    <button
                      onClick={() => copyToClipboard(cmd, idx)}
                      className="px-2 py-0.5 rounded text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--card-hover)] flex items-center gap-1"
                    >
                      {copiedIndex === idx ? (
                        <>
                          <Check className="w-3 h-3 text-[var(--success)]" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => runCommandInShell(cmd)}
                      className="px-2 py-0.5 rounded text-[10px] bg-[var(--accent-blue-bg)] text-[var(--accent-blue)] hover:bg-[var(--accent-blue-border)] flex items-center gap-1 font-semibold"
                    >
                      <Terminal className="w-3 h-3" />
                      <span>Run</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'terraform' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs text-[var(--text-primary)]">Terraform IaC snippet</span>
              <button
                onClick={() => copyToClipboard(content.terraform, 999)}
                className="text-[11px] text-[var(--accent-blue)] hover:underline flex items-center gap-1"
              >
                {copiedIndex === 999 ? <Check className="w-3 h-3 text-[var(--success)]" /> : <Copy className="w-3 h-3" />}
                <span>Copy HCL</span>
              </button>
            </div>
            <pre className="p-3 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] font-mono text-[11px] text-[var(--text-primary)] overflow-x-auto">
              <code>{content.terraform}</code>
            </pre>
          </div>
        )}
      </div>
    </aside>
  );
};
