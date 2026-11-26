'use client';

import { useServices } from './ServicesProvider';
import type { ServiceStatus } from 'hudsonkit';

const STATUS_COLORS: Record<ServiceStatus, string> = {
  unknown: 'bg-neutral-500',
  not_installed: 'bg-neutral-500',
  installed: 'bg-amber-500',
  running: 'bg-emerald-500',
  error: 'bg-red-500',
};

const STATUS_LABELS: Record<ServiceStatus, string> = {
  unknown: 'Unknown',
  not_installed: 'Not Running',
  installed: 'Installed',
  running: 'Running',
  error: 'Error',
};

export function ServicesContent() {
  const { catalog, records, executeAction, selectedId, setSelectedId } = useServices();

  return (
    <div className="p-4 space-y-3">
      {catalog.map((svc) => {
        const record = records[svc.id];
        const status: ServiceStatus = record?.status ?? 'unknown';
        const isSelected = selectedId === svc.id;

        return (
          // A card, not a <button>: it holds its own action buttons, and
          // buttons can't nest. The service name is the keyboard target.
          <div
            key={svc.id}
            onClick={() => setSelectedId(svc.id)}
            className={`w-full text-left cursor-pointer rounded-lg border p-4 transition-colors ${
              isSelected
                ? 'border-cyan-500/40 bg-cyan-500/5'
                : 'border-neutral-800 bg-neutral-900/50 hover:border-neutral-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[status]}`} />
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setSelectedId(svc.id); }}
                  aria-pressed={isSelected}
                  className="text-sm font-medium text-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 rounded"
                >
                  {svc.name}
                </button>
                {svc.version && (
                  <span className="text-[10px] text-neutral-500 font-mono">v{svc.version}</span>
                )}
              </div>
              <span className="text-[10px] text-neutral-500 uppercase tracking-wider">
                {STATUS_LABELS[status]}
              </span>
            </div>

            <p className="text-xs text-neutral-500 mb-3">{svc.description}</p>

            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
              {status !== 'running' && (
                <ActionButton
                  label="Start"
                  onClick={() => executeAction(svc.id, 'start')}
                />
              )}
              {status === 'running' && (
                <ActionButton
                  label="Stop"
                  variant="danger"
                  onClick={() => executeAction(svc.id, 'stop')}
                />
              )}
              <ActionButton
                label="Check"
                variant="secondary"
                onClick={() => executeAction(svc.id, 'check')}
              />
              {(status === 'not_installed' || status === 'unknown') && (
                <ActionButton
                  label="Install"
                  variant="secondary"
                  onClick={() => executeAction(svc.id, 'install')}
                />
              )}
            </div>

            {record?.error && (
              <p className="mt-2 text-[10px] text-red-400 font-mono truncate">{record.error}</p>
            )}
          </div>
        );
      })}

      {catalog.length === 0 && (
        <div className="text-center text-neutral-600 text-sm py-12">No services configured</div>
      )}
    </div>
  );
}

function ActionButton({
  label,
  variant = 'primary',
  onClick,
}: {
  label: string;
  variant?: 'primary' | 'secondary' | 'danger';
  onClick: () => void;
}) {
  const colors = {
    primary: 'bg-cyan-600/20 text-cyan-400 hover:bg-cyan-600/30 border-cyan-500/20',
    secondary: 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700 border-neutral-700',
    danger: 'bg-red-600/20 text-red-400 hover:bg-red-600/30 border-red-500/20',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1 text-[11px] font-medium rounded border transition-colors ${colors[variant]}`}
    >
      {label}
    </button>
  );
}
