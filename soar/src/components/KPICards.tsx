'use client';

interface Kpi {
  unresolvedAlerts: number; criticalAlerts: number; aiRiskScore: number;
  logsLast24h: string | number; protectedAssets: number; logSourceUptime: string;
}

interface KPICardProps {
  label: string;
  value: string | number;
  sub?: string;
  color: string;
  icon: string;
}

function KPICard({ label, value, sub, color, icon }: KPICardProps) {
  return (
    <div className="cyber-card p-5 flex flex-col gap-2 transition-transform hover:-translate-y-0.5">
      <div className="flex items-center justify-between">
        <span className="text-2xl">{icon}</span>
        <span className="text-xs uppercase tracking-wider font-medium" style={{ color: '#94a3b8' }}>{label}</span>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-3xl font-bold" style={{ color, fontFamily: 'JetBrains Mono, monospace' }}>
          {value}
        </span>
        {sub && <span className="text-xs mb-1" style={{ color: '#94a3b8' }}>{sub}</span>}
      </div>
    </div>
  );
}

const DASH = '—';

export default function KPICards({ kpi }: { kpi?: Kpi }) {
  const k: Kpi = kpi ?? {
    unresolvedAlerts: DASH as unknown as number, criticalAlerts: DASH as unknown as number,
    aiRiskScore: DASH as unknown as number, logsLast24h: DASH, protectedAssets: DASH as unknown as number,
    logSourceUptime: DASH,
  };
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
      <KPICard label="未対応アラート"     value={k.unresolvedAlerts}  color="#f97316" icon="🔔" />
      <KPICard label="Critical/High"     value={k.criticalAlerts}    color="#ef4444" icon="🚨" />
      <KPICard label="AI リスクスコア"    value={k.aiRiskScore}       color="#7c3aed" icon="🤖" sub="/ 100" />
      <KPICard label="リクエスト(直近)"   value={k.logsLast24h}       color="#0ea5e9" icon="📊" sub="reqs" />
      <KPICard label="保護対象サービス"   value={k.protectedAssets}   color="#16a34a" icon="🖥" sub="個" />
      <KPICard label="サービス稼働率"     value={k.logSourceUptime}   color="#3b82f6" icon="✅" />
    </div>
  );
}
