import React, { useState } from 'react';
import { X, Search, Check, Plus, Folder, AlertCircle } from 'lucide-react';
import { useLocalCloud } from '../../context/LocalCloudContext';

export const ProjectSelectorModal: React.FC = () => {
  const {
    projects,
    currentProject,
    setCurrentProject,
    createProject,
    isProjectPickerOpen,
    setIsProjectPickerOpen,
  } = useLocalCloud();

  const [searchQuery, setSearchQuery] = useState('');
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newCustomId, setNewCustomId] = useState('');

  if (!isProjectPickerOpen) return null;

  const filteredProjects = projects.filter(
    p =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.projectId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.projectNumber.includes(searchQuery)
  );

  const handleSelect = (project: (typeof projects)[0]) => {
    setCurrentProject(project);
    setIsProjectPickerOpen(false);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    const created = createProject(newProjectName.trim(), newCustomId.trim() || undefined);
    setNewProjectName('');
    setNewCustomId('');
    setIsCreatingNew(false);
    setIsProjectPickerOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={() => setIsProjectPickerOpen(false)}
      />

      {/* Modal Card */}
      <div className="relative z-10 w-full max-w-xl bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--border-color)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Folder className="w-5 h-5 text-[var(--accent-blue)]" />
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              {isCreatingNew ? 'Create a project' : 'Select a project'}
            </h2>
          </div>
          <button
            onClick={() => setIsProjectPickerOpen(false)}
            className="p-1 rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--card-hover)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!isCreatingNew ? (
          <>
            {/* Search & Actions Bar */}
            <div className="p-4 border-b border-[var(--border-subtle)] flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-[var(--text-muted)]" />
                <input
                  type="text"
                  placeholder="Search projects by name, ID or number"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-blue)]"
                  autoFocus
                />
              </div>
              <button
                onClick={() => setIsCreatingNew(true)}
                className="px-3 py-1.5 rounded-lg bg-[var(--accent-blue-bg)] hover:bg-[var(--accent-blue-border)] border border-[var(--accent-blue-border)] text-[var(--accent-blue)] text-xs font-medium flex items-center gap-1.5 transition-colors shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Project</span>
              </button>
            </div>

            {/* Project List */}
            <div className="flex-1 overflow-y-auto p-2 divide-y divide-[var(--border-subtle)] max-h-96">
              {filteredProjects.length === 0 ? (
                <div className="py-8 text-center text-xs text-[var(--text-muted)]">
                  No projects match your search query.
                </div>
              ) : (
                filteredProjects.map(proj => {
                  const isSelected = proj.id === currentProject.id;
                  return (
                    <div
                      key={proj.id}
                      onClick={() => handleSelect(proj)}
                      className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-[var(--accent-blue-bg)] border border-[var(--accent-blue-border)]'
                          : 'hover:bg-[var(--card-hover)]'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs text-[var(--text-primary)]">
                            {proj.name}
                          </span>
                          {isSelected && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-[var(--accent-blue)] text-black font-semibold">
                              ACTIVE
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[var(--text-secondary)] font-mono flex items-center gap-2">
                          <span>ID: {proj.projectId}</span>
                          <span>·</span>
                          <span>Num: {proj.projectNumber}</span>
                        </div>
                      </div>

                      {isSelected ? (
                        <Check className="w-4 h-4 text-[var(--accent-blue)] shrink-0" />
                      ) : (
                        <span className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                          Select
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-[var(--border-color)] bg-[var(--bg-canvas)] flex items-center justify-between text-[11px] text-[var(--text-muted)]">
              <span>{projects.length} project(s) available in LocalCloud</span>
              <button
                onClick={() => setIsProjectPickerOpen(false)}
                className="px-3 py-1 rounded-md hover:bg-[var(--card-hover)] text-[var(--text-primary)] font-medium"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          /* Create New Project Form */
          <form onSubmit={handleCreateSubmit} className="p-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                Project Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. My Nextjs Demo"
                value={newProjectName}
                onChange={e => setNewProjectName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
                autoFocus
              />
              <p className="text-[11px] text-[var(--text-muted)] mt-1">
                Your project name can be anything you like.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                Project ID (optional)
              </label>
              <input
                type="text"
                placeholder="e.g. my-nextjs-demo-460009"
                value={newCustomId}
                onChange={e => setNewCustomId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--accent-blue)]"
              />
              <p className="text-[11px] text-[var(--text-muted)] mt-1">
                Project ID is a globally unique identifier (lowercase, numbers, hyphens). Cannot be changed later.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-[var(--accent-blue)] shrink-0 mt-0.5" />
              <div className="text-[11px] text-[var(--text-secondary)]">
                LocalCloud will automatically associate your default billing account ($300 free virtual credits) with this project.
              </div>
            </div>

            <div className="pt-3 border-t border-[var(--border-color)] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCreatingNew(false)}
                className="px-4 py-2 rounded-lg hover:bg-[var(--card-hover)] text-xs font-medium text-[var(--text-secondary)]"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={!newProjectName.trim()}
                className="px-4 py-2 rounded-lg bg-[var(--accent-blue)] text-black text-xs font-semibold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
              >
                Create Project
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
