'use client';
import { useState } from 'react';
import { type Alert, type Severity, type AlertStatus } from '@/data/sampleData';
import { type FilterState } from './SearchFilter';

function severityColor(s: Severity) {
  if (s === 'Critical') return '#ef4444';
  if (s === 'High')     return '#f97316';
  if (s === 'Medium')   return '#eab308';
  return '#22c55e';
}

function statusBadge(s: AlertStatus) {
  const map: Record<AlertStatus, { bg: string; text: string; label: string }> = {
    Escalated:     { bg: 'rgba(239,68,68,0.08)',    text: '#ef4444', label: 'Escalated' },
    Investigating: { bg: 'rgba(249,115,22,0.08)',   text: '#f97316', label: 'Investigating' },
    New:           { bg: 'rgba(59,130,246,0.08)',   text: '#3b82f6', label: 'New' },
    Resolved:      { bg: 'rgba(22,163,74,0.08)',    text: '#16a34a', label: 'Resolved' },
  };
  return map[s] ?? map.New;
}

function scoreColor(n: number) {
  if (n >= 90) return '#ef4444';
  if (n >= 75) return '#f97316';
  if (n >= 60) return '#eab308';
  return '#22c55e';
}

function matchFilter(a: Alert, f: FilterState) {
  const q = f.query.toLowerCase();
  if (q && ![a.id, a.title, a.sourceIp, a.user, a.host, a.logSource]
    .some(v => v.toLowerCase().includes(q))) return false;
  if (f.severity  !== 'すべて' && a.severity  !== f.severity)  return false;
  if (f.logSource !== 'すべて' && !a.logSource.toLowerCase().includes(f.logSource.toLowerCase())) return false;
  if (f.status    !== 'すべて' && a.status    !== f.status)    return false;
  return true;
}

interface Props { alerts: Alert[]; selectedId: string; onSelect: (id: string) => void; filter?: FilterState; limit?: number; }

export default function AlertList({ alerts, selectedId, onSelect, filter, limit }: Props) {
  const [sortMode, setSortMode] = useState<'severity' | 'recent'>('severity');
  const filtered = filter ? alerts.filter(a => matchFilter(a, filter)) : alerts;
  // 重大度順=バックエンドの並び（重大度→件数）をそのまま。新しい順=lastEpoch 降順
  const list = sortMode === 'recent'
    ? [...filtered].sort((a, b) => (b.lastEpoch ?? 0) - (a.lastEpoch ?? 0))
    : filtered;
  // ダッシュボードでは上位 limit 件だけ表示（全件は「アラート」タブ）
  const truncated = !!limit && list.length > limit;
  const display = limit ? list.slice(0, limit) : list;

  return (
    <div className="cyber-card overflow-hidden flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-3 border-b gap-2 flex-wrap" style={{ borderColor: '#e2e8f0' }}>
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: '#0f172a' }}>
          アラート一覧（本番ログ）
        </h2>
        <div className="flex items-center gap-2">
          {/* 並べ替えトグル */}
          <div className="flex items-center rounded-lg overflow-hidden" style={{ border: '1px solid #e2e8f0' }}>
            {([['severity', '重大度順'], ['recent', '新しい順']] as const).map(([key, label]) => {
              const active = sortMode === key;
              return (
                <button key={key} onClick={() => setSortMode(key)}
                  className="text-xs px-2.5 py-1 font-medium transition-all"
                  style={active
                    ? { background: 'rgba(59,130,246,0.1)', color: '#2563eb' }
                    : { background: 'transparent', color: '#94a3b8' }}>
                  {label}
                </button>
              );
            })}
          </div>
          <span className="text-xs" style={{ color: '#94a3b8' }}>
            {truncated ? `上位${limit} / 全${list.length}件` : `${list.length} 件`}
          </span>
        </div>
      </div>

      <div className="grid text-xs font-medium px-5 py-2 border-b"
        style={{ borderColor: '#e2e8f0', gridTemplateColumns: '80px 1fr 90px 110px 120px 60px 70px', background: '#f8fafc', color: '#64748b' }}>
        <span>ID</span>
        <span>アラート名</span>
        <span>重大度</span>
        <span>ステータス</span>
        <span>送信元IP</span>
        <span>時刻</span>
        <span className="text-right">AI</span>
      </div>

      <div className="overflow-y-auto flex-1">
        {display.length === 0 && (
          <div className="flex items-center justify-center h-32 text-sm" style={{ color: '#94a3b8' }}>
            条件に一致するアラートがありません
          </div>
        )}
        {display.map(a => {
          const sCol  = severityColor(a.severity);
          const badge = statusBadge(a.status);
          const isSelected = a.id === selectedId;
          return (
            <div key={a.id} className="grid px-5 py-3 border-b cursor-pointer transition-all"
              style={{
                borderColor: '#f1f5f9',
                gridTemplateColumns: '80px 1fr 90px 110px 120px 60px 70px',
                background: isSelected ? `${sCol}08` : 'transparent',
                borderLeft: isSelected ? `3px solid ${sCol}` : '3px solid transparent',
              }}
              onClick={() => onSelect(a.id)}>
              <span className="text-xs font-mono self-center" style={{ color: '#94a3b8' }}>{a.id}</span>
              <div className="self-center pr-2">
                <p className="text-sm font-medium leading-tight truncate" style={{ color: '#0f172a' }}>{a.title}</p>
                <p className="text-xs mt-0.5 truncate" style={{ color: '#94a3b8' }}>{a.user} · {a.host}</p>
              </div>
              <span className="self-center">
                <span className="text-xs px-2 py-0.5 rounded font-medium"
                  style={{ color: sCol, background: `${sCol}12`, border: `1px solid ${sCol}30` }}>
                  {a.severity}
                </span>
              </span>
              <span className="self-center">
                <span className="text-xs px-2 py-0.5 rounded font-medium"
                  style={{ color: badge.text, background: badge.bg }}>
                  {badge.label}
                </span>
              </span>
              <span className="text-xs font-mono self-center" style={{ color: '#64748b' }}>{a.sourceIp}</span>
              <span className="text-xs self-center" style={{ color: '#94a3b8' }}>{a.time}</span>
              <span className="text-right self-center">
                <span className="text-sm font-bold font-mono" style={{ color: scoreColor(a.aiScore) }}>
                  {a.aiScore}
                </span>
              </span>
            </div>
          );
        })}
      </div>

      {truncated && (
        <div className="px-5 py-2 border-t text-center text-xs" style={{ borderColor: '#e2e8f0', color: '#94a3b8' }}>
          上位 {limit} 件を表示中 ・ 全 {list.length} 件は「アラート」タブで
        </div>
      )}
    </div>
  );
}
