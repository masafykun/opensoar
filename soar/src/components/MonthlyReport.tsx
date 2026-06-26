'use client';
import { useState } from 'react';

interface Monthly {
  totalEvents: string | number; highSeverity: number; bannedIps: number;
  uniqueSources: number; logSourceUptime: string; detectionRules: number;
}

const DASH = '—';

export default function MonthlyReport({ monthly }: { monthly?: Monthly }) {
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);

  const m: Monthly = monthly ?? {
    totalEvents: DASH, highSeverity: DASH as unknown as number, bannedIps: DASH as unknown as number,
    uniqueSources: DASH as unknown as number, logSourceUptime: DASH, detectionRules: DASH as unknown as number,
  };

  const metrics = [
    { label: '総リクエスト(直近)', value: m.totalEvents,      color: '#3b82f6', icon: '📊' },
    { label: '重大度 High以上',   value: m.highSeverity,      color: '#ef4444', icon: '🚨' },
    { label: 'BAN(累計)',         value: m.bannedIps,         color: '#7c3aed', icon: '🛡' },
    { label: 'ユニーク攻撃元',     value: m.uniqueSources,     color: '#f97316', icon: '🌐' },
    { label: 'サービス稼働率',     value: m.logSourceUptime,   color: '#16a34a', icon: '✅' },
    { label: '検知ルール数',       value: m.detectionRules,    color: '#0ea5e9', icon: '💡' },
  ];

  function handleGenerate() {
    setGenerating(true);
    setTimeout(() => { setGenerating(false); setGenerated(true); }, 1800);
  }

  return (
    <div className="cyber-card p-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: '#0f172a' }}>サマリーレポート</h2>
          <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>本番VPS 実ログ集計</p>
        </div>
        <button
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all hover:opacity-80 disabled:opacity-50"
          style={{
            background: generated ? 'rgba(22,163,74,0.08)' : 'rgba(59,130,246,0.08)',
            border: generated ? '1px solid rgba(22,163,74,0.25)' : '1px solid rgba(59,130,246,0.25)',
            color: generated ? '#16a34a' : '#3b82f6',
          }}
          disabled={generating}
          onClick={handleGenerate}>
          {generating ? (
            <>
              <span className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin" />
              生成中...
            </>
          ) : generated ? '✓ ダウンロード準備完了' : '📄 レポートを生成（デモ）'}
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {metrics.map(mt => (
          <div key={mt.label} className="rounded-xl p-4" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <div className="flex items-center gap-2 mb-2">
              <span>{mt.icon}</span>
              <span className="text-xs" style={{ color: '#64748b' }}>{mt.label}</span>
            </div>
            <span className="text-2xl font-bold font-mono" style={{ color: mt.color }}>{mt.value}</span>
          </div>
        ))}
      </div>

      {generated && (
        <div className="mt-4 p-3 rounded-xl text-xs animate-fade-up"
          style={{ background: 'rgba(22,163,74,0.05)', border: '1px solid rgba(22,163,74,0.15)' }}>
          <p className="font-medium mb-1" style={{ color: '#16a34a' }}>✓ レポートの生成が完了しました（デモ）</p>
          <p style={{ color: '#64748b' }}>
            実際のPDF出力は未実装です。集計値は本番ログのリアルタイム値です。
          </p>
        </div>
      )}
    </div>
  );
}
