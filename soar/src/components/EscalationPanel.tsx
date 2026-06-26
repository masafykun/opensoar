'use client';
import { useState } from 'react';

const CHANNELS = [
  { icon: '💬', name: 'Slack',   color: '#16a34a', status: '接続済み' },
  { icon: '👥', name: 'Teams',   color: '#3b82f6', status: '接続済み' },
  { icon: '✉️', name: 'Email',   color: '#7c3aed', status: '設定済み' },
  { icon: '🎫', name: 'Ticket',  color: '#f97316', status: 'Jira連携' },
];

const ESCALATIONS = [
  { id: 'ESC-041', title: 'ALT-1029: 管理者アカウント侵害疑い', expert: '田中 太郎（外部SOCエンジニア）', sla: '30分', status: 'reviewing', time: '11分前' },
  { id: 'ESC-040', title: 'ALT-1022: ランサムウェア疑い（先週）', expert: '山田 花子（インシデントレスポンス）', sla: '完了', status: 'resolved', time: '3日前' },
];

export default function EscalationPanel() {
  const [showForm, setShowForm] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  return (
    <div className="cyber-card p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: '#0f172a' }}>
            専門家エスカレーション
          </h2>
          <span className="text-xs px-2 py-0.5 rounded font-medium"
            style={{ background: 'rgba(100,116,139,0.1)', border: '1px solid rgba(100,116,139,0.25)', color: '#64748b' }}>
            デモ
          </span>
        </div>
        <span className="text-xs px-2 py-1 rounded"
          style={{ background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.2)', color: '#16a34a' }}>
          2名のエンジニアがオンライン
        </span>
      </div>

      {/* concept banner */}
      <div className="rounded-xl p-4" style={{ background: 'rgba(59,130,246,0.04)', border: '1px solid rgba(59,130,246,0.15)' }}>
        <p className="text-xs leading-relaxed" style={{ color: '#475569' }}>
          🛡 AIだけでは判断が難しいインシデントや重大アラートは、
          外部のセキュリティ専門家へリアルタイムでエスカレーションできます。
          専門家がログを直接レビューし、対応を支援します。
          <span style={{ color: '#94a3b8' }}>（このパネルはデモ表示です — Slack/Teams/Jira・外部SOCは未連携）</span>
        </p>
      </div>

      {/* channels */}
      <div>
        <p className="text-xs font-medium mb-3" style={{ color: '#94a3b8' }}>通知チャネル</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {CHANNELS.map(ch => (
            <div key={ch.name} className="rounded-lg p-3 flex items-center gap-2 cursor-pointer transition-all hover:opacity-80"
              style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <span className="text-lg">{ch.icon}</span>
              <div>
                <p className="text-xs font-medium" style={{ color: '#0f172a' }}>{ch.name}</p>
                <p className="text-xs" style={{ color: ch.color }}>{ch.status}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* active escalations */}
      <div>
        <p className="text-xs font-medium mb-3" style={{ color: '#94a3b8' }}>対応履歴</p>
        <div className="space-y-2">
          {ESCALATIONS.map(e => (
            <div key={e.id} className="rounded-lg p-3" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono" style={{ color: '#64748b' }}>{e.id}</span>
                <span className="text-xs px-2 py-0.5 rounded font-medium"
                  style={e.status === 'reviewing'
                    ? { color: '#f97316', background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.2)' }
                    : { color: '#16a34a', background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.2)' }
                  }>
                  {e.status === 'reviewing' ? 'レビュー中' : '解決済み'}
                </span>
              </div>
              <p className="text-sm font-medium mb-1" style={{ color: '#0f172a' }}>{e.title}</p>
              <div className="flex items-center justify-between text-xs" style={{ color: '#94a3b8' }}>
                <span>👤 {e.expert}</span>
                <span>SLA: {e.sla} · {e.time}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* escalation form */}
      {showForm && !submitted && (
        <div className="rounded-xl p-4 animate-fade-up space-y-3"
          style={{ background: 'rgba(249,115,22,0.04)', border: '1px solid rgba(249,115,22,0.2)' }}>
          <p className="text-sm font-semibold" style={{ color: '#f97316' }}>インシデントレビュー依頼</p>
          <textarea className="w-full px-3 py-2 rounded-lg text-xs outline-none resize-none"
            rows={3} placeholder="状況の補足（任意）..."
            style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#0f172a' }} />
          <div className="flex gap-2">
            <button className="flex-1 py-2 rounded-lg text-xs font-medium transition-all hover:opacity-80"
              style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.25)', color: '#f97316' }}
              onClick={() => setSubmitted(true)}>
              依頼を送信（デモ）
            </button>
            <button className="px-4 py-2 rounded-lg text-xs transition-all hover:opacity-80"
              style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b' }}
              onClick={() => setShowForm(false)}>
              キャンセル
            </button>
          </div>
        </div>
      )}
      {submitted && (
        <div className="rounded-xl p-4 text-center animate-fade-up"
          style={{ background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.2)' }}>
          <p className="text-sm font-medium" style={{ color: '#16a34a' }}>✓ 依頼を送信しました（デモ）</p>
          <p className="text-xs mt-1" style={{ color: '#64748b' }}>実際の外部連携は未実装です。</p>
        </div>
      )}

      {/* CTA buttons */}
      {!showForm && (
        <div className="grid grid-cols-3 gap-2">
          <button className="py-2.5 rounded-xl text-xs font-medium transition-all hover:opacity-80"
            style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.25)', color: '#f97316' }}
            onClick={() => setShowForm(true)}>
            👤 専門家に相談
          </button>
          <button className="py-2.5 rounded-xl text-xs font-medium transition-all hover:opacity-80"
            style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)', color: '#3b82f6' }}
            onClick={() => { setShowForm(true); setSubmitted(false); }}>
            🔍 レビュー依頼
          </button>
          <button className="py-2.5 rounded-xl text-xs font-medium transition-all hover:opacity-80"
            style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.25)', color: '#7c3aed' }}>
            🎫 チケット作成
          </button>
        </div>
      )}
    </div>
  );
}
