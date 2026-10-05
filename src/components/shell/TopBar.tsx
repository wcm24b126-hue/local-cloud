import React, { useState, useEffect, useRef } from 'react';
import {
  Menu,
  Search,
  Sparkles,
  Terminal,
  Bell,
  MoreVertical,
  ChevronDown,
  Sun,
  Moon,
  ExternalLink,
  Shield,
  CreditCard,
  LogOut,
  HelpCircle,
} from 'lucide-react';
import { useLocalCloud } from '../../context/LocalCloudContext';
import { LocalCloudLogo } from '../ui/IconRenderer';

export const TopBar: React.FC = () => {
  const {
    currentProject,
    isNavDrawerOpen,
    setIsNavDrawerOpen,
    isCloudShellOpen,
    setIsCloudShellOpen,
    isAssistantOpen,
    setIsAssistantOpen,
    setIsCommandPaletteOpen,
    setIsProjectPickerOpen,
    isDarkMode,
    toggleTheme,
    billingAccount,
    setActiveView,
  } = useLocalCloud();

  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);

  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  // Close menus on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setIsProfileMenuOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setIsNotificationsOpen(false);
      }
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setIsMoreMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Global keyboard shortcut '/' to open search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        setIsCommandPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setIsCommandPaletteOpen]);

  return (
    <header className="h-12 w-full bg-[var(--bg-header)] border-b border-[var(--border-color)] px-2 sm:px-3 flex items-center justify-between z-30 sticky top-0 select-none">
      {/* Left zone: Hamburger + Brand + Project Picker */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <button
          onClick={() => setIsNavDrawerOpen(!isNavDrawerOpen)}
          className="p-1.5 rounded-full hover:bg-[var(--card-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors focus:outline-none focus:ring-1 focus:ring-[var(--accent-blue)]"
          aria-label="Toggle navigation drawer"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div
          onClick={() => setActiveView('home')}
          className="flex items-center gap-2 cursor-pointer group"
        >
          <LocalCloudLogo size={22} />
          <span className="font-semibold text-base tracking-tight text-[var(--text-primary)]">
            LocalCloud
          </span>
          <span className="hidden md:inline-flex items-center text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-[var(--accent-blue-bg)] text-[var(--accent-blue)] border border-[var(--accent-blue-border)]">
            Local Emulator
          </span>
        </div>

        {/* Project Selector Pill */}
        <button
          onClick={() => setIsProjectPickerOpen(true)}
          className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-[var(--bg-surface)] hover:bg-[var(--card-hover)] border border-[var(--border-color)] text-[var(--text-primary)] transition-colors max-w-[200px]"
          title="Select a project"
        >
          <span className="truncate">{currentProject.name}</span>
          <ChevronDown className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0" />
        </button>
      </div>

      {/* Middle zone: Wide Centered Search Bar */}
      <div className="flex-1 max-w-xl mx-2 sm:mx-4">
        <button
          onClick={() => setIsCommandPaletteOpen(true)}
          className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--card-hover)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs sm:text-sm transition-colors text-left group"
        >
          <div className="flex items-center gap-2 truncate">
            <Search className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--accent-blue)] shrink-0" />
            <span className="truncate">Search (/) for resources, docs, products and more</span>
          </div>
          <kbd className="hidden md:inline-block px-1.5 py-0.5 text-[11px] font-mono rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--text-muted)] shrink-0">
            /
          </kbd>
        </button>
      </div>

      {/* Right zone: Actions + Cloud Shell + Assistant + Profile */}
      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        {/* Gemini-style Assistant sparkle button */}
        <button
          onClick={() => setIsAssistantOpen(!isAssistantOpen)}
          className={`p-2 rounded-full transition-colors relative ${
            isAssistantOpen
              ? 'bg-[var(--accent-blue-bg)] text-[var(--accent-blue)] ring-1 ring-[var(--accent-blue)]'
              : 'hover:bg-[var(--card-hover)] text-[var(--text-secondary)] hover:text-[var(--accent-blue)]'
          }`}
          title="Open LocalCloud Learning Assistant"
          aria-label="Assistant"
        >
          <Sparkles className="w-4 h-4" />
        </button>

        {/* Cloud Shell Terminal icon */}
        <button
          onClick={() => setIsCloudShellOpen(!isCloudShellOpen)}
          className={`p-2 rounded-full transition-colors relative ${
            isCloudShellOpen
              ? 'bg-[var(--accent-blue-bg)] text-[var(--accent-blue)] ring-1 ring-[var(--accent-blue)]'
              : 'hover:bg-[var(--card-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
          title="Activate Cloud Shell"
          aria-label="Cloud Shell"
        >
          <Terminal className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[var(--success)]" />
        </button>

        {/* Theme switcher */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-full hover:bg-[var(--card-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          title={`Switch to ${isDarkMode ? 'light' : 'dark'} mode`}
          aria-label="Toggle theme"
        >
          {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Notifications bell */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
            className="p-2 rounded-full hover:bg-[var(--card-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors relative"
            title="Notifications"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[var(--accent-blue)]" />
          </button>

          {isNotificationsOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl shadow-2xl py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="px-4 py-2 border-b border-[var(--border-subtle)] flex items-center justify-between">
                <span className="font-semibold text-xs text-[var(--text-primary)]">Notifications</span>
                <span className="text-[11px] text-[var(--text-muted)]">LocalCloud</span>
              </div>
              <div className="max-h-60 overflow-y-auto divide-y divide-[var(--border-subtle)]">
                <div className="px-4 py-2.5 hover:bg-[var(--card-hover)] text-xs transition-colors">
                  <p className="font-medium text-[var(--text-primary)]">Virtual Cloud Account Active</p>
                  <p className="text-[var(--text-secondary)] mt-0.5">$300.00 virtual free credits available for labs.</p>
                  <span className="text-[10px] text-[var(--text-muted)] mt-1 block">Just now</span>
                </div>
                <div className="px-4 py-2.5 hover:bg-[var(--card-hover)] text-xs transition-colors">
                  <p className="font-medium text-[var(--text-primary)]">Welcome to LocalCloud Console</p>
                  <p className="text-[var(--text-secondary)] mt-0.5">Explore Compute, Storage, IAM, and Cloud Shell offline.</p>
                  <span className="text-[10px] text-[var(--text-muted)] mt-1 block">10m ago</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 3-dots more menu */}
        <div className="relative" ref={moreRef}>
          <button
            onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
            className="p-2 rounded-full hover:bg-[var(--card-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            title="More settings"
            aria-label="More"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {isMoreMenuOpen && (
            <div className="absolute right-0 mt-2 w-52 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl shadow-2xl py-1 z-50 text-xs">
              <button
                onClick={() => {
                  setActiveView('billing');
                  setIsMoreMenuOpen(false);
                }}
                className="w-full text-left px-3 py-2 hover:bg-[var(--card-hover)] text-[var(--text-primary)] flex items-center gap-2"
              >
                <CreditCard className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                Manage Billing
              </button>
              <button
                onClick={() => {
                  setActiveView('iam');
                  setIsMoreMenuOpen(false);
                }}
                className="w-full text-left px-3 py-2 hover:bg-[var(--card-hover)] text-[var(--text-primary)] flex items-center gap-2"
              >
                <Shield className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                IAM & Permissions
              </button>
              <a
                href="https://cloud.google.com/docs"
                target="_blank"
                rel="noreferrer"
                className="px-3 py-2 hover:bg-[var(--card-hover)] text-[var(--text-primary)] flex items-center justify-between"
              >
                <span className="flex items-center gap-2">
                  <HelpCircle className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                  GCP Documentation
                </span>
                <ExternalLink className="w-3 h-3 text-[var(--text-muted)]" />
              </a>
            </div>
          )}
        </div>

        {/* User profile avatar */}
        <div className="relative ml-1" ref={profileRef}>
          <button
            onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
            className="w-7 h-7 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 text-white font-semibold text-xs flex items-center justify-center ring-1 ring-[var(--border-color)] hover:ring-[var(--accent-blue)] transition-all"
            aria-label="User profile menu"
          >
            S
          </button>

          {isProfileMenuOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl shadow-2xl p-3 z-50 text-xs">
              <div className="flex items-center gap-2.5 pb-3 border-b border-[var(--border-subtle)]">
                <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 text-white font-bold text-sm flex items-center justify-center shrink-0">
                  S
                </div>
                <div className="truncate">
                  <p className="font-semibold text-[var(--text-primary)] truncate">Student Account</p>
                  <p className="text-[11px] text-[var(--text-secondary)] truncate">student@localcloud.dev</p>
                  <span className="text-[10px] text-[var(--success)] font-medium">Role: Project Owner</span>
                </div>
              </div>

              <div className="py-2 space-y-1">
                <div className="text-[11px] text-[var(--text-muted)]">Virtual Credits Remaining:</div>
                <div className="text-sm font-semibold font-mono text-[var(--accent-blue)]">
                  ${billingAccount.virtualBalance.toFixed(2)} USD
                </div>
              </div>

              <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                <span>Local Emulator mode</span>
                <span className="font-mono">v1.0.0-local</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
