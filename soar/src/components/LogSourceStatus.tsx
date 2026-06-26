'use client';

interface LogSource { name: string; status: string; events: number; icon: string; }

export default function LogSourceStatus({ logSources = [] }: { logSources?: LogSource[] }) {
  const total = logSources.reduce((a, s) => a + s.events, 0);
  const maxEv = Math.max(1, ...logSources.map(s => s.events));

  return (
    <div className="cyber-card p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: '#0f172a' }}>
        ログソース状態
      </h2>
      <div className="space-y-3">
        {logSources.length === 0 && (
          <p className="text-xs py-4 text-center" style={{ color: '#94a3b8' }}>読み込み中…</p>
        )}
        {logSources.map(src => {
          const isHealthy = src.status === 'Healthy';
          const isDelayed = src.status === 'Delayed';
          const statusColor = isHealthy ? '#16a34a' : isDelayed ? '#d97706' : '#ef4444';
          const pct = Math.min(100, (src.events / maxEv) * 100);
          return (
            <div key={src.name}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span>{src.icon}</span>
                  <span className="text-sm" style={{ color: '#334155' }}>{src.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono" style={{ color: '#64748b' }}>
                    {src.events.toLocaleString()} 件
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ color: statusColor, background: `${statusColor}12`, border: `1px solid ${statusColor}30` }}>
                    {src.status}
                  </span>
                </div>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#e2e8f0' }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${pct}%`,
                    background: isDelayed
                      ? 'linear-gradient(90deg, #d97706, #f97316)'
                      : 'linear-gradient(90deg, #3b82f6, #0ea5e9)',
                  }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 pt-3 border-t flex items-center justify-between" style={{ borderColor: '#e2e8f0' }}>
        <span className="text-xs" style={{ color: '#94a3b8' }}>合計取込イベント</span>
        <span className="text-sm font-mono font-semibold" style={{ color: '#0ea5e9' }}>
          {total.toLocaleString()}
        </span>
      </div>
    </div>
  );
}
