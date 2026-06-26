'use client';
import { useState, useEffect } from 'react';
import Nav from '@/components/Nav';
import AlertList from '@/components/AlertList';
import AlertDetail from '@/components/AlertDetail';
import SearchFilter, { type FilterState } from '@/components/SearchFilter';
import { type Alert } from '@/data/sampleData';

const POLL_MS = 15000;

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [selectedAlertId, setSelectedAlertId] = useState('');
  const [filter, setFilter] = useState<FilterState>({
    query: '', severity: 'すべて', logSource: 'すべて', status: 'すべて', timeRange: '直近24時間',
  });

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch('/api/dashboard', { cache: 'no-store' });
        if (!res.ok) return;
        const d = await res.json();
        if (!alive) return;
        setAlerts(d.alerts ?? []);
        setSelectedAlertId(prev => prev || (d.alerts?.[0]?.id ?? ''));
      } catch { /* keep previous */ }
    };
    load();
    const id = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const selectedAlert = alerts.find(a => a.id === selectedAlertId) ?? alerts[0];

  const counts = {
    critical:   alerts.filter(a => a.severity === 'Critical').length,
    high:       alerts.filter(a => a.severity === 'High').length,
    medium:     alerts.filter(a => a.severity === 'Medium').length,
    unresolved: alerts.filter(a => a.status !== 'Resolved').length,
  };

  const statCards = [
    { label: 'Critical', value: counts.critical,   color: '#ef4444' },
    { label: 'High',     value: counts.high,        color: '#f97316' },
    { label: 'Medium',   value: counts.medium,      color: '#d97706' },
    { label: '未対応',   value: counts.unresolved,  color: '#3b82f6' },
  ];

  return (
    <div className="min-h-screen" style={{ background: '#f1f5f9' }}>
      <Nav />
      <div className="px-4 pt-6 pb-12 md:px-8 space-y-5">
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#0f172a' }}>アラート一覧</h1>
          <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>
            本番ログから検知したセキュリティアラート（nginx不正アクセス・SSH失敗・fail2ban）
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {statCards.map(s => (
            <div key={s.label} className="cyber-card p-4">
              <p className="text-xs mb-1" style={{ color: '#64748b' }}>{s.label}</p>
              <p className="text-2xl font-bold font-mono" style={{ color: s.color }}>{s.value}</p>
            </div>
          ))}
        </div>

        <SearchFilter onFilter={setFilter} />

        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4" style={{ minHeight: 520 }}>
          <div className="xl:col-span-3">
            <AlertList alerts={alerts} selectedId={selectedAlertId} onSelect={setSelectedAlertId} filter={filter} />
          </div>
          <div className="xl:col-span-2">
            <AlertDetail alert={selectedAlert} />
          </div>
        </div>
      </div>
    </div>
  );
}
