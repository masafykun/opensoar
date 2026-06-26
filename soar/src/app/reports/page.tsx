'use client';
import { useState, useEffect } from 'react';
import Nav from '@/components/Nav';
import MonthlyReport from '@/components/MonthlyReport';

interface PeriodSummary {
  periodDays: number;
  alerts: number;
  bySeverity: { Critical: number; High: number; Medium: number; Low: number };
  resolved: number;
  unresolved: number;
  topAttackers: { ip: string; events: number; title: string }[];
  requests: number;
  attacks: number;
  daysWithData: number;
}
interface HistoryAlert {
  id: string; title: string; severity: string; logSource: string; sourceIp: string;
  location: string; firstSeen: string; lastSeen: string; events: number;
  status: string; resolvedAt: string | null; note: string;
}
interface Monthly {
  totalEvents: string; highSeverity: number; bannedIps: number;
  uniqueSources: number; logSourceUptime: string; detectionRules: number;
}

const POLL_MS = 30000;

function sevColor(s: string) {
  return s === 'Critical' ? '#ef4444' : s === 'High' ? '#f97316' : s === 'Medium' ? '#eab308' : '#22c55e';
}
function statusColor(s: string) {
  return s === 'Resolved' ? '#16a34a' : s === 'Investigating' ? '#f97316' : '#3b82f6';
}
function statusLabel(s: string) {
  return s === 'Resolved' ? '解決済み' : s === 'Investigating' ? '調査中' : 'New';
}
function fmtTime(iso: string | null) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('ja-JP', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
}

function SummaryCard({ label, s }: { label: string; s?: PeriodSummary }) {
  return (
    <div className="cyber-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold" style={{ color: '#0f172a' }}>{label}</h3>
        <span className="text-2xl font-bold font-mono" style={{ color: '#3b82f6' }}>{s ? s.alerts : '—'}</span>
      </div>
      {/* severity breakdown */}
      <div className="flex gap-1.5 mb-4">
        {(['Critical', 'High', 'Medium', 'Low'] as const).map(sev => (
          <div key={sev} className="flex-1 text-center rounded-lg py-1.5"
            style={{ background: `${sevColor(sev)}10`, border: `1px solid ${sevColor(sev)}25` }}>
            <p className="text-sm font-bold font-mono" style={{ color: sevColor(sev) }}>{s ? s.bySeverity[sev] : '—'}</p>
            <p className="text-[10px]" style={{ color: '#94a3b8' }}>{sev}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
        <div className="rounded-lg p-2" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <span style={{ color: '#94a3b8' }}>解決済み</span>
          <p className="font-mono font-bold" style={{ color: '#16a34a' }}>{s ? s.resolved : '—'}</p>
        </div>
        <div className="rounded-lg p-2" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <span style={{ color: '#94a3b8' }}>未対応</span>
          <p className="font-mono font-bold" style={{ color: '#f97316' }}>{s ? s.unresolved : '—'}</p>
        </div>
        <div className="rounded-lg p-2" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <span style={{ color: '#94a3b8' }}>総リクエスト</span>
          <p className="font-mono font-bold" style={{ color: '#0ea5e9' }}>{s ? s.requests.toLocaleString() : '—'}</p>
        </div>
        <div className="rounded-lg p-2" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <span style={{ color: '#94a3b8' }}>攻撃検知</span>
          <p className="font-mono font-bold" style={{ color: '#ef4444' }}>{s ? s.attacks.toLocaleString() : '—'}</p>
        </div>
      </div>
      <div>
        <p className="text-xs mb-1.5" style={{ color: '#94a3b8' }}>主な攻撃元</p>
        {s && s.topAttackers.length > 0 ? s.topAttackers.slice(0, 3).map(a => (
          <div key={a.ip} className="flex items-center justify-between text-xs py-0.5">
            <span className="font-mono" style={{ color: '#334155' }}>{a.ip}</span>
            <span className="font-mono" style={{ color: '#94a3b8' }}>{a.events.toLocaleString()}件</span>
          </div>
        )) : <p className="text-xs" style={{ color: '#cbd5e1' }}>—</p>}
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const [summary, setSummary] = useState<{ day?: PeriodSummary; week?: PeriodSummary; month?: PeriodSummary }>({});
  const [monthly, setMonthly] = useState<Monthly | undefined>(undefined);
  const [history, setHistory] = useState<HistoryAlert[]>([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [rs, rh, rd] = await Promise.all([
          fetch('/api/reports/summary', { cache: 'no-store' }),
          fetch('/api/alerts/history?limit=100', { cache: 'no-store' }),
          fetch('/api/dashboard', { cache: 'no-store' }),
        ]);
        if (!alive) return;
        if (rs.ok) setSummary(await rs.json());
        if (rh.ok) setHistory((await rh.json()).alerts ?? []);
        if (rd.ok) setMonthly((await rd.json()).monthly);
      } catch { /* keep previous */ }
    };
    load();
    const id = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const periods = [
    { label: '本日のまとめ（24時間）', s: summary.day },
    { label: '今週のまとめ（7日間）', s: summary.week },
    { label: '今月のまとめ（30日間）', s: summary.month },
  ];

  return (
    <div className="min-h-screen" style={{ background: '#f1f5f9' }}>
      <Nav />
      <div className="px-4 pt-6 pb-12 md:px-8 space-y-6">
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#0f172a' }}>レポート</h1>
          <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>
            本番ログの実集計サマリーと対応履歴（履歴は稼働開始以降を蓄積）
          </p>
        </div>

        {/* 期間サマリー */}
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: '#0f172a' }}>期間サマリー</h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {periods.map(p => <SummaryCard key={p.label} label={p.label} s={p.s} />)}
          </div>
        </div>

        {/* 現在のスナップショット */}
        <MonthlyReport monthly={monthly} />

        {/* インシデント履歴（実データ） */}
        <div className="cyber-card overflow-hidden">
          <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: '#e2e8f0' }}>
            <div>
              <h2 className="text-sm font-semibold" style={{ color: '#0f172a' }}>アラート対応履歴</h2>
              <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>検知したアラートと対応ステータス（New / 調査中 / 解決済み）</p>
            </div>
            <span className="text-xs" style={{ color: '#94a3b8' }}>{history.length} 件</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                  {['ID', 'タイトル', '重大度', '状態', '送信元IP', '初検知', '最終検知', '対応'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium" style={{ color: '#64748b' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center" style={{ color: '#94a3b8' }}>
                    まだ履歴がありません（稼働開始以降のアラートが蓄積されます）
                  </td></tr>
                )}
                {history.map(a => (
                  <tr key={a.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: '#94a3b8' }}>{a.id}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: '#0f172a', maxWidth: 280 }}>
                      <span className="truncate block" style={{ maxWidth: 280 }}>{a.title}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded font-medium"
                        style={{ color: sevColor(a.severity), background: `${sevColor(a.severity)}10`, border: `1px solid ${sevColor(a.severity)}25` }}>
                        {a.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded font-medium"
                        style={{ color: statusColor(a.status), background: `${statusColor(a.status)}10`, border: `1px solid ${statusColor(a.status)}25` }}>
                        {statusLabel(a.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: '#475569' }}>{a.sourceIp}</td>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: '#94a3b8' }}>{fmtTime(a.firstSeen)}</td>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: '#94a3b8' }}>{fmtTime(a.lastSeen)}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: '#16a34a' }}>
                      {a.status === 'Resolved' ? `解決 ${fmtTime(a.resolvedAt)}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
