import React, { useState, useRef } from 'react';
import {
  ArrowLeft,
  Copy,
  Check,
  Upload,
  FolderPlus,
  Trash2,
  Download,
  FileText,
  Folder,
  Globe,
  Lock,
  Plus,
  RefreshCw,
  ExternalLink,
  Shield,
  Layers,
  Clock,
  AlertCircle,
  HelpCircle,
  X,
  FileCode,
  Image as ImageIcon,
  CheckCircle2,
} from 'lucide-react';
import { useLocalCloud } from '../../../context/LocalCloudContext';
import { StorageObject, LifecycleRule, StorageClass } from '../../../types';

export const BucketDetailsView: React.FC = () => {
  const {
    selectedBucket,
    buckets,
    objects,
    deleteBucket,
    updateBucket,
    uploadObject,
    deleteObject,
    addLifecycleRule,
    deleteLifecycleRule,
    addBucketIamMember,
    removeBucketIamMember,
    currentFolderPrefix,
    setCurrentFolderPrefix,
    setActiveView,
    showToast,
  } = useLocalCloud();

  const [activeTab, setActiveTab] = useState<'objects' | 'config' | 'permissions' | 'lifecycle'>('objects');
  const [copiedUri, setCopiedUri] = useState<boolean>(false);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  // Modals
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [folderNameInput, setFolderNameInput] = useState('');
  const [isAddLifecycleOpen, setIsAddLifecycleOpen] = useState(false);
  const [isGrantAccessOpen, setIsGrantAccessOpen] = useState(false);

  // Lifecycle Rule Form State
  const [ruleAction, setRuleAction] = useState<'Delete' | 'SetStorageClass'>('Delete');
  const [ruleTargetClass, setRuleTargetClass] = useState<StorageClass>('COLDLINE');
  const [ruleAgeDays, setRuleAgeDays] = useState<number>(365);
  const [rulePrefix, setRulePrefix] = useState<string>('');

  // Grant Access Form State
  const [newPrincipal, setNewPrincipal] = useState<string>('');
  const [newRole, setNewRole] = useState<string>('roles/storage.objectViewer');

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!selectedBucket) {
    return (
      <div className="py-12 text-center space-y-4">
        <p className="text-sm text-[var(--text-secondary)]">No bucket selected.</p>
        <button
          onClick={() => setActiveView('storage', 'Buckets', 'Cloud Storage')}
          className="px-4 py-2 rounded-lg bg-[var(--accent-blue)] text-black font-semibold text-xs"
        >
          Back to buckets list
        </button>
      </div>
    );
  }

  // Refresh current bucket reference from state
  const bucket = buckets.find(b => b.id === selectedBucket.id || b.name === selectedBucket.name) || selectedBucket;

  // Filter objects for current bucket and current simulated folder prefix
  const bucketObjects = objects.filter(o => o.bucketName === bucket.name || o.bucketId === bucket.id);

  // Folder navigation simulation:
  // e.g. If currentFolderPrefix is "images/", we list items directly under "images/" and nested folders as sub-folders
  const currentLevelItems = (() => {
    const foldersSet = new Set<string>();
    const files: StorageObject[] = [];

    bucketObjects.forEach(obj => {
      if (currentFolderPrefix) {
        if (obj.name.startsWith(currentFolderPrefix) && obj.name !== currentFolderPrefix) {
          const rest = obj.name.slice(currentFolderPrefix.length);
          const slashIdx = rest.indexOf('/');
          if (slashIdx !== -1) {
            foldersSet.add(rest.slice(0, slashIdx));
          } else {
            files.push(obj);
          }
        }
      } else {
        const slashIdx = obj.name.indexOf('/');
        if (slashIdx !== -1) {
          foldersSet.add(obj.name.slice(0, slashIdx));
        } else {
          files.push(obj);
        }
      }
    });

    return {
      folders: Array.from(foldersSet).sort(),
      files: files.sort((a, b) => a.name.localeCompare(b.name)),
    };
  })();

  const handleCopyBucketUri = () => {
    navigator.clipboard.writeText(`gs://${bucket.name}`);
    setCopiedUri(true);
    showToast(`Copied gs://${bucket.name} to clipboard`);
    setTimeout(() => setCopiedUri(false), 2000);
  };

  const handleCreateFolderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = folderNameInput.trim().replace(/\/+/g, '');
    if (!clean) return;
    const fullFolderPath = `${currentFolderPrefix}${clean}/`;

    // In Cloud Storage, folders are simulated by 0-byte objects with a trailing slash or placeholder
    uploadObject(bucket.name, `${fullFolderPath}.placeholder`, {
      name: '.placeholder',
      size: 0,
      type: 'application/x-directory',
      content: '',
    });

    setFolderNameInput('');
    setIsCreateFolderOpen(false);
    showToast(`Created folder "${clean}"`);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = e.target.files;
    if (!uploadedFiles || uploadedFiles.length === 0) return;

    Array.from(uploadedFiles).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const contentStr = typeof reader.result === 'string' ? reader.result : '';
        const targetPath = `${currentFolderPrefix}${file.name}`;
        uploadObject(bucket.name, targetPath, {
          name: file.name,
          size: file.size,
          type: file.type || 'application/octet-stream',
          content: contentStr,
        });
      };
      if (file.type.startsWith('text/') || file.name.endsWith('.json') || file.name.endsWith('.csv') || file.name.endsWith('.html') || file.name.endsWith('.css') || file.name.endsWith('.js')) {
        reader.readAsText(file);
      } else {
        reader.readAsDataURL(file);
      }
    });

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDropFiles = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFiles = e.dataTransfer.files;
    if (!droppedFiles || droppedFiles.length === 0) return;

    Array.from(droppedFiles).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const contentStr = typeof reader.result === 'string' ? reader.result : '';
        const targetPath = `${currentFolderPrefix}${file.name}`;
        uploadObject(bucket.name, targetPath, {
          name: file.name,
          size: file.size,
          type: file.type || 'application/octet-stream',
          content: contentStr,
        });
      };
      reader.readAsText(file);
    });
  };

  const handleDownloadObject = (obj: StorageObject) => {
    const blob = new Blob([obj.contentData || ''], { type: obj.contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = obj.name.split('/').pop() || 'downloaded-file';
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Downloaded ${obj.name}`);
  };

  const handleAddLifecycleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addLifecycleRule(bucket.id, {
      action: ruleAction,
      targetStorageClass: ruleAction === 'SetStorageClass' ? ruleTargetClass : undefined,
      conditionAgeDays: ruleAgeDays,
      conditionPrefix: rulePrefix.trim() || undefined,
    });
    setIsAddLifecycleOpen(false);
  };

  const handleGrantAccessSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPrincipal.trim()) return;
    addBucketIamMember(bucket.id, newPrincipal.trim(), newRole);
    setNewPrincipal('');
    setIsGrantAccessOpen(false);
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KiB', 'MiB', 'GiB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Breadcrumbs parsing
  const breadcrumbSegments = currentFolderPrefix
    ? currentFolderPrefix.split('/').filter(Boolean)
    : [];

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-150">
      {/* Top Bucket Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[var(--border-color)]">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveView('storage', 'Buckets', 'Cloud Storage')}
            className="p-1.5 rounded-full hover:bg-[var(--card-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            title="Back to buckets list"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-semibold text-[var(--text-primary)]">
                {bucket.name}
              </h1>
              <button
                onClick={handleCopyBucketUri}
                className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                title="Copy gsutil URI"
              >
                {copiedUri ? <Check className="w-4 h-4 text-[var(--success)]" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-[var(--text-secondary)]">
              <span className="font-mono">Location: {bucket.location}</span>
              <span>·</span>
              <span className="font-mono">Class: {bucket.storageClass}</span>
              <span>·</span>
              {bucket.isPublic ? (
                <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                  <Globe className="w-3.5 h-3.5" />
                  Public
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[var(--text-muted)]">
                  <Lock className="w-3.5 h-3.5" />
                  Not public
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (confirm(`Are you sure you want to delete bucket "gs://${bucket.name}"?`)) {
                deleteBucket(bucket.id);
                setActiveView('storage', 'Buckets', 'Cloud Storage');
              }
            }}
            className="px-3 py-1.5 rounded-lg border border-[var(--danger)]/30 text-[var(--danger)] hover:bg-[var(--danger)]/10 font-semibold text-xs transition-colors flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete bucket</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 border-b border-[var(--border-color)] text-xs font-medium">
        <button
          onClick={() => setActiveTab('objects')}
          className={`px-4 py-2 border-b-2 transition-colors ${
            activeTab === 'objects'
              ? 'border-[var(--accent-blue)] text-[var(--accent-blue)] font-semibold'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          Objects ({bucketObjects.length})
        </button>
        <button
          onClick={() => setActiveTab('config')}
          className={`px-4 py-2 border-b-2 transition-colors ${
            activeTab === 'config'
              ? 'border-[var(--accent-blue)] text-[var(--accent-blue)] font-semibold'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          Configuration
        </button>
        <button
          onClick={() => setActiveTab('permissions')}
          className={`px-4 py-2 border-b-2 transition-colors ${
            activeTab === 'permissions'
              ? 'border-[var(--accent-blue)] text-[var(--accent-blue)] font-semibold'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          Permissions ({bucket.iamMembers.length})
        </button>
        <button
          onClick={() => setActiveTab('lifecycle')}
          className={`px-4 py-2 border-b-2 transition-colors ${
            activeTab === 'lifecycle'
              ? 'border-[var(--accent-blue)] text-[var(--accent-blue)] font-semibold'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          Lifecycle ({bucket.lifecycleRules.length})
        </button>
      </div>

      {/* TAB 1: OBJECTS */}
      {activeTab === 'objects' && (
        <div className="space-y-4">
          {/* Actions & Folder Breadcrumbs Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Breadcrumb Navigation */}
            <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] font-mono overflow-x-auto py-1">
              <button
                onClick={() => setCurrentFolderPrefix('')}
                className="hover:text-[var(--accent-blue)] transition-colors underline font-medium"
              >
                gs://{bucket.name}
              </button>
              {breadcrumbSegments.map((segment, idx) => {
                const segmentPath = breadcrumbSegments.slice(0, idx + 1).join('/') + '/';
                const isLast = idx === breadcrumbSegments.length - 1;
                return (
                  <React.Fragment key={idx}>
                    <span>/</span>
                    {isLast ? (
                      <span className="font-semibold text-[var(--text-primary)]">{segment}</span>
                    ) : (
                      <button
                        onClick={() => setCurrentFolderPrefix(segmentPath)}
                        className="hover:text-[var(--accent-blue)] transition-colors underline"
                      >
                        {segment}
                      </button>
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            {/* Upload Buttons */}
            <div className="flex items-center gap-2 shrink-0">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 rounded-lg bg-[var(--accent-blue)] text-black font-semibold text-xs hover:bg-[var(--accent-hover)] transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload files</span>
              </button>

              <button
                onClick={() => setIsCreateFolderOpen(true)}
                className="px-3 py-1.5 rounded-lg border border-[var(--border-color)] hover:bg-[var(--card-hover)] text-[var(--text-primary)] font-medium text-xs transition-colors flex items-center gap-1.5"
              >
                <FolderPlus className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                <span>Create folder</span>
              </button>
            </div>
          </div>

          {/* Drag & Drop Upload Zone */}
          <div
            onDragOver={e => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDropFiles}
            className={`border-2 border-dashed rounded-2xl p-6 transition-all text-center ${
              isDragOver
                ? 'border-[var(--accent-blue)] bg-[var(--accent-blue-bg)]'
                : 'border-[var(--border-color)] bg-[var(--bg-surface)] hover:border-[var(--accent-blue-border)]'
            }`}
          >
            <div className="space-y-1">
              <Upload className="w-6 h-6 mx-auto text-[var(--text-muted)]" />
              <p className="text-xs font-semibold text-[var(--text-primary)]">
                Drag and drop files here to upload to gs://{bucket.name}/{currentFolderPrefix}
              </p>
              <p className="text-[11px] text-[var(--text-muted)]">
                Files will be saved directly into LocalCloud emulator storage with download access.
              </p>
            </div>
          </div>

          {/* Objects Table */}
          <div className="border border-[var(--border-color)] rounded-2xl bg-[var(--bg-surface)] overflow-hidden shadow-sm">
            {currentLevelItems.folders.length === 0 && currentLevelItems.files.length === 0 ? (
              <div className="py-12 text-center text-xs text-[var(--text-muted)] space-y-1">
                <p>This folder is empty.</p>
                <p>Click &quot;Upload files&quot; above to store objects.</p>
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--bg-canvas)] border-b border-[var(--border-color)] text-[var(--text-muted)] font-medium">
                  <tr>
                    <th className="py-3 px-4">Name</th>
                    <th className="py-3 px-4">Size</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Storage class</th>
                    <th className="py-3 px-4">Last modified</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {/* Folders first */}
                  {currentLevelItems.folders.map(folderName => (
                    <tr
                      key={`dir-${folderName}`}
                      onClick={() => setCurrentFolderPrefix(`${currentFolderPrefix}${folderName}/`)}
                      className="hover:bg-[var(--card-hover)] cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <Folder className="w-4 h-4 text-[var(--accent-blue)] shrink-0" />
                          <span className="font-semibold text-[var(--text-primary)] hover:underline">
                            {folderName}/
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-[var(--text-muted)]">—</td>
                      <td className="py-3 px-4 text-[var(--text-muted)]">Folder</td>
                      <td className="py-3 px-4 text-[var(--text-muted)]">—</td>
                      <td className="py-3 px-4 text-[var(--text-muted)]">—</td>
                      <td className="py-3 px-4 text-right">
                        <span className="text-[11px] text-[var(--accent-blue)]">Open</span>
                      </td>
                    </tr>
                  ))}

                  {/* Files next */}
                  {currentLevelItems.files.map(obj => {
                    const displayName = currentFolderPrefix
                      ? obj.name.replace(currentFolderPrefix, '')
                      : obj.name;
                    return (
                      <tr key={obj.id} className="hover:bg-[var(--card-hover)] transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            {obj.contentType.startsWith('image/') ? (
                              <ImageIcon className="w-4 h-4 text-amber-400 shrink-0" />
                            ) : obj.contentType.includes('html') || obj.contentType.includes('json') ? (
                              <FileCode className="w-4 h-4 text-[var(--accent-blue)] shrink-0" />
                            ) : (
                              <FileText className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
                            )}
                            <span className="font-medium text-[var(--text-primary)]">
                              {displayName}
                            </span>
                          </div>
                        </td>

                        <td className="py-3 px-4 font-mono text-[var(--text-secondary)]">
                          {formatBytes(obj.size)}
                        </td>

                        <td className="py-3 px-4 font-mono text-[var(--text-secondary)] text-[11px]">
                          {obj.contentType}
                        </td>

                        <td className="py-3 px-4 font-mono text-[var(--text-secondary)]">
                          {obj.storageClass}
                        </td>

                        <td className="py-3 px-4 text-[var(--text-muted)] font-mono text-[11px]">
                          {new Date(obj.updatedAt).toLocaleString()}
                        </td>

                        <td className="py-3 px-4 text-right space-x-2">
                          <button
                            onClick={() => handleDownloadObject(obj)}
                            className="p-1 rounded text-[var(--accent-blue)] hover:bg-[var(--accent-blue-bg)] transition-colors inline-block"
                            title="Download object"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(`gs://${bucket.name}/${obj.name}`);
                              showToast(`Copied gs://${bucket.name}/${obj.name}`);
                            }}
                            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors inline-block"
                            title="Copy gsutil URI"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => deleteObject(obj.id)}
                            className="p-1 rounded text-[var(--danger)] hover:bg-[var(--danger)]/10 transition-colors inline-block"
                            title="Delete object"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: CONFIGURATION */}
      {activeTab === 'config' && (
        <div className="border border-[var(--border-color)] rounded-2xl bg-[var(--bg-surface)] p-6 space-y-6 shadow-sm text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <span className="text-[11px] text-[var(--text-muted)] block">Bucket name</span>
                <span className="font-semibold text-sm text-[var(--text-primary)] font-mono">{bucket.name}</span>
              </div>

              <div>
                <span className="text-[11px] text-[var(--text-muted)] block">Bucket URI</span>
                <span className="font-mono text-[var(--accent-blue)]">gs://{bucket.name}</span>
              </div>

              <div>
                <span className="text-[11px] text-[var(--text-muted)] block">Location type</span>
                <span className="text-[var(--text-primary)] font-medium">{bucket.locationType}</span>
              </div>

              <div>
                <span className="text-[11px] text-[var(--text-muted)] block">Location</span>
                <span className="text-[var(--text-primary)] font-mono">{bucket.location}</span>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <span className="text-[11px] text-[var(--text-muted)] block">Default storage class</span>
                <span className="font-mono text-[var(--text-primary)] font-medium">{bucket.storageClass}</span>
              </div>

              <div>
                <span className="text-[11px] text-[var(--text-muted)] block">Access control</span>
                <span className="text-[var(--text-primary)] font-medium">{bucket.accessControl}</span>
              </div>

              <div>
                <span className="text-[11px] text-[var(--text-muted)] block">Public access prevention</span>
                <span className="text-[var(--text-primary)] font-medium">
                  {bucket.publicAccessPrevention ? 'Enforced' : 'Not enforced'}
                </span>
              </div>

              <div>
                <span className="text-[11px] text-[var(--text-muted)] block">Object versioning</span>
                <span className="text-[var(--text-primary)] font-medium">
                  {bucket.versioning ? 'Enabled' : 'Disabled'}
                </span>
              </div>

              <div>
                <span className="text-[11px] text-[var(--text-muted)] block">Encryption</span>
                <span className="text-[var(--text-primary)] font-medium">{bucket.encryption}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: PERMISSIONS */}
      {activeTab === 'permissions' && (
        <div className="space-y-4 text-xs">
          {/* Public Access Status Banner */}
          <div className={`p-4 rounded-xl border flex items-start gap-3 ${
            bucket.isPublic
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-[var(--bg-surface)] border-[var(--border-color)] text-[var(--text-secondary)]'
          }`}>
            {bucket.isPublic ? <Globe className="w-5 h-5 shrink-0" /> : <Lock className="w-5 h-5 shrink-0 text-[var(--text-muted)]" />}
            <div className="space-y-1">
              <h3 className="font-semibold text-sm text-[var(--text-primary)]">
                {bucket.isPublic ? 'Public to internet' : 'Not public'}
              </h3>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                {bucket.isPublic
                  ? 'Objects in this bucket can be accessed by anyone on the internet because "allUsers" has been granted the Storage Object Viewer role. This is the standard setting for hosting static websites.'
                  : 'Access to this bucket is restricted to authorized project members and service accounts.'}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Principals with access to this bucket
            </h2>
            <button
              onClick={() => setIsGrantAccessOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-[var(--accent-blue)] text-black font-semibold text-xs hover:bg-[var(--accent-hover)] transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Grant access</span>
            </button>
          </div>

          <div className="border border-[var(--border-color)] rounded-2xl bg-[var(--bg-surface)] overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--bg-canvas)] border-b border-[var(--border-color)] text-[var(--text-muted)] font-medium">
                <tr>
                  <th className="py-3 px-4">Principal</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {bucket.iamMembers.map((m, idx) => (
                  <tr key={idx} className="hover:bg-[var(--card-hover)] transition-colors">
                    <td className="py-3 px-4 font-semibold text-[var(--text-primary)]">
                      {m.principal}
                      {m.principal === 'allUsers' && (
                        <span className="ml-2 text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 font-mono">
                          PUBLIC ACCESS
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-[var(--accent-blue)]">
                      {m.role}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => removeBucketIamMember(bucket.id, m.principal)}
                        className="p-1 rounded text-[var(--danger)] hover:bg-[var(--danger)]/10"
                        title="Revoke access"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: LIFECYCLE */}
      {activeTab === 'lifecycle' && (
        <div className="space-y-4 text-xs">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                Object Lifecycle Management Rules
              </h2>
              <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                Automatically transition objects to colder storage classes or delete expired files.
              </p>
            </div>
            <button
              onClick={() => setIsAddLifecycleOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-[var(--accent-blue)] text-black font-semibold text-xs hover:bg-[var(--accent-hover)] transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add rule</span>
            </button>
          </div>

          <div className="border border-[var(--border-color)] rounded-2xl bg-[var(--bg-surface)] overflow-hidden">
            {bucket.lifecycleRules.length === 0 ? (
              <div className="py-12 text-center text-[var(--text-muted)] space-y-1">
                <p>No lifecycle rules configured for this bucket.</p>
                <p>Lifecycle rules help optimize storage costs automatically.</p>
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--bg-canvas)] border-b border-[var(--border-color)] text-[var(--text-muted)] font-medium">
                  <tr>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Target Class</th>
                    <th className="py-3 px-4">Condition</th>
                    <th className="py-3 px-4 text-right">Delete</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {bucket.lifecycleRules.map(rule => (
                    <tr key={rule.id} className="hover:bg-[var(--card-hover)] transition-colors">
                      <td className="py-3 px-4 font-semibold text-[var(--text-primary)]">
                        {rule.action === 'Delete' ? 'Delete object' : 'Set storage class'}
                      </td>
                      <td className="py-3 px-4 font-mono text-[var(--accent-blue)]">
                        {rule.targetStorageClass || '—'}
                      </td>
                      <td className="py-3 px-4 font-mono text-[var(--text-secondary)]">
                        Age &gt; {rule.conditionAgeDays} days
                        {rule.conditionPrefix ? ` (prefix: "${rule.conditionPrefix}")` : ''}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => deleteLifecycleRule(bucket.id, rule.id)}
                          className="p-1 rounded text-[var(--danger)] hover:bg-[var(--danger)]/10"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Create Folder Modal */}
      {isCreateFolderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setIsCreateFolderOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-150 text-xs">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
              <h3 className="font-semibold text-sm text-[var(--text-primary)]">
                Create folder
              </h3>
              <button
                onClick={() => setIsCreateFolderOpen(false)}
                className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateFolderSubmit} className="space-y-4">
              <div>
                <label className="block font-semibold text-[var(--text-primary)] mb-1">
                  Folder name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. assets"
                  value={folderNameInput}
                  onChange={e => setFolderNameInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
                  autoFocus
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setIsCreateFolderOpen(false)}
                  className="px-3 py-1.5 rounded-lg hover:bg-[var(--card-hover)] text-[var(--text-secondary)] font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!folderNameInput.trim()}
                  className="px-4 py-1.5 rounded-lg bg-[var(--accent-blue)] text-black font-semibold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Lifecycle Rule Modal */}
      {isAddLifecycleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setIsAddLifecycleOpen(false)}
          />
          <div className="relative z-10 w-full max-w-lg bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-150 text-xs">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
              <h3 className="font-semibold text-sm text-[var(--text-primary)]">
                Add lifecycle rule
              </h3>
              <button
                onClick={() => setIsAddLifecycleOpen(false)}
                className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddLifecycleSubmit} className="space-y-4">
              <div>
                <label className="block font-semibold text-[var(--text-primary)] mb-1">Action</label>
                <select
                  value={ruleAction}
                  onChange={e => setRuleAction(e.target.value as 'Delete' | 'SetStorageClass')}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] focus:outline-none"
                >
                  <option value="Delete">Delete object</option>
                  <option value="SetStorageClass">Set storage class</option>
                </select>
              </div>

              {ruleAction === 'SetStorageClass' && (
                <div>
                  <label className="block font-semibold text-[var(--text-primary)] mb-1">Target storage class</label>
                  <select
                    value={ruleTargetClass}
                    onChange={e => setRuleTargetClass(e.target.value as StorageClass)}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] focus:outline-none"
                  >
                    <option value="NEARLINE">Nearline</option>
                    <option value="COLDLINE">Coldline</option>
                    <option value="ARCHIVE">Archive</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block font-semibold text-[var(--text-primary)] mb-1">Age in days</label>
                <input
                  type="number"
                  min="1"
                  max="3650"
                  value={ruleAgeDays}
                  onChange={e => setRuleAgeDays(parseInt(e.target.value) || 30)}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-[var(--text-primary)] mb-1">Prefix pattern (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. logs/ or backups/"
                  value={rulePrefix}
                  onChange={e => setRulePrefix(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setIsAddLifecycleOpen(false)}
                  className="px-3 py-1.5 rounded-lg hover:bg-[var(--card-hover)] text-[var(--text-secondary)] font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-[var(--accent-blue)] text-black font-semibold hover:bg-[var(--accent-hover)] transition-colors"
                >
                  Save rule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Grant Access Modal */}
      {isGrantAccessOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setIsGrantAccessOpen(false)}
          />
          <div className="relative z-10 w-full max-w-lg bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-150 text-xs">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
              <h3 className="font-semibold text-sm text-[var(--text-primary)]">
                Grant access to gs://{bucket.name}
              </h3>
              <button
                onClick={() => setIsGrantAccessOpen(false)}
                className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleGrantAccessSubmit} className="space-y-4">
              <div>
                <label className="block font-semibold text-[var(--text-primary)] mb-1">
                  New principal *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. allUsers, or user@example.com"
                  value={newPrincipal}
                  onChange={e => setNewPrincipal(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
                  autoFocus
                />
                <div className="mt-1.5 p-2 rounded-lg bg-[var(--accent-blue-bg)] border border-[var(--accent-blue-border)] flex items-start gap-1.5 text-[11px] text-[var(--accent-blue)]">
                  <Globe className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    <strong>Static website tip:</strong> Enter <code>allUsers</code> to make objects publicly viewable on the web.
                  </span>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-[var(--text-primary)] mb-1">
                  Select a role *
                </label>
                <select
                  value={newRole}
                  onChange={e => setNewRole(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] focus:outline-none"
                >
                  <option value="roles/storage.objectViewer">Storage Object Viewer (Read objects only)</option>
                  <option value="roles/storage.objectCreator">Storage Object Creator (Write objects only)</option>
                  <option value="roles/storage.objectAdmin">Storage Object Admin (Full control of objects)</option>
                  <option value="roles/storage.admin">Storage Admin (Full control of bucket &amp; objects)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setIsGrantAccessOpen(false)}
                  className="px-3 py-1.5 rounded-lg hover:bg-[var(--card-hover)] text-[var(--text-secondary)] font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newPrincipal.trim()}
                  className="px-4 py-1.5 rounded-lg bg-[var(--accent-blue)] text-black font-semibold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
