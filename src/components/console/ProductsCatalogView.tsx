import React, { useState } from 'react';
import { Search, Star, ArrowRight } from 'lucide-react';
import { useLocalCloud } from '../../context/LocalCloudContext';
import { NAVIGATION_PRODUCTS } from '../../data/navigation';
import { IconRenderer } from '../ui/IconRenderer';

export const ProductsCatalogView: React.FC = () => {
  const { setActiveView, isFavourite, toggleFavourite } = useLocalCloud();
  const [filterQuery, setFilterQuery] = useState('');

  const filtered = NAVIGATION_PRODUCTS.filter(p =>
    p.title.toLowerCase().includes(filterQuery.toLowerCase()) ||
    p.subgroups?.some(g => g.items.some(i => i.title.toLowerCase().includes(filterQuery.toLowerCase())))
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-150">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[var(--border-color)]">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-[var(--text-primary)]">
            Products &amp; Solutions
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Explore and launch emulated Google Cloud services in your local offline environment.
          </p>
        </div>

        <div className="relative max-w-xs w-full">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder="Filter products..."
            value={filterQuery}
            onChange={e => setFilterQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-blue)]"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(prod => {
          const starred = isFavourite(prod.id);
          return (
            <div
              key={prod.id}
              className="p-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] hover:border-[var(--accent-blue-border)] transition-all flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="p-2.5 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)]">
                    <IconRenderer name={prod.iconName} className="w-5 h-5 text-[var(--accent-blue)]" />
                  </div>
                  <button
                    onClick={() => toggleFavourite(prod.id)}
                    className="p-1 rounded text-amber-400 hover:text-amber-300"
                    title={starred ? 'Starred' : 'Add to favourites'}
                  >
                    <Star className={`w-4 h-4 ${starred ? 'fill-amber-400' : 'text-[var(--text-muted)]'}`} />
                  </button>
                </div>

                <div>
                  <h3 className="font-semibold text-sm text-[var(--text-primary)]">{prod.title}</h3>
                  {prod.subgroups && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {prod.subgroups.flatMap(g => g.items).slice(0, 4).map((sub, i) => (
                        <span
                          key={i}
                          onClick={() => setActiveView(sub.path, sub.title, prod.title)}
                          className="text-[10px] px-2 py-0.5 rounded bg-[var(--bg-canvas)] hover:bg-[var(--card-hover)] text-[var(--text-secondary)] hover:text-[var(--accent-blue)] cursor-pointer transition-colors"
                        >
                          {sub.title}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between">
                <span className="text-[10px] text-[var(--text-muted)] font-mono">Emulated</span>
                <button
                  onClick={() => setActiveView(prod.path, prod.title, prod.title)}
                  className="px-3 py-1.5 rounded-lg bg-[var(--accent-blue-bg)] hover:bg-[var(--accent-blue-border)] text-[var(--accent-blue)] font-medium text-xs flex items-center gap-1.5 transition-colors"
                >
                  <span>Open Console</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
