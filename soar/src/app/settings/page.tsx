'use client';
import { useState, useEffect } from 'react';
import Nav from '@/components/Nav';

interface Service { name: string; service: string; url: string; running: boolean; state: string; uptime: string; }
interface LogSource { name: string; status: string; events: number; icon: string; }
interface User { email: string; role: string; createdAt: string; createdBy: string; }

const NOTIFICATION_CHANNELS = [
  { icon: '✉️', name: 'Email',           connected: true,  endpoint: 'メール通知（実連携）', real: true },
  { icon: '💬', name: 'Slack',           connected: false, endpoint: '未連携', real: false },
  { icon: '👥', name: 'Microsoft Teams', connected: false, endpoint: '未連携', real: false },
  { icon: '🎫', name: 'Jira',            connected: false, endpoint: '未連携', real: false },
];

type Section = 'logsource' | 'notifications' | 'thresholds' | 'users';
const sections: { id: Section; label: string; demo?: boolean }[] = [
  { id: 'logsource', label: 'ログソース' },
  { id: 'notifications', label: '通知設定' },
  { id: 'thresholds', label: 'アラート閾値', demo: true },
  { id: 'users', label: 'ユーザー管理' },
];

const POLL_MS = 20000;

function DemoBadge() {
  return (
    <span className="text-xs px-2 py-0.5 rounded font-medium"
      style={{ background: 'rgba(100,116,139,0.1)', border: '1px solid rgba(100,116,139,0.25)', color: '#64748b' }}>
      デモ（未連携）
    </span>
  );
}

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState<Section>('logsource');
  const [thresholds, setThresholds] = useState({ critical: 90, high: 70, medium: 50 });
  const [services, setServices] = useState<Service[]>([]);
  const [logSources, setLogSources] = useState<LogSource[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [myRole, setMyRole] = useState<string>('viewer');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('viewer');
  const [userMsg, setUserMsg] = useState('');

  const loadUsers = async () => {
    try {
      const r = await fetch('/api/users', { cache: 'no-store' });
      if (r.ok) setUsers((await r.json()).users ?? []);
    } catch { /* keep */ }
  };

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [rs, rd, ru, rm] = await Promise.all([
          fetch('/api/services', { cache: 'no-store' }),
          fetch('/api/dashboard', { cache: 'no-store' }),
          fetch('/api/users', { cache: 'no-store' }),
          fetch('/api/auth/me', { cache: 'no-store' }),
        ]);
        if (!alive) return;
        if (rs.ok) setServices(await rs.json());
        if (rd.ok) setLogSources((await rd.json()).logSources ?? []);
        if (ru.ok) setUsers((await ru.json()).users ?? []);
        if (rm.ok) setMyRole((await rm.json()).role ?? 'viewer');
      } catch { /* keep */ }
    };
    load();
    const id = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const isAdmin = myRole === 'admin';

  async function addUser() {
    if (!newEmail.trim()) return;
    setUserMsg('');
    try {
      const r = await fetch('/api/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail.trim(), role: newRole }),
      });
      const d = await r.json();
      if (d.ok) { setNewEmail(''); setUserMsg('追加しました'); loadUsers(); }
      else setUserMsg(d.error || d.detail || '追加に失敗しました');
    } catch { setUserMsg('通信エラー'); }
  }

  async function removeUser(email: string) {
    setUserMsg('');
    try {
      const r = await fetch('/api/users', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role: 'viewer' }),
      });
      const d = await r.json();
      if (d.ok) { setUserMsg('削除しました'); loadUsers(); }
      else setUserMsg(d.error || d.detail || '削除に失敗しました');
    } catch { setUserMsg('通信エラー'); }
  }

  const runningCount = services.filter(s => s.running).length;

  return (
    <div className="min-h-screen" style={{ background: '#f1f5f9' }}>
      <Nav />
      <div className="px-4 pt-6 pb-12 md:px-8">
        <div className="mb-5">
          <h1 className="text-xl font-bold" style={{ color: '#0f172a' }}>設定</h1>
          <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>
            「ログソース」は実際の監視対象を表示します（通知・閾値・ユーザーはデモ）
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
          {/* sidebar */}
          <div className="lg:col-span-1">
            <div className="cyber-card p-2">
              {sections.map(s => (
                <button key={s.id} onClick={() => setActiveSection(s.id)}
                  className="w-full text-left px-4 py-2.5 rounded-lg text-sm transition-colors flex items-center justify-between"
                  style={{
                    background: activeSection === s.id ? 'rgba(59,130,246,0.08)' : 'transparent',
                    color: activeSection === s.id ? '#3b82f6' : '#475569',
                    fontWeight: activeSection === s.id ? 600 : 400,
                  }}>
                  {s.label}
                  {s.demo && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#f1f5f9', color: '#94a3b8' }}>demo</span>}
                </button>
              ))}
            </div>
          </div>

          {/* content */}
          <div className="lg:col-span-3 space-y-4">

            {activeSection === 'logsource' && (
              <>
                {/* 実ログソース */}
                <div className="cyber-card overflow-hidden">
                  <div className="px-5 py-4 border-b" style={{ borderColor: '#e2e8f0' }}>
                    <h2 className="text-sm font-semibold" style={{ color: '#0f172a' }}>監視中のログソース</h2>
                    <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>実際に集計しているログ源（リアルタイム）</p>
                  </div>
                  <div className="divide-y" style={{ borderColor: '#f1f5f9' }}>
                    {logSources.length === 0 && <div className="px-5 py-4 text-xs" style={{ color: '#94a3b8' }}>読み込み中…</div>}
                    {logSources.map((src, i) => (
                      <div key={i} className="px-5 py-3.5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{src.icon}</span>
                          <p className="text-sm font-medium" style={{ color: '#0f172a' }}>{src.name}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono" style={{ color: '#64748b' }}>{src.events.toLocaleString()} 件</span>
                          <span className="text-xs px-2 py-0.5 rounded font-medium"
                            style={{ color: '#16a34a', background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.2)' }}>
                            {src.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 実サービス全量 */}
                <div className="cyber-card overflow-hidden">
                  <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: '#e2e8f0' }}>
                    <div>
                      <h2 className="text-sm font-semibold" style={{ color: '#0f172a' }}>監視中のサービス（systemd）</h2>
                      <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>稼働状態を監視している全サービス</p>
                    </div>
                    <span className="text-xs px-2 py-1 rounded font-medium"
                      style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', color: '#3b82f6' }}>
                      {runningCount} / {services.length} 稼働
                    </span>
                  </div>
                  <div className="overflow-x-auto" style={{ maxHeight: 460 }}>
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                          {['サービス', '状態', '稼働時間'].map(h => (
                            <th key={h} className="text-left px-5 py-2.5 font-medium" style={{ color: '#64748b' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {services.length === 0 && (
                          <tr><td colSpan={3} className="px-5 py-6 text-center" style={{ color: '#94a3b8' }}>読み込み中…</td></tr>
                        )}
                        {services.map((s, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td className="px-5 py-2.5">
                              <p className="text-sm font-medium" style={{ color: '#0f172a' }}>{s.name}</p>
                              <p className="text-xs font-mono" style={{ color: '#94a3b8' }}>{s.service}</p>
                            </td>
                            <td className="px-5 py-2.5">
                              <span className="text-xs px-2 py-0.5 rounded font-medium"
                                style={s.running
                                  ? { color: '#16a34a', background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.2)' }
                                  : { color: '#ef4444', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                                {s.running ? '稼働中' : '停止'}
                              </span>
                            </td>
                            <td className="px-5 py-2.5 font-mono" style={{ color: '#475569' }}>{s.uptime || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {activeSection === 'notifications' && (
              <div className="cyber-card overflow-hidden">
                <div className="px-5 py-4 border-b" style={{ borderColor: '#e2e8f0' }}>
                  <h2 className="text-sm font-semibold" style={{ color: '#0f172a' }}>通知チャネル設定</h2>
                  <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>
                    重大アラート(Critical/High)を15分ごとにメール通知（Email のみ実連携）
                  </p>
                </div>
                <div className="divide-y" style={{ borderColor: '#f1f5f9' }}>
                  {NOTIFICATION_CHANNELS.map((ch, i) => (
                    <div key={i} className="px-5 py-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{ch.icon}</span>
                        <div>
                          <p className="text-sm font-medium" style={{ color: '#0f172a' }}>{ch.name}</p>
                          <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>{ch.endpoint}</p>
                        </div>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded font-medium"
                        style={ch.real
                          ? { color: '#16a34a', background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.2)' }
                          : { color: '#94a3b8', background: '#f1f5f9', border: '1px solid #e2e8f0' }}>
                        {ch.real ? '✓ 実連携' : '未連携'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeSection === 'thresholds' && (
              <div className="cyber-card p-5 space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold" style={{ color: '#0f172a' }}>アラート閾値設定</h2>
                    <p className="text-xs mt-1" style={{ color: '#64748b' }}>AIスコアの閾値（デモ・未保存）</p>
                  </div>
                  <DemoBadge />
                </div>
                {[
                  { level: 'Critical', key: 'critical' as const, color: '#ef4444' },
                  { level: 'High',     key: 'high'     as const, color: '#f97316' },
                  { level: 'Medium',   key: 'medium'   as const, color: '#d97706' },
                ].map(t => (
                  <div key={t.key} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold" style={{ color: t.color }}>{t.level}</span>
                      <span className="text-sm font-mono font-bold" style={{ color: t.color }}>{thresholds[t.key]}</span>
                    </div>
                    <input type="range" min={1} max={100} value={thresholds[t.key]}
                      onChange={e => setThresholds(prev => ({ ...prev, [t.key]: Number(e.target.value) }))}
                      className="w-full" style={{ accentColor: t.color }} />
                  </div>
                ))}
              </div>
            )}

            {activeSection === 'users' && (
              <div className="cyber-card overflow-hidden">
                <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: '#e2e8f0' }}>
                  <div>
                    <h2 className="text-sm font-semibold" style={{ color: '#0f172a' }}>ユーザー管理</h2>
                    <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>
                      メールOTPでログインできるユーザー（追加・削除は管理者のみ）
                    </p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded font-medium"
                    style={{ color: isAdmin ? '#7c3aed' : '#64748b', background: isAdmin ? 'rgba(124,58,237,0.08)' : '#f1f5f9', border: '1px solid #e2e8f0' }}>
                    あなた: {isAdmin ? '管理者' : '閲覧者'}
                  </span>
                </div>

                {/* 追加フォーム（admin のみ） */}
                {isAdmin && (
                  <div className="px-5 py-3 border-b flex flex-wrap items-end gap-2" style={{ borderColor: '#e2e8f0', background: '#f8fafc' }}>
                    <div className="flex-1 min-w-48">
                      <label className="text-xs" style={{ color: '#64748b' }}>メールアドレス</label>
                      <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addUser()}
                        placeholder="user@example.com"
                        className="w-full mt-1 px-3 py-2 rounded-lg text-xs outline-none"
                        style={{ background: '#fff', border: '1px solid #e2e8f0', color: '#0f172a' }} />
                    </div>
                    <div>
                      <label className="text-xs" style={{ color: '#64748b' }}>権限</label>
                      <select value={newRole} onChange={e => setNewRole(e.target.value)}
                        className="block mt-1 px-3 py-2 rounded-lg text-xs outline-none"
                        style={{ background: '#fff', border: '1px solid #e2e8f0', color: '#0f172a' }}>
                        <option value="viewer">閲覧者</option>
                        <option value="admin">管理者</option>
                      </select>
                    </div>
                    <button onClick={addUser}
                      className="px-4 py-2 rounded-lg text-xs font-medium text-white transition-all hover:opacity-90"
                      style={{ background: 'linear-gradient(135deg, #3b82f6, #7c3aed)' }}>＋ 追加</button>
                    {userMsg && <span className="text-xs" style={{ color: userMsg.includes('しました') ? '#16a34a' : '#ef4444' }}>{userMsg}</span>}
                  </div>
                )}

                <div className="divide-y" style={{ borderColor: '#f1f5f9' }}>
                  {users.length === 0 && <div className="px-5 py-4 text-xs" style={{ color: '#94a3b8' }}>読み込み中…</div>}
                  {users.map((u, i) => (
                    <div key={u.email || i} className="px-5 py-3.5 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white"
                          style={{ background: u.role === 'admin' ? 'linear-gradient(135deg, #7c3aed, #ef4444)' : 'linear-gradient(135deg, #3b82f6, #7c3aed)' }}>
                          {(u.email?.[0] ?? '?').toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium" style={{ color: '#0f172a' }}>{u.email}</p>
                          <p className="text-xs" style={{ color: '#94a3b8' }}>登録: {u.createdBy} · {(u.createdAt || '').slice(0, 10)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs px-2 py-0.5 rounded font-medium"
                          style={u.role === 'admin'
                            ? { color: '#7c3aed', background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)' }
                            : { background: '#f1f5f9', border: '1px solid #e2e8f0', color: '#475569' }}>
                          {u.role === 'admin' ? '管理者' : '閲覧者'}
                        </span>
                        {isAdmin && (
                          <button onClick={() => removeUser(u.email)}
                            className="text-xs px-2.5 py-1 rounded-lg border transition-all hover:opacity-80"
                            style={{ borderColor: '#fecaca', color: '#ef4444', background: '#fff' }}>削除</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
