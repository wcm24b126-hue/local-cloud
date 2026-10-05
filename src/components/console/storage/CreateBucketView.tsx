import React, { useState } from 'react';
import {
  Archive,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Shield,
  Layers,
  Lock,
  Globe,
  Info,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { useLocalCloud } from '../../../context/LocalCloudContext';
import { LocationType, StorageClass, AccessControl } from '../../../types';

export const CreateBucketView: React.FC = () => {
  const { createBucket, setActiveView, currentProject } = useLocalCloud();

  // Active step (1 to 5)
  const [activeStep, setActiveStep] = useState<number>(1);

  // Form State
  const [bucketName, setBucketName] = useState<string>('');
  const [locationType, setLocationType] = useState<LocationType>('Region');
  const [location, setLocation] = useState<string>('us-central1');
  const [storageClass, setStorageClass] = useState<StorageClass>('STANDARD');
  const [accessControl, setAccessControl] = useState<AccessControl>('UNIFORM');
  const [publicAccessPrevention, setPublicAccessPrevention] = useState<boolean>(false);
  const [versioning, setVersioning] = useState<boolean>(false);
  const [hasRetention, setHasRetention] = useState<boolean>(false);
  const [retentionDays, setRetentionDays] = useState<number>(30);
  const [encryption, setEncryption] = useState<string>('Google-managed');

  // Name Validation
  const validateBucketName = (name: string): string | null => {
    if (!name) return 'Bucket name is required';
    if (name.length < 3) return 'Bucket name must be at least 3 characters long';
    if (name.length > 63) return 'Bucket name must be at most 63 characters long';
    if (!/^[a-z0-9]/.test(name)) return 'Bucket name must start with a lowercase letter or number';
    if (!/[a-z0-9]$/.test(name)) return 'Bucket name must end with a lowercase letter or number';
    if (/[^a-z0-9.-]/.test(name)) return 'Bucket name may only contain lowercase letters, numbers, hyphens, and dots';
    if (name.includes('..') || name.includes('.-') || name.includes('-.')) return 'Bucket name cannot contain consecutive dots or hyphens adjacent to dots';
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(name)) return 'Bucket name cannot be formatted as an IP address';
    if (name.startsWith('goog') || name.includes('google')) return 'Bucket names cannot start with "goog" or contain "google"';
    return null;
  };

  const nameError = validateBucketName(bucketName);

  const regionOptions = [
    { id: 'us-central1', name: 'us-central1 (Iowa)', region: 'Americas' },
    { id: 'us-east1', name: 'us-east1 (South Carolina)', region: 'Americas' },
    { id: 'us-west1', name: 'us-west1 (Oregon)', region: 'Americas' },
    { id: 'europe-west1', name: 'europe-west1 (Belgium)', region: 'Europe' },
    { id: 'asia-east1', name: 'asia-east1 (Taiwan)', region: 'Asia-Pacific' },
  ];

  const handleStepContinue = (stepNum: number) => {
    setActiveStep(Math.min(5, stepNum + 1));
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (nameError) return;

    createBucket({
      name: bucketName,
      location,
      locationType,
      storageClass,
      accessControl,
      publicAccessPrevention,
      isPublic: !publicAccessPrevention,
      versioning,
      encryption,
      retentionDays: hasRetention ? retentionDays : undefined,
    });

    setActiveView('storage', 'Buckets', 'Cloud Storage');
  };

  const getEstimatedCost = () => {
    switch (storageClass) {
      case 'STANDARD':
        return '$0.020 per GB / month';
      case 'NEARLINE':
        return '$0.010 per GB / month';
      case 'COLDLINE':
        return '$0.004 per GB / month';
      case 'ARCHIVE':
        return '$0.0012 per GB / month';
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-150">
      {/* Back and Page Title */}
      <div className="flex items-center gap-3 pb-2 border-b border-[var(--border-color)]">
        <button
          onClick={() => setActiveView('storage', 'Buckets', 'Cloud Storage')}
          className="p-1.5 rounded-full hover:bg-[var(--card-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-[var(--text-primary)]">
            Create a bucket
          </h1>
          <p className="text-xs text-[var(--text-secondary)]">
            Store unstructured data objects in Google Cloud Storage
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Wizard Form Steps (Left 2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          <form onSubmit={handleCreate} className="space-y-4">
            {/* STEP 1: Name your bucket */}
            <div className="border border-[var(--border-color)] rounded-2xl bg-[var(--bg-surface)] overflow-hidden shadow-sm">
              <div
                onClick={() => setActiveStep(1)}
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-[var(--card-hover)] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    bucketName && !nameError
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                      : 'bg-[var(--accent-blue-bg)] text-[var(--accent-blue)] border border-[var(--accent-blue-border)]'
                  }`}>
                    {bucketName && !nameError ? <CheckCircle2 className="w-4 h-4" /> : '1'}
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-[var(--text-primary)]">
                      Name your bucket
                    </h3>
                    {bucketName && activeStep !== 1 && (
                      <span className="text-xs font-mono text-[var(--accent-blue)]">
                        gs://{bucketName}
                      </span>
                    )}
                  </div>
                </div>
                {activeStep === 1 ? <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" /> : <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />}
              </div>

              {activeStep === 1 && (
                <div className="p-5 pt-0 border-t border-[var(--border-subtle)] space-y-4 text-xs">
                  <div className="space-y-1.5 pt-4">
                    <label className="block font-semibold text-[var(--text-primary)]">
                      Bucket name *
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="e.g. my-app-assets-460008"
                        value={bucketName}
                        onChange={e => setBucketName(e.target.value.toLowerCase())}
                        className={`w-full px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border font-mono text-xs text-[var(--text-primary)] focus:outline-none ${
                          bucketName && nameError
                            ? 'border-[var(--danger)] focus:border-[var(--danger)]'
                            : 'border-[var(--border-color)] focus:border-[var(--accent-blue)]'
                        }`}
                        autoFocus
                      />
                    </div>

                    {bucketName && nameError ? (
                      <p className="text-[11px] text-[var(--danger)] flex items-center gap-1 mt-1">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>{nameError}</span>
                      </p>
                    ) : (
                      <p className="text-[11px] text-[var(--text-muted)] mt-1">
                        Your bucket name must be globally unique across all Google Cloud customers.
                      </p>
                    )}
                  </div>

                  {/* Naming rules box */}
                  <div className="p-3 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] space-y-1.5">
                    <span className="font-semibold text-[11px] text-[var(--text-primary)] flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 text-[var(--accent-blue)]" />
                      Bucket naming guidelines
                    </span>
                    <ul className="list-disc list-inside space-y-0.5 text-[11px] text-[var(--text-muted)]">
                      <li>3 to 63 characters long</li>
                      <li>Lowercase letters, numbers, hyphens, and dots only</li>
                      <li>Must start and end with a number or lowercase letter</li>
                      <li>Cannot begin with &quot;goog&quot; or contain &quot;google&quot;</li>
                    </ul>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      disabled={Boolean(nameError)}
                      onClick={() => handleStepContinue(1)}
                      className="px-4 py-1.5 rounded-lg bg-[var(--accent-blue)] text-black font-semibold text-xs hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-40"
                    >
                      Continue
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* STEP 2: Choose where to store your data */}
            <div className="border border-[var(--border-color)] rounded-2xl bg-[var(--bg-surface)] overflow-hidden shadow-sm">
              <div
                onClick={() => setActiveStep(2)}
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-[var(--card-hover)] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-[var(--accent-blue-bg)] text-[var(--accent-blue)] border border-[var(--accent-blue-border)] flex items-center justify-center text-xs font-bold">
                    2
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-[var(--text-primary)]">
                      Choose where to store your data
                    </h3>
                    {activeStep !== 2 && (
                      <span className="text-xs text-[var(--text-secondary)]">
                        {locationType}: {location}
                      </span>
                    )}
                  </div>
                </div>
                {activeStep === 2 ? <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" /> : <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />}
              </div>

              {activeStep === 2 && (
                <div className="p-5 pt-0 border-t border-[var(--border-subtle)] space-y-4 text-xs">
                  <div className="space-y-2 pt-4">
                    <label className="block font-semibold text-[var(--text-primary)]">
                      Location type
                    </label>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {(['Region', 'Dual-region', 'Multi-region'] as LocationType[]).map(type => (
                        <div
                          key={type}
                          onClick={() => setLocationType(type)}
                          className={`p-3 rounded-xl border cursor-pointer transition-all ${
                            locationType === type
                              ? 'bg-[var(--accent-blue-bg)] border-[var(--accent-blue-border)] text-[var(--accent-blue)]'
                              : 'bg-[var(--bg-canvas)] border-[var(--border-color)] text-[var(--text-primary)] hover:border-[var(--accent-blue-border)]'
                          }`}
                        >
                          <span className="font-semibold block">{type}</span>
                          <span className="text-[10px] text-[var(--text-muted)] mt-1 block">
                            {type === 'Region'
                              ? 'Lowest latency, single location'
                              : type === 'Dual-region'
                              ? 'High availability across 2 regions'
                              : 'Highest availability across continent'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block font-semibold text-[var(--text-primary)]">
                      Location
                    </label>
                    <select
                      value={location}
                      onChange={e => setLocation(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
                    >
                      {regionOptions.map(opt => (
                        <option key={opt.id} value={opt.id}>
                          {opt.name} ({opt.region})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={() => handleStepContinue(2)}
                      className="px-4 py-1.5 rounded-lg bg-[var(--accent-blue)] text-black font-semibold text-xs hover:bg-[var(--accent-hover)] transition-colors"
                    >
                      Continue
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* STEP 3: Choose a storage class for your data */}
            <div className="border border-[var(--border-color)] rounded-2xl bg-[var(--bg-surface)] overflow-hidden shadow-sm">
              <div
                onClick={() => setActiveStep(3)}
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-[var(--card-hover)] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-[var(--accent-blue-bg)] text-[var(--accent-blue)] border border-[var(--accent-blue-border)] flex items-center justify-center text-xs font-bold">
                    3
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-[var(--text-primary)]">
                      Choose a default storage class for your data
                    </h3>
                    {activeStep !== 3 && (
                      <span className="text-xs text-[var(--text-secondary)] font-mono">
                        {storageClass}
                      </span>
                    )}
                  </div>
                </div>
                {activeStep === 3 ? <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" /> : <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />}
              </div>

              {activeStep === 3 && (
                <div className="p-5 pt-0 border-t border-[var(--border-subtle)] space-y-4 text-xs">
                  <div className="space-y-2 pt-4">
                    {[
                      {
                        id: 'STANDARD' as StorageClass,
                        title: 'Standard',
                        desc: 'Best for active, frequently accessed data with no minimum storage duration.',
                      },
                      {
                        id: 'NEARLINE' as StorageClass,
                        title: 'Nearline',
                        desc: 'Best for data accessed less than once a month. 30-day minimum storage duration.',
                      },
                      {
                        id: 'COLDLINE' as StorageClass,
                        title: 'Coldline',
                        desc: 'Best for disaster recovery, accessed less than once a quarter. 90-day minimum storage duration.',
                      },
                      {
                        id: 'ARCHIVE' as StorageClass,
                        title: 'Archive',
                        desc: 'Best for long-term digital preservation, accessed less than once a year. 365-day minimum storage duration.',
                      },
                    ].map(cls => (
                      <label
                        key={cls.id}
                        className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                          storageClass === cls.id
                            ? 'bg-[var(--accent-blue-bg)] border-[var(--accent-blue-border)]'
                            : 'bg-[var(--bg-canvas)] border-[var(--border-color)] hover:border-[var(--accent-blue-border)]'
                        }`}
                      >
                        <input
                          type="radio"
                          name="storageClass"
                          checked={storageClass === cls.id}
                          onChange={() => setStorageClass(cls.id)}
                          className="mt-0.5 text-[var(--accent-blue)] focus:ring-0"
                        />
                        <div>
                          <span className="font-semibold text-xs text-[var(--text-primary)]">
                            {cls.title}
                          </span>
                          <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                            {cls.desc}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={() => handleStepContinue(3)}
                      className="px-4 py-1.5 rounded-lg bg-[var(--accent-blue)] text-black font-semibold text-xs hover:bg-[var(--accent-hover)] transition-colors"
                    >
                      Continue
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* STEP 4: Access Control */}
            <div className="border border-[var(--border-color)] rounded-2xl bg-[var(--bg-surface)] overflow-hidden shadow-sm">
              <div
                onClick={() => setActiveStep(4)}
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-[var(--card-hover)] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-[var(--accent-blue-bg)] text-[var(--accent-blue)] border border-[var(--accent-blue-border)] flex items-center justify-center text-xs font-bold">
                    4
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-[var(--text-primary)]">
                      Choose how to control access to objects
                    </h3>
                    {activeStep !== 4 && (
                      <span className="text-xs text-[var(--text-secondary)]">
                        {accessControl === 'UNIFORM' ? 'Uniform' : 'Fine-grained'}
                      </span>
                    )}
                  </div>
                </div>
                {activeStep === 4 ? <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" /> : <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />}
              </div>

              {activeStep === 4 && (
                <div className="p-5 pt-0 border-t border-[var(--border-subtle)] space-y-4 text-xs">
                  <div className="space-y-2 pt-4">
                    <label
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        accessControl === 'UNIFORM'
                          ? 'bg-[var(--accent-blue-bg)] border-[var(--accent-blue-border)]'
                          : 'bg-[var(--bg-canvas)] border-[var(--border-color)]'
                      }`}
                    >
                      <input
                        type="radio"
                        name="accessControl"
                        checked={accessControl === 'UNIFORM'}
                        onChange={() => setAccessControl('UNIFORM')}
                        className="mt-0.5 text-[var(--accent-blue)] focus:ring-0"
                      />
                      <div>
                        <span className="font-semibold text-xs text-[var(--text-primary)]">
                          Uniform (recommended)
                        </span>
                        <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                          Enforce uniform permissions at the bucket level using Cloud IAM only. Disables object ACLs.
                        </p>
                      </div>
                    </label>

                    <label
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        accessControl === 'FINE_GRAINED'
                          ? 'bg-[var(--accent-blue-bg)] border-[var(--accent-blue-border)]'
                          : 'bg-[var(--bg-canvas)] border-[var(--border-color)]'
                      }`}
                    >
                      <input
                        type="radio"
                        name="accessControl"
                        checked={accessControl === 'FINE_GRAINED'}
                        onChange={() => setAccessControl('FINE_GRAINED')}
                        className="mt-0.5 text-[var(--accent-blue)] focus:ring-0"
                      />
                      <div>
                        <span className="font-semibold text-xs text-[var(--text-primary)]">
                          Fine-grained
                        </span>
                        <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                          Access can be specified per individual object using Access Control Lists (ACLs) alongside IAM.
                        </p>
                      </div>
                    </label>
                  </div>

                  <div className="pt-2">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={publicAccessPrevention}
                        onChange={e => setPublicAccessPrevention(e.target.checked)}
                        className="rounded text-[var(--accent-blue)] focus:ring-0"
                      />
                      <span className="font-medium text-xs text-[var(--text-primary)]">
                        Enforce public access prevention on this bucket
                      </span>
                    </label>
                    <p className="text-[11px] text-[var(--text-muted)] ml-5 mt-0.5">
                      Prevents any public internet access to objects in this bucket, even if policies or ACLs allow it.
                    </p>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={() => handleStepContinue(4)}
                      className="px-4 py-1.5 rounded-lg bg-[var(--accent-blue)] text-black font-semibold text-xs hover:bg-[var(--accent-hover)] transition-colors"
                    >
                      Continue
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* STEP 5: Protect object data */}
            <div className="border border-[var(--border-color)] rounded-2xl bg-[var(--bg-surface)] overflow-hidden shadow-sm">
              <div
                onClick={() => setActiveStep(5)}
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-[var(--card-hover)] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-[var(--accent-blue-bg)] text-[var(--accent-blue)] border border-[var(--accent-blue-border)] flex items-center justify-center text-xs font-bold">
                    5
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-[var(--text-primary)]">
                      Choose how to protect object data
                    </h3>
                    {activeStep !== 5 && (
                      <span className="text-xs text-[var(--text-secondary)]">
                        {versioning ? 'Object versioning on' : 'No protection tools'}
                      </span>
                    )}
                  </div>
                </div>
                {activeStep === 5 ? <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" /> : <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />}
              </div>

              {activeStep === 5 && (
                <div className="p-5 pt-0 border-t border-[var(--border-subtle)] space-y-4 text-xs">
                  <div className="space-y-3 pt-4">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={versioning}
                        onChange={e => setVersioning(e.target.checked)}
                        className="mt-0.5 rounded text-[var(--accent-blue)] focus:ring-0"
                      />
                      <div>
                        <span className="font-semibold text-xs text-[var(--text-primary)]">
                          Object versioning
                        </span>
                        <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                          Keep a living history of modifications and deletions to protect against accidental overwrite.
                        </p>
                      </div>
                    </label>

                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={hasRetention}
                        onChange={e => setHasRetention(e.target.checked)}
                        className="mt-0.5 rounded text-[var(--accent-blue)] focus:ring-0"
                      />
                      <div>
                        <span className="font-semibold text-xs text-[var(--text-primary)]">
                          Retention policy
                        </span>
                        <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                          Prevent objects from being deleted or overwritten for a specified period of time.
                        </p>
                      </div>
                    </label>

                    {hasRetention && (
                      <div className="pl-6 pt-1 flex items-center gap-2">
                        <input
                          type="number"
                          min="1"
                          max="3650"
                          value={retentionDays}
                          onChange={e => setRetentionDays(parseInt(e.target.value) || 30)}
                          className="w-24 px-2 py-1 rounded bg-[var(--bg-canvas)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] font-mono"
                        />
                        <span className="text-[var(--text-secondary)]">days retention period</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-[var(--border-subtle)]">
                    <label className="block font-semibold text-[var(--text-primary)]">
                      Data encryption
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="encryption"
                        checked={encryption === 'Google-managed'}
                        onChange={() => setEncryption('Google-managed')}
                        className="text-[var(--accent-blue)] focus:ring-0"
                      />
                      <span className="text-xs text-[var(--text-primary)]">
                        Google-managed encryption key (default, automatic rotation)
                      </span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="pt-4 flex items-center gap-3">
              <button
                type="submit"
                disabled={Boolean(nameError)}
                className="px-5 py-2 rounded-lg bg-[var(--accent-blue)] text-black font-semibold text-xs hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-40 shadow-sm"
              >
                Create Bucket
              </button>
              <button
                type="button"
                onClick={() => setActiveView('storage', 'Buckets', 'Cloud Storage')}
                className="px-4 py-2 rounded-lg hover:bg-[var(--card-hover)] text-xs font-medium text-[var(--text-secondary)]"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>

        {/* Live Summary Sidebar (Right col) */}
        <div className="space-y-4">
          <div className="p-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-4 sticky top-16 shadow-sm">
            <h3 className="font-semibold text-sm text-[var(--text-primary)] border-b border-[var(--border-subtle)] pb-2">
              Bucket Summary
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-[11px] text-[var(--text-muted)] block">Name:</span>
                <span className="font-mono text-[var(--text-primary)] font-medium break-all">
                  {bucketName ? `gs://${bucketName}` : 'Not specified yet'}
                </span>
              </div>

              <div>
                <span className="text-[11px] text-[var(--text-muted)] block">Location:</span>
                <span className="text-[var(--text-primary)] font-medium">
                  {location} ({locationType})
                </span>
              </div>

              <div>
                <span className="text-[11px] text-[var(--text-muted)] block">Default storage class:</span>
                <span className="font-mono text-[var(--text-primary)] font-medium">
                  {storageClass}
                </span>
              </div>

              <div>
                <span className="text-[11px] text-[var(--text-muted)] block">Access control:</span>
                <span className="text-[var(--text-primary)] font-medium">
                  {accessControl === 'UNIFORM' ? 'Uniform' : 'Fine-grained'}
                </span>
              </div>

              <div>
                <span className="text-[11px] text-[var(--text-muted)] block">Protection tools:</span>
                <span className="text-[var(--text-primary)] font-medium">
                  {versioning ? 'Object versioning' : 'None'}
                  {hasRetention ? `, ${retentionDays}d retention` : ''}
                </span>
              </div>

              <div className="pt-3 border-t border-[var(--border-subtle)] space-y-1">
                <span className="text-[11px] text-[var(--text-muted)] block">Simulated storage rate:</span>
                <div className="text-sm font-semibold font-mono text-[var(--accent-blue)]">
                  {getEstimatedCost()}
                </div>
                <span className="text-[10px] text-[var(--text-muted)]">
                  No real charges occur in LocalCloud emulator.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
