import React, { useState, useEffect } from 'react';
import { Search, X, Server, Archive, Shield, CreditCard, Cpu, Database, Bot, ArrowRight, CornerDownLeft } from 'lucide-react';
import { useLocalCloud } from '../../context/LocalCloudContext';
import { NAVIGATION_PRODUCTS } from '../../data/navigation';

interface PaletteItem {
  title: string;
  category: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  type: 'action' | 'product';
}

export const CommandPalette: React.FC = () => {
  const {
    isCommandPaletteOpen,
    setIsCommandPaletteOpen,
    setActiveView,
  } = useLocalCloud();

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (isCommandPaletteOpen) {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isCommandPaletteOpen]);

  if (!isCommandPaletteOpen) return null;

  const quickActions = [
    { title: 'Create a VM instance', category: 'Action', path: 'vm-create', icon: Server },
    { title: 'Create a storage bucket', category: 'Action', path: 'bucket-create', icon: Archive },
    { title: 'Deploy a Cloud Run service', category: 'Action', path: 'run', icon: Cpu },
    { title: 'Pub/Sub topics and messages', category: 'Action', path: 'pubsub', icon: Bot },
    { title: 'Grant IAM permissions', category: 'Action', path: 'iam', icon: Shield },
    { title: 'Manage billing & credits', category: 'Action', path: 'billing', icon: CreditCard },
    { title: 'API Library (Enable services)', category: 'Action', path: 'apis', icon: Cpu },
    { title: 'Open BigQuery Studio', category: 'Action', path: 'bigquery', icon: Database },
  ];

  const needle = query.toLowerCase();
  const actionMatches = quickActions.filter(a => a.title.toLowerCase().includes(needle));

  /**
   * Flatten products and their submenu items so a search for e.g. "Secret
   * Manager" lands on the Secret Manager page rather than its parent product.
   */
  const productMatches: PaletteItem[] = [];
  for (const p of NAVIGATION_PRODUCTS) {
    const items = (p.subgroups ?? []).flatMap(g => g.items);

    if (p.title.toLowerCase().includes(needle)) {
      productMatches.push({ title: p.title, category: 'Product', path: p.path, icon: Bot, type: 'product' });
    }
    for (const item of items) {
      if (item.title.toLowerCase().includes(needle)) {
        productMatches.push({
          title: item.title,
          category: p.title,
          path: item.path,
          icon: Bot,
          type: 'product',
        });
      }
    }
  }

  const allItems: PaletteItem[] = [
    ...actionMatches.map(a => ({ ...a, type: 'action' as const })),
    ...productMatches,
  ];

  const handleSelect = (item: PaletteItem) => {
    setActiveView(item.path, item.title, item.category);
    setIsCommandPaletteOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsCommandPaletteOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % Math.max(1, allItems.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + allItems.length) % Math.max(1, allItems.length));
    } else if (e.key === 'Enter' && allItems[selectedIndex]) {
      e.preventDefault();
      handleSelect(allItems[selectedIndex]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4">
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={() => setIsCommandPaletteOpen(false)}
      />

      <div className="relative z-10 w-full max-w-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
        {/* Search Input Bar */}
        <div className="p-3 border-b border-[var(--border-color)] flex items-center gap-3">
          <Search className="w-5 h-5 text-[var(--accent-blue)] shrink-0" />
          <input
            type="text"
            placeholder="Search resources, products, actions, or docs (e.g. 'VM', 'Bucket', 'IAM')..."
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            className="w-full bg-transparent text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none"
            autoFocus
          />
          <button
            onClick={() => setIsCommandPaletteOpen(false)}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results list */}
        <div className="max-h-96 overflow-y-auto p-2 divide-y divide-[var(--border-subtle)] text-xs">
          {allItems.length === 0 ? (
            <div className="py-8 text-center text-[var(--text-muted)]">
              No matching resources or products found for &quot;{query}&quot;.
            </div>
          ) : (
            allItems.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              const Icon = item.icon;
              return (
                <div
                  key={idx}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-colors ${
                    isSelected ? 'bg-[var(--accent-blue-bg)] text-[var(--accent-blue)]' : 'hover:bg-[var(--card-hover)] text-[var(--text-primary)]'
                  }`}
                >
                  <div className="flex items-center gap-3 truncate">
                    <Icon className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
                    <span className="font-medium truncate">{item.title}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">
                      {item.category}
                    </span>
                    {isSelected && (
                      <CornerDownLeft className="w-3.5 h-3.5 text-[var(--accent-blue)]" />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2 border-t border-[var(--border-color)] bg-[var(--bg-canvas)] flex items-center justify-between text-[11px] text-[var(--text-muted)]">
          <div className="flex items-center gap-3">
            <span><kbd className="px-1 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-color)]">↑</kbd> <kbd className="px-1 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-color)]">↓</kbd> to navigate</span>
            <span><kbd className="px-1 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-color)]">Enter</kbd> to select</span>
            <span><kbd className="px-1 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-color)]">Esc</kbd> to close</span>
          </div>
          <span className="font-mono">LocalCloud Global Search</span>
        </div>
      </div>
    </div>
  );
};
