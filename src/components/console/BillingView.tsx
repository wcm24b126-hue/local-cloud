import React, { useState } from 'react';
import {
  CreditCard,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  Link as LinkIcon,
  RefreshCw,
  Plus,
  ShieldAlert,
  ArrowRight,
  TrendingDown,
} from 'lucide-react';
import { useLocalCloud } from '../../context/LocalCloudContext';

export const BillingView: React.FC = () => {
  const {
    billingAccount,
    projects,
    currentProject,
    linkProjectBilling,
    updateVirtualBalance,
    showToast,
    setActiveView,
  } = useLocalCloud();

  const [addAmount, setAddAmount] = useState('50');

  const isCurrentProjectLinked = billingAccount.linkedProjectIds.includes(currentProject.id);

  const handleAddCredits = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(addAmount);
    if (!isNaN(val) && val > 0) {
      updateVirtualBalance(val);
      showToast(`Added $${val.toFixed(2)} virtual credits to ${billingAccount.name}`);
    }
  };

  const handleResetCredits = () => {
    updateVirtualBalance(300 - billingAccount.virtualBalance);
    showToast('Reset virtual balance to $300.00 USD');
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-150">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[var(--border-color)]">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-[var(--text-primary)]">
            Billing overview
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Account: <span className="font-semibold text-[var(--text-primary)]">{billingAccount.name}</span> ({billingAccount.accountNumber})
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleResetCredits}
            className="px-3 py-1.5 rounded-lg border border-[var(--border-color)] hover:bg-[var(--card-hover)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reset Credits</span>
          </button>
        </div>
      </div>

      {/* Virtual Credit Balance Card + Warning Banner */}
      {!isCurrentProjectLinked && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs">
            <h3 className="font-semibold text-amber-300">
              Billing is not enabled for {currentProject.name}
            </h3>
            <p className="text-[var(--text-secondary)] mt-0.5">
              Compute Engine instances, Cloud SQL, and custom networking require an active billing account.
            </p>
            <button
              onClick={() => linkProjectBilling(currentProject.id, true)}
              className="mt-2 px-3 py-1 rounded-md bg-amber-400 text-black font-semibold text-xs hover:bg-amber-300 transition-colors"
            >
              Link {billingAccount.name}
            </button>
          </div>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Virtual Balance */}
        <div className="p-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-2">
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
            <span>Virtual Free Credits</span>
            <DollarSign className="w-4 h-4 text-[var(--success)]" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono text-[var(--text-primary)]">
            ${billingAccount.virtualBalance.toFixed(2)}
            <span className="text-xs font-normal text-[var(--text-muted)] ml-1">USD</span>
          </div>
          <p className="text-[11px] text-[var(--text-muted)]">
            Simulated free credits for hands-on learning with zero real charges.
          </p>
        </div>

        {/* Current Month Cost */}
        <div className="p-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-2">
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
            <span>Simulated Consumption</span>
            <TrendingDown className="w-4 h-4 text-[var(--accent-blue)]" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono text-[var(--text-primary)]">
            ${billingAccount.totalSpent.toFixed(2)}
            <span className="text-xs font-normal text-[var(--text-muted)] ml-1">USD</span>
          </div>
          <p className="text-[11px] text-[var(--text-muted)]">
            Calculated based on active simulated VM & storage resources.
          </p>
        </div>

        {/* Status */}
        <div className="p-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-2">
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
            <span>Account Status</span>
            <CreditCard className="w-4 h-4 text-[var(--accent-blue)]" />
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 font-semibold text-xs border border-emerald-500/20">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {billingAccount.status} (SIMULATED)
            </span>
          </div>
          <p className="text-[11px] text-[var(--text-muted)]">
            Linked to {billingAccount.linkedProjectIds.length} project(s)
          </p>
        </div>
      </div>

      {/* Linked Projects Management */}
      <div className="p-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              Projects linked to this billing account
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Billing enables paid resource creation and API access per project.
            </p>
          </div>
        </div>

        <div className="border border-[var(--border-subtle)] rounded-xl overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--bg-canvas)] border-b border-[var(--border-subtle)] text-[var(--text-muted)] font-medium">
              <tr>
                <th className="py-2.5 px-4">Project name</th>
                <th className="py-2.5 px-4">Project ID</th>
                <th className="py-2.5 px-4">Billing status</th>
                <th className="py-2.5 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {projects.map(proj => {
                const isLinked = billingAccount.linkedProjectIds.includes(proj.id);
                return (
                  <tr key={proj.id} className="hover:bg-[var(--card-hover)] transition-colors">
                    <td className="py-3 px-4 font-medium text-[var(--text-primary)]">
                      {proj.name}
                      {proj.id === currentProject.id && (
                        <span className="ml-2 text-[10px] text-[var(--accent-blue)] font-mono">
                          (CURRENT)
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-[var(--text-secondary)]">
                      {proj.projectId}
                    </td>
                    <td className="py-3 px-4">
                      {isLinked ? (
                        <span className="inline-flex items-center gap-1 text-[var(--success)] font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Billing enabled
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[var(--text-muted)]">
                          <AlertCircle className="w-3.5 h-3.5" />
                          Disabled
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {isLinked ? (
                        <button
                          onClick={() => linkProjectBilling(proj.id, false)}
                          className="px-2.5 py-1 rounded text-xs text-[var(--danger)] hover:bg-[var(--danger)]/10 font-medium transition-colors"
                        >
                          Disable billing
                        </button>
                      ) : (
                        <button
                          onClick={() => linkProjectBilling(proj.id, true)}
                          className="px-2.5 py-1 rounded text-xs bg-[var(--accent-blue-bg)] text-[var(--accent-blue)] hover:bg-[var(--accent-blue-border)] font-semibold transition-colors"
                        >
                          Enable billing
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Simulated Top-Up Form */}
      <div className="p-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-4">
        <h2 className="text-base font-semibold text-[var(--text-primary)]">
          Credit Top-Up Simulator
        </h2>
        <p className="text-xs text-[var(--text-secondary)]">
          Add virtual funds to test how quota alerts and budget caps trigger in cloud architectures.
        </p>

        <form onSubmit={handleAddCredits} className="flex items-center gap-3 max-w-sm">
          <div className="relative flex-1">
            <span className="absolute left-3 top-2 text-xs font-mono text-[var(--text-muted)]">$</span>
            <input
              type="number"
              min="10"
              max="1000"
              value={addAmount}
              onChange={e => setAddAmount(e.target.value)}
              className="w-full pl-7 pr-3 py-1.5 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--accent-blue)]"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-1.5 rounded-lg bg-[var(--accent-blue)] text-black font-semibold text-xs hover:bg-[var(--accent-hover)] transition-colors flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Virtual Credits</span>
          </button>
        </form>
      </div>
    </div>
  );
};
