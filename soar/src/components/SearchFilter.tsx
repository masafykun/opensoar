'use client';
import { useState } from 'react';

interface Props { onFilter?: (f: FilterState) => void; }

export interface FilterState {
  query: string;
  severity: string;
  logSource: string;
  status: string;
  timeRange: string;
}

const severities = ['すべて', 'Critical', 'High', 'Medium', 'Low'];
const logSources = ['すべて', 'nginx', 'SSH', 'Fail2ban'];
const statuses   = ['すべて', 'New', 'Escalated', 'Investigating', 'Resolved'];
const timeRanges = ['直近1時間', '直近24時間', '直近7日', '直近30日'];

const selectStyle = {
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  color: '#0f172a',
  fontFamily: 'Inter, sans-serif',
};

function FilterChip({ label, options, value, onChange }: {
  label: string; options: string[]; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium" style={{ color: '#64748b' }}>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="text-xs rounded-lg px-3 py-2 outline-none transition-colors cursor-pointer"
        style={selectStyle}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

export default function SearchFilter({ onFilter }: Props) {
  const [f, setF] = useState<FilterState>({
    query: '', severity: 'すべて', logSource: 'すべて', status: 'すべて', timeRange: '直近24時間',
  });

  function update(patch: Partial<FilterState>) {
    const next = { ...f, ...patch };
    setF(next);
    onFilter?.(next);
  }

  return (
    <div className="cyber-card p-4">
      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex flex-col gap-1 flex-1 min-w-48">
          <span className="text-xs font-medium" style={{ color: '#64748b' }}>アラート検索</span>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: '#94a3b8' }}>🔍</span>
            <input type="text" placeholder="IP、アラート名..."
              value={f.query}
              onChange={e => update({ query: e.target.value })}
              className="w-full pl-8 pr-4 py-2 text-xs rounded-lg outline-none"
              style={{ ...selectStyle }}
            />
          </div>
        </div>
        <FilterChip label="重大度"     options={severities} value={f.severity}  onChange={v => update({ severity: v })} />
        <FilterChip label="ログソース" options={logSources}  value={f.logSource} onChange={v => update({ logSource: v })} />
        <FilterChip label="ステータス" options={statuses}    value={f.status}    onChange={v => update({ status: v })} />
        <FilterChip label="期間"       options={timeRanges}  value={f.timeRange} onChange={v => update({ timeRange: v })} />
        <button className="text-xs px-4 py-2 rounded-lg font-medium transition-all hover:opacity-80"
          style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)', color: '#3b82f6' }}
          onClick={() => {
            const reset: FilterState = { query: '', severity: 'すべて', logSource: 'すべて', status: 'すべて', timeRange: '直近24時間' };
            setF(reset);
            onFilter?.(reset);
          }}>
          リセット
        </button>
      </div>
    </div>
  );
}
