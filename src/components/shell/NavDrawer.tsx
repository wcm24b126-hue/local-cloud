import React, { useState, useRef } from 'react';
import {
  X,
  Star,
  ChevronRight,
  Clock,
  Compass,
  LayoutGrid,
  CheckCircle2,
  KeyRound,
  ArrowRight,
} from 'lucide-react';
import { useLocalCloud } from '../../context/LocalCloudContext';
import { NAVIGATION_PRODUCTS } from '../../data/navigation';
import { NavigationProduct } from '../../types';
import { IconRenderer } from '../ui/IconRenderer';

export const NavDrawer: React.FC = () => {
  const {
    isNavDrawerOpen,
    setIsNavDrawerOpen,
    activeView,
    setActiveView,
    recentVisits,
    favourites,
    toggleFavourite,
    isFavourite,
  } = useLocalCloud();

  const [hoveredProduct, setHoveredProduct] = useState<NavigationProduct | null>(null);
  const [showRecentFlyout, setShowRecentFlyout] = useState(false);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  if (!isNavDrawerOpen) return null;

  const handleMouseEnterProduct = (product: NavigationProduct) => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
    }
    setShowRecentFlyout(false);
    if (product.hasSubmenu) {
      setHoveredProduct(product);
    } else {
      setHoveredProduct(null);
    }
  };

  const handleMouseLeaveDrawer = () => {
    closeTimeoutRef.current = setTimeout(() => {
      setHoveredProduct(null);
      setShowRecentFlyout(false);
    }, 250);
  };

  const handleRecentEnter = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
    }
    setHoveredProduct(null);
    setShowRecentFlyout(true);
  };

  const handleFlyoutEnter = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
    }
  };

  const handleProductClick = (product: NavigationProduct) => {
    setActiveView(product.path, product.title, product.title);
    setIsNavDrawerOpen(false);
  };

  const handleSubmenuClick = (path: string, title: string, parentProduct: string) => {
    setActiveView(path, title, parentProduct);
    setIsNavDrawerOpen(false);
  };

  // Get favorite product items
  const favoriteItems = NAVIGATION_PRODUCTS.filter(p => favourites.includes(p.id));

  return (
    <div className="fixed inset-0 z-40 flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in"
        onClick={() => setIsNavDrawerOpen(false)}
      />

      {/* Main Drawer Column */}
      <aside
        onMouseLeave={handleMouseLeaveDrawer}
        className="relative z-50 w-72 sm:w-80 h-full bg-[var(--bg-header)] border-r border-[var(--border-color)] flex flex-col shadow-2xl animate-in slide-in-from-left duration-200"
      >
        {/* Drawer Header */}
        <div className="h-12 px-4 flex items-center justify-between border-b border-[var(--border-color)] shrink-0">
          <span className="font-semibold text-sm text-[var(--text-primary)]">Google Cloud Platform</span>
          <button
            onClick={() => setIsNavDrawerOpen(false)}
            className="p-1 rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--card-hover)] transition-colors"
            aria-label="Close navigation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto py-2 text-xs divide-y divide-[var(--border-subtle)] select-none">
          {/* Pinned Top Group */}
          <div className="py-1">
            <button
              onClick={() => setActiveView('home', 'Welcome', 'LocalCloud')}
              className={`w-full flex items-center gap-3 px-4 py-2 hover:bg-[var(--card-hover)] text-left transition-colors ${
                activeView === 'home' ? 'bg-[var(--accent-blue-bg)] text-[var(--accent-blue)] font-medium' : 'text-[var(--text-primary)]'
              }`}
            >
              <Compass className="w-4 h-4 text-[var(--text-secondary)]" />
              <span>Cloud Hub</span>
            </button>

            <button
              onClick={() => setActiveView('home', 'Overview', 'Cloud Overview')}
              className="w-full flex items-center gap-3 px-4 py-2 hover:bg-[var(--card-hover)] text-left text-[var(--text-primary)] transition-colors"
            >
              <LayoutGrid className="w-4 h-4 text-[var(--text-secondary)]" />
              <span>Cloud overview</span>
            </button>

            <button
              onClick={() => setActiveView('marketplace', 'Solutions', 'Solutions')}
              className="w-full flex items-center gap-3 px-4 py-2 hover:bg-[var(--card-hover)] text-left text-[var(--text-primary)] transition-colors"
            >
              <CheckCircle2 className="w-4 h-4 text-[var(--text-secondary)]" />
              <span>Solutions</span>
            </button>

            {/* Recently Visited with Flyout Trigger */}
            <div
              onMouseEnter={handleRecentEnter}
              className="relative"
            >
              <button
                className={`w-full flex items-center justify-between px-4 py-2 hover:bg-[var(--card-hover)] text-left transition-colors ${
                  showRecentFlyout ? 'bg-[var(--card-hover)] text-[var(--text-primary)]' : 'text-[var(--text-primary)]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Clock className="w-4 h-4 text-[var(--text-secondary)]" />
                  <span>Recently visited</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              </button>
            </div>
          </div>

          {/* Favourite Products Section */}
          <div className="py-2">
            <div className="px-4 py-1 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              Favourite Products
            </div>
            {favoriteItems.length === 0 ? (
              <div className="px-4 py-3 text-[11px] text-[var(--text-muted)] italic">
                Favourite products appear here
              </div>
            ) : (
              favoriteItems.map(prod => (
                <div
                  key={`fav-${prod.id}`}
                  onMouseEnter={() => handleMouseEnterProduct(prod)}
                  className={`group flex items-center justify-between px-4 py-2 hover:bg-[var(--card-hover)] transition-colors ${
                    activeView === prod.path ? 'bg-[var(--accent-blue-bg)] text-[var(--accent-blue)] font-medium' : 'text-[var(--text-primary)]'
                  }`}
                >
                  <button
                    data-nav-path={prod.path}
                    onClick={() => handleProductClick(prod)}
                    className="flex items-center gap-3 flex-1 text-left truncate mr-2"
                  >
                    <IconRenderer name={prod.iconName} className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
                    <span className="truncate">{prod.title}</span>
                  </button>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavourite(prod.id);
                      }}
                      className="p-1 rounded text-amber-400 hover:text-amber-300"
                      title="Remove from favourites"
                    >
                      <Star className="w-3.5 h-3.5 fill-amber-400" />
                    </button>
                    {prod.hasSubmenu && (
                      <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-[var(--text-primary)]" />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* All Products List */}
          <div className="py-2">
            <div className="px-4 py-1 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              Products
            </div>
            {NAVIGATION_PRODUCTS.map(prod => {
              const starred = isFavourite(prod.id);
              const isActive = activeView === prod.path || hoveredProduct?.id === prod.id;
              return (
                <div
                  key={`prod-${prod.id}`}
                  onMouseEnter={() => handleMouseEnterProduct(prod)}
                  className={`group flex items-center justify-between px-4 py-2 hover:bg-[var(--card-hover)] transition-colors ${
                    isActive ? 'bg-[var(--card-hover)] text-[var(--text-primary)]' : 'text-[var(--text-primary)]'
                  }`}
                >
                  <button
                    data-nav-path={prod.path}
                    onClick={() => handleProductClick(prod)}
                    className="flex items-center gap-3 flex-1 text-left truncate mr-2"
                  >
                    <IconRenderer name={prod.iconName} className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
                    <span className="truncate">{prod.title}</span>
                  </button>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavourite(prod.id);
                      }}
                      className={`p-1 rounded transition-opacity ${
                        starred ? 'text-amber-400 opacity-100' : 'text-[var(--text-muted)] opacity-0 group-hover:opacity-100 hover:text-[var(--text-primary)]'
                      }`}
                      title={starred ? 'Remove favourite' : 'Add to favourites'}
                    >
                      <Star className={`w-3.5 h-3.5 ${starred ? 'fill-amber-400' : ''}`} />
                    </button>
                    {prod.hasSubmenu && (
                      <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-[var(--text-primary)]" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Drawer Footer Actions */}
        <div className="p-3 border-t border-[var(--border-color)] space-y-2 shrink-0 bg-[var(--bg-header)]">
          <button
            onClick={() => setActiveView('products', 'All Products', 'Catalog')}
            className="w-full py-2 px-3 rounded-lg border border-[var(--border-color)] hover:bg-[var(--card-hover)] text-xs font-medium text-[var(--accent-blue)] transition-colors flex items-center justify-center gap-1.5"
          >
            <span>View all products</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setActiveView('apis-credentials', 'Credentials & API keys', 'APIs & Services')}
            className="w-full py-2 px-3 rounded-lg border border-[var(--border-color)] hover:bg-[var(--card-hover)] text-xs font-medium text-[var(--text-primary)] transition-colors flex items-center justify-center gap-1.5"
          >
            <KeyRound className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
            <span>Get API key</span>
          </button>
        </div>
      </aside>

      {/* Flyout Card 1: Recently Visited Flyout */}
      {showRecentFlyout && (
        <div
          onMouseEnter={handleFlyoutEnter}
          onMouseLeave={handleMouseLeaveDrawer}
          className="relative z-50 w-72 sm:w-80 h-full bg-[var(--bg-surface)] border-r border-[var(--border-color)] shadow-2xl flex flex-col animate-in fade-in slide-in-from-left-2 duration-150"
        >
          <div className="h-12 px-4 flex items-center border-b border-[var(--border-color)] shrink-0">
            <span className="font-semibold text-xs text-[var(--text-primary)]">Recently Visited Pages</span>
          </div>
          <div className="flex-1 overflow-y-auto py-2 divide-y divide-[var(--border-subtle)] text-xs">
            {recentVisits.map(visit => (
              <button
                key={visit.id}
                onClick={() => setActiveView(visit.path, visit.title, visit.product)}
                className="w-full text-left px-4 py-2.5 hover:bg-[var(--card-hover)] transition-colors block group"
              >
                <div className="font-medium text-[var(--text-primary)] group-hover:text-[var(--accent-blue)]">
                  {visit.title}
                </div>
                <div className="text-[11px] text-[var(--text-muted)] mt-0.5 flex items-center justify-between">
                  <span>{visit.product}</span>
                  <span className="text-[10px]">{visit.timestamp}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Flyout Card 2: Submenu Flyout (Screenshot 3 style with section headers) */}
      {hoveredProduct && hoveredProduct.subgroups && (
        <div
          onMouseEnter={handleFlyoutEnter}
          onMouseLeave={handleMouseLeaveDrawer}
          className="relative z-50 w-80 h-full bg-[var(--bg-surface)] border-r border-[var(--border-color)] shadow-2xl flex flex-col animate-in fade-in slide-in-from-left-2 duration-150"
        >
          <div className="h-12 px-4 flex items-center justify-between border-b border-[var(--border-color)] shrink-0">
            <div className="flex items-center gap-2">
              <IconRenderer name={hoveredProduct.iconName} className="w-4 h-4 text-[var(--accent-blue)]" />
              <span className="font-semibold text-sm text-[var(--text-primary)]">{hoveredProduct.title}</span>
            </div>
            <button
              onClick={() => handleProductClick(hoveredProduct)}
              className="text-[11px] text-[var(--accent-blue)] hover:underline"
            >
              Overview
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-4 text-xs">
            {hoveredProduct.subgroups.map((group, idx) => (
              <div key={idx} className="space-y-1">
                <div className="px-2 py-1 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider border-b border-[var(--border-subtle)] pb-1">
                  {group.groupTitle}
                </div>
                <div className="pt-1 space-y-0.5">
                  {group.items.map((item, itemIdx) => (
                    <button
                      key={itemIdx}
                      data-nav-path={item.path}
                      onClick={() => handleSubmenuClick(item.path, item.title, hoveredProduct.title)}
                      className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-[var(--card-hover)] text-[var(--text-primary)] hover:text-[var(--accent-blue)] transition-colors flex items-center justify-between group"
                    >
                      <span className="truncate">{item.title}</span>
                      {item.badge && (
                        <span className="text-[10px] px-1 rounded bg-[var(--accent-blue-bg)] text-[var(--accent-blue)]">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
