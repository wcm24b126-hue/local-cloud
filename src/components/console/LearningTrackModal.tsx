import React, { useState } from 'react';
import { X, CheckCircle2, Circle, ArrowRight, Sparkles, BookOpen, Terminal, Code2 } from 'lucide-react';
import { useLocalCloud } from '../../context/LocalCloudContext';

interface LearningTrackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LearningTrackModal: React.FC<LearningTrackModalProps> = ({ isOpen, onClose }) => {
  const { setActiveView } = useLocalCloud();
  const [completedLabs, setCompletedLabs] = useState<string[]>(['lab-1']);

  if (!isOpen) return null;

  const labs = [
    {
      id: 'lab-1',
      title: 'Lab 1: Project Hierarchy & Configuration',
      summary: 'Learn how Google Cloud structures organizations, folders, and projects. Use gcloud config and the project picker.',
      steps: [
        'Explore the active project "My First Project" (optical-order-460008-i6)',
        'Open Cloud Shell and run: gcloud projects list',
        'Create a new project using the project selector in top bar',
      ],
      targetView: 'home',
      targetTitle: 'Welcome',
    },
    {
      id: 'lab-2',
      title: 'Lab 2: Cloud Billing & Quotas',
      summary: 'Understand why paid cloud services require an attached billing account, and manage your $300 virtual credit balance.',
      steps: [
        'Navigate to Billing Overview',
        'Observe virtual free credit balance and consumption simulation',
        'Practice linking and unlinking billing for your projects',
      ],
      targetView: 'billing',
      targetTitle: 'Billing',
    },
    {
      id: 'lab-3',
      title: 'Lab 3: IAM Least Privilege & Service Accounts',
      summary: 'Master GCP access control. Grant roles, create workload service accounts, and download credentials keys.',
      steps: [
        'Open IAM & Admin > Permissions',
        'Click "Grant access" and assign Viewer or Compute Admin role to a new principal',
        'Create a new Service Account and download its JSON credentials file',
      ],
      targetView: 'iam',
      targetTitle: 'IAM & Admin',
    },
    {
      id: 'lab-4',
      title: 'Lab 4: APIs and Services Enablement',
      summary: 'Understand service activation gating and how GCP shuts down unused endpoints for security.',
      steps: [
        'Navigate to APIs & Services > Library',
        'Search for Compute Engine API or Cloud Run API',
        'Toggle APIs on and off and observe the live audit logs',
      ],
      targetView: 'apis',
      targetTitle: 'APIs & Services',
    },
    {
      id: 'lab-5',
      title: 'Lab 5: Static Website on Cloud Storage',
      summary: 'Create a Cloud Storage bucket, upload index.html and assets, configure object lifecycle rules, and make objects public for static web hosting.',
      steps: [
        'Go to Cloud Storage > Buckets',
        'Create a new bucket with Standard storage class and Uniform access control',
        'Upload index.html and style assets via drag-and-drop',
        'Grant Storage Object Viewer to "allUsers" to enable public internet viewing',
        'Configure a 365-day lifecycle expiration rule',
      ],
      targetView: 'storage',
      targetTitle: 'Cloud Storage',
    },
    {
      id: 'lab-6',
      title: 'Lab 6: Serverless Architecture with Cloud Run & Pub/Sub',
      summary: 'Build an asynchronous event-driven system: publish orders to a Pub/Sub topic and process them via Cloud Run microservices.',
      steps: [
        'Create a Pub/Sub topic "order-events" and attach a pull subscription with dead-letter forwarding',
        'Deploy a serverless HTTP service on Cloud Run with scale-to-zero autoscaling',
        'Publish test JSON order payloads using the interactive Pub/Sub message builder',
        'Test invoking the Cloud Run microservice through the local reverse proxy endpoint (/api/run/...)',
      ],
      targetView: 'run',
      targetTitle: 'Cloud Run',
    },
    {
      id: 'lab-7',
      title: 'Lab 7: Cloud Observability, Secret Manager & BigQuery',
      summary: 'Securely manage API credentials with Secret Manager, query analytical datasets in BigQuery, and monitor logs in Logs Explorer.',
      steps: [
        'Store database passwords and API tokens securely in Secret Manager with version history',
        'Write and execute SQL queries on billing data in the BigQuery Studio workspace',
        'Filter audit trails and container logs in real-time with the Logs Explorer',
      ],
      targetView: 'bigquery',
      targetTitle: 'BigQuery',
    },
  ];

  const toggleLabComplete = (labId: string) => {
    setCompletedLabs(prev =>
      prev.includes(labId) ? prev.filter(id => id !== labId) : [...prev, labId]
    );
  };

  const handleLaunchLab = (lab: (typeof labs)[0]) => {
    setActiveView(lab.targetView, lab.targetTitle, 'Lab');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity" onClick={onClose} />

      <div className="relative z-10 w-full max-w-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--border-color)] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[var(--accent-blue-bg)] border border-[var(--accent-blue-border)] text-[var(--accent-blue)]">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                LocalCloud Learning Track
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Hands-on Google Cloud Platform fundamentals without real billing risk
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--card-hover)]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Labs List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
          {labs.map((lab, idx) => {
            const isDone = completedLabs.includes(lab.id);
            return (
              <div
                key={lab.id}
                className={`p-4 rounded-xl border transition-all ${
                  isDone
                    ? 'bg-[var(--bg-canvas)] border-[var(--border-color)]'
                    : 'bg-[var(--bg-surface)] border-[var(--border-color)] hover:border-[var(--accent-blue-border)]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => toggleLabComplete(lab.id)}
                      className="mt-0.5 text-[var(--text-muted)] hover:text-[var(--accent-blue)] transition-colors"
                      title={isDone ? 'Mark as incomplete' : 'Mark as completed'}
                    >
                      {isDone ? (
                        <CheckCircle2 className="w-5 h-5 text-[var(--success)]" />
                      ) : (
                        <Circle className="w-5 h-5" />
                      )}
                    </button>
                    <div className="space-y-1">
                      <h3 className={`font-semibold text-sm ${isDone ? 'line-through text-[var(--text-secondary)]' : 'text-[var(--text-primary)]'}`}>
                        {lab.title}
                      </h3>
                      <p className="text-[var(--text-secondary)] leading-relaxed">
                        {lab.summary}
                      </p>

                      <div className="pt-2 space-y-1">
                        <span className="font-semibold text-[11px] text-[var(--text-primary)]">Objectives:</span>
                        <ul className="list-disc list-inside space-y-0.5 text-[11px] text-[var(--text-muted)]">
                          {lab.steps.map((st, sidx) => (
                            <li key={sidx}>{st}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleLaunchLab(lab)}
                    className="px-3 py-1.5 rounded-lg bg-[var(--accent-blue-bg)] hover:bg-[var(--accent-blue-border)] text-[var(--accent-blue)] font-semibold text-xs whitespace-nowrap flex items-center gap-1.5 transition-colors shrink-0"
                  >
                    <span>Launch</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[var(--border-color)] bg-[var(--bg-canvas)] flex items-center justify-between text-xs text-[var(--text-muted)]">
          <span>{completedLabs.length} of {labs.length} labs completed</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[var(--accent-blue)] text-black font-semibold hover:bg-[var(--accent-hover)] transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};
