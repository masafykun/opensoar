'use client';
import { useState, useEffect } from 'react';
import { type Alert, type Severity } from '@/data/sampleData';

function severityColor(s: Severity) {
  if (s === 'Critical') return '#ef4444';
  if (s === 'High')     return '#f97316';
  if (s === 'Medium')   return '#eab308';
  return '#22c55e';
}

function scoreColor(n: number) {
  if (n >= 90) return '#ef4444';
  if (n >= 75) return '#f97316';
  if (n >= 60) return '#eab308';
  return '#22c55e';
}

interface Props { alert?: Alert; }

export default function AlertDetail({ alert }: Props) {
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set());
  const [showAiChat, setShowAiChat] = useState(false);
  const [localStatus, setLocalStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // アラートが切り替わったらローカルステータスをリセット
  useEffect(() => { setLocalStatus(null); setCheckedItems(new Set()); }, [alert?.id]);

  async function updateStatus(status: string) {
    if (!alert || saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/alerts/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: alert.id, status }),
      });
      const d = await res.json();
      if (d.ok) setLocalStatus(status);
    } catch { /* ignore */ }
    finally { setSaving(false); }
  }

  if (!alert) {
    return (
      <div className="cyber-card flex items-center justify-center h-full" style={{ minHeight: 300 }}>
        <p className="text-sm" style={{ color: '#94a3b8' }}>アラートを選択してください</p>
      </div>
    );
  }

  const sCol = severityColor(alert.severity);
  const effStatus = localStatus ?? alert.status;

  function toggleCheck(i: number) {
    setCheckedItems(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  return (
    <div className="cyber-card flex flex-col h-full overflow-hidden animate-slide-in">
      <div className="px-5 py-4 border-b" style={{ borderColor: '#e2e8f0', borderLeft: `3px solid ${sCol}` }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-mono mb-1" style={{ color: '#94a3b8' }}>{alert.id}</p>
            <h3 className="text-base font-semibold leading-snug" style={{ color: '#0f172a' }}>{alert.title}</h3>
          </div>
          <span className="text-xs px-2 py-1 rounded font-medium shrink-0"
            style={{ color: sCol, background: `${sCol}12`, border: `1px solid ${sCol}30` }}>
            {alert.severity}
          </span>
        </div>
      </div>

      <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
        <div className="grid grid-cols-2 gap-2 text-xs">
          {[
            ['ステータス', effStatus],
            ['ユーザー',   alert.user],
            ['ホスト',     alert.host],
            ['送信元IP',   alert.sourceIp],
            ['ログソース', alert.logSource],
            ['発生時刻',   alert.time],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg p-2.5" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <p className="mb-1" style={{ color: '#94a3b8' }}>{k}</p>
              <p className="font-medium truncate font-mono text-xs" style={{ color: '#0f172a' }}>{v}</p>
            </div>
          ))}
        </div>

        <div className="rounded-xl p-4" style={{ background: 'rgba(124,58,237,0.05)', border: '1px solid rgba(124,58,237,0.15)' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-base">🤖</span>
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#7c3aed' }}>AI 分析サマリー</span>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span style={{ color: '#94a3b8' }}>Confidence</span>
              <span className="font-bold font-mono" style={{ color: scoreColor(alert.confidence) }}>{alert.confidence}%</span>
              <span style={{ color: '#94a3b8' }}>根拠ログ</span>
              <span className="font-mono" style={{ color: '#475569' }}>{alert.evidenceLogs}件</span>
            </div>
          </div>
          <p className="text-sm leading-relaxed" style={{ color: '#334155' }}>{alert.aiSummary}</p>
          <div className="mt-3 flex items-center gap-3">
            <span className="text-xs" style={{ color: '#94a3b8' }}>AIスコア</span>
            <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: '#e2e8f0' }}>
              <div className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${alert.aiScore}%`,
                  background: `linear-gradient(90deg, ${scoreColor(alert.aiScore)}, ${scoreColor(alert.aiScore)}cc)`,
                }} />
            </div>
            <span className="text-sm font-bold font-mono w-8 text-right"
              style={{ color: scoreColor(alert.aiScore) }}>{alert.aiScore}</span>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#64748b' }}>タイムライン（実ログ）</p>
          <div className="relative pl-4">
            <div className="absolute left-1.5 top-0 bottom-0 w-px" style={{ background: '#e2e8f0' }} />
            {alert.timeline.map((ev, i) => (
              <div key={i} className="relative mb-3 last:mb-0">
                <div className="absolute -left-2.5 top-1.5 w-2 h-2 rounded-full"
                  style={{
                    background: i === 0 ? sCol : i === alert.timeline.length - 1 ? '#16a34a' : '#3b82f6',
                    boxShadow: i === 0 ? `0 0 6px ${sCol}` : undefined,
                  }} />
                <div className="ml-2">
                  <span className="text-xs font-mono" style={{ color: '#0ea5e9' }}>{ev.time}</span>
                  <p className="text-xs mt-0.5 leading-relaxed font-mono break-all" style={{ color: '#475569' }}>{ev.event}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#64748b' }}>推奨対応</p>
          <div className="space-y-2">
            {alert.recommendations.map((rec, i) => (
              <label key={i} className="flex items-start gap-3 cursor-pointer group">
                <div className="w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5 transition-all"
                  style={{
                    border: checkedItems.has(i) ? '1px solid #16a34a' : '1px solid #e2e8f0',
                    background: checkedItems.has(i) ? 'rgba(22,163,74,0.1)' : '#f8fafc',
                  }}
                  onClick={() => toggleCheck(i)}>
                  {checkedItems.has(i) && <span className="text-xs" style={{ color: '#16a34a' }}>✓</span>}
                </div>
                <span className={`text-sm transition-colors ${checkedItems.has(i) ? 'line-through' : ''}`}
                  style={{ color: checkedItems.has(i) ? '#94a3b8' : '#334155' }}>
                  {rec}
                </span>
              </label>
            ))}
          </div>
          {checkedItems.size > 0 && (
            <p className="text-xs mt-2" style={{ color: '#94a3b8' }}>
              {checkedItems.size} / {alert.recommendations.length} 完了
            </p>
          )}
        </div>

        {showAiChat && (
          <div className="rounded-xl p-4 animate-fade-up" style={{ background: 'rgba(14,165,233,0.05)', border: '1px solid rgba(14,165,233,0.2)' }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs text-white"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #3b82f6)' }}>AI</span>
              <span className="text-xs font-semibold" style={{ color: '#0ea5e9' }}>SOAR AI アナリスト</span>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: '#334155' }}>{alert.aiSummary}</p>
            <p className="text-xs mt-2" style={{ color: '#94a3b8' }}>
              ※ さらに詳しく聞くには下部の「SOAR AI アナリスト」チャットへ。
            </p>
          </div>
        )}
      </div>

      <div className="px-5 py-4 border-t space-y-2" style={{ borderColor: '#e2e8f0' }}>
        <p className="text-xs" style={{ color: '#94a3b8' }}>
          対応ステータス: <span className="font-semibold" style={{
            color: effStatus === 'Resolved' ? '#16a34a' : effStatus === 'Investigating' ? '#f97316' : '#3b82f6',
          }}>{effStatus}</span>{saving && <span className="ml-2">保存中…</span>}
        </p>
        <div className="grid grid-cols-3 gap-2">
          <button className="py-2 rounded-lg text-xs font-medium transition-all hover:opacity-80 disabled:opacity-50"
            style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.25)', color: '#7c3aed' }}
            onClick={() => setShowAiChat(!showAiChat)}>
            🤖 AI要約
          </button>
          <button className="py-2 rounded-lg text-xs font-medium transition-all hover:opacity-80 disabled:opacity-50"
            disabled={saving || effStatus === 'Investigating'}
            style={{
              background: effStatus === 'Investigating' ? 'rgba(249,115,22,0.16)' : 'rgba(249,115,22,0.08)',
              border: '1px solid rgba(249,115,22,0.25)', color: '#f97316',
            }}
            onClick={() => updateStatus('Investigating')}>
            🔍 調査中
          </button>
          <button className="py-2 rounded-lg text-xs font-medium transition-all hover:opacity-80 disabled:opacity-50"
            disabled={saving || effStatus === 'Resolved'}
            style={{
              background: effStatus === 'Resolved' ? 'rgba(22,163,74,0.16)' : 'rgba(22,163,74,0.08)',
              border: '1px solid rgba(22,163,74,0.25)', color: '#16a34a',
            }}
            onClick={() => updateStatus('Resolved')}>
            {effStatus === 'Resolved' ? '✓ 解決済み' : '✓ 解決にする'}
          </button>
        </div>
      </div>
    </div>
  );
}
