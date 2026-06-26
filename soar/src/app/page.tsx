'use client';
import { useState, useEffect } from 'react';
import Nav from '@/components/Nav';
import ThreatMap from '@/components/ThreatMap';
import KPICards from '@/components/KPICards';
import AlertList from '@/components/AlertList';
import AlertDetail from '@/components/AlertDetail';
import LogSourceStatus from '@/components/LogSourceStatus';
import AIChat from '@/components/AIChat';
import EscalationPanel from '@/components/EscalationPanel';
import MonthlyReport from '@/components/MonthlyReport';
import SearchFilter, { type FilterState } from '@/components/SearchFilter';
import { type Alert } from '@/data/sampleData';

interface KpiData {
  unresolvedAlerts: number; criticalAlerts: number; aiRiskScore: number;
  logsLast24h: string; protectedAssets: number; logSourceUptime: string;
}
interface LogSourceData { name: string; status: string; events: number; icon: string; }
interface MonthlyData {
  totalEvents: string; highSeverity: number; bannedIps: number;
  uniqueSources: number; logSourceUptime: string; detectionRules: number;
}
interface Dashboard {
  siteName: string; protectedHost: string; updated: string;
  kpi: KpiData; logSources: LogSourceData[]; alerts: Alert[]; monthly: MonthlyData;
}

const POLL_MS = 15000;

export default function Home() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [selectedAlertId, setSelectedAlertId] = useState<string>('');
  const [selectedIp, setSelectedIp] = useState<string>('');
  const [filter, setFilter] = useState<FilterState>({
    query: '', severity: 'すべて', logSource: 'すべて', status: 'すべて', timeRange: '直近24時間',
  });

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch('/api/dashboard', { cache: 'no-store' });
        if (!res.ok) return;
        const d: Dashboard = await res.json();
        if (!alive) return;
        setData(d);
        setSelectedAlertId(prev => prev || (d.alerts[0]?.id ?? ''));
        setSelectedIp(prev => prev || (d.alerts[0]?.sourceIp ?? ''));
      } catch { /* keep previous data */ }
    };
    load();
    const id = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const alerts = data?.alerts ?? [];
  const selectedAlert = alerts.find(a => a.id === selectedAlertId) ?? alerts[0];

  function handleSelectAlert(id: string) {
    setSelectedAlertId(id);
    const a = alerts.find(x => x.id === id);
    if (a) setSelectedIp(a.sourceIp);
  }
  function handleSelectIp(ip: string) {
    setSelectedIp(ip);
    const a = alerts.find(x => x.sourceIp === ip);
    if (a) setSelectedAlertId(a.id);
  }

  const updatedLabel = data?.updated
    ? new Date(data.updated).toLocaleString('ja-JP', { hour12: false })
    : '—';

  return (
    <div className="min-h-screen" style={{ background: '#f1f5f9' }}>
      <Nav />

      {/* HERO */}
      <div className="px-4 pt-6 pb-4 md:px-8">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-xl md:text-2xl font-bold" style={{ color: '#0f172a' }}>
              セキュリティ オペレーション センター
            </h1>
            <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>
              {data?.siteName ?? '本番VPS'}（{data?.protectedHost ?? ''}）— 実ログ・リアルタイム脅威監視
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-xs" style={{ color: '#94a3b8' }}>
            <span>最終更新:</span>
            <span className="font-mono" style={{ color: '#3b82f6' }}>{updatedLabel}</span>
          </div>
        </div>
      </div>

      {/* MAIN */}
      <div className="px-4 pb-12 space-y-6 md:px-8">
        <ThreatMap selectedIp={selectedIp} onSelectIp={handleSelectIp} />
        <KPICards kpi={data?.kpi} />
        <SearchFilter onFilter={setFilter} />

        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4" style={{ minHeight: 520 }}>
          <div className="xl:col-span-3">
            <AlertList alerts={alerts} selectedId={selectedAlertId} onSelect={handleSelectAlert} filter={filter} limit={30} />
          </div>
          <div className="xl:col-span-2">
            <AlertDetail alert={selectedAlert} />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <LogSourceStatus logSources={data?.logSources ?? []} />
          <AIChat selectedAlert={selectedAlert} />
          <EscalationPanel />
        </div>

        <MonthlyReport monthly={data?.monthly} />
      </div>
    </div>
  );
}
