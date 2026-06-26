'use client';
import { useState, useEffect, useCallback } from 'react';

type GateState = 'loading' | 'authed' | 'login';

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>('loading');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [stage, setStage] = useState<'email' | 'otp'>('email');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    try {
      const r = await fetch('/api/auth/me', { cache: 'no-store' });
      setState(r.ok ? 'authed' : 'login');
    } catch {
      setState('login');
    }
  }, []);

  useEffect(() => { check(); }, [check]);

  async function requestOtp() {
    if (!email.trim() || busy) return;
    setBusy(true); setMsg('');
    try {
      const r = await fetch('/api/auth/request-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (r.ok) { setStage('otp'); setMsg('登録済みのメール宛にOTPを送信しました（5分間有効）'); }
      else { const d = await r.json().catch(() => ({})); setMsg(d.detail || '送信に失敗しました'); }
    } catch { setMsg('通信エラー'); } finally { setBusy(false); }
  }

  async function login() {
    if (!otp.trim() || busy) return;
    setBusy(true); setMsg('');
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), otp: otp.trim() }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.ok) { await check(); }
      else { setMsg(d.detail || 'OTPが正しくありません'); }
    } catch { setMsg('通信エラー'); } finally { setBusy(false); }
  }

  if (state === 'loading') {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: '#f1f5f9', color: '#94a3b8' }}>読み込み中…</div>;
  }
  if (state === 'authed') return <>{children}</>;

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#f1f5f9' }}>
      <div className="cyber-card w-full max-w-sm p-7">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm text-white"
            style={{ background: 'linear-gradient(135deg, #3b82f6, #7c3aed)' }}>S</div>
          <span className="text-lg font-bold" style={{ color: '#0f172a' }}>SOAR</span>
        </div>
        <p className="text-xs mb-5" style={{ color: '#64748b' }}>メール認証でログインしてください</p>

        <label className="text-xs font-medium" style={{ color: '#64748b' }}>メールアドレス</label>
        <input type="email" value={email} disabled={stage === 'otp'}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && stage === 'email' && requestOtp()}
          placeholder="you@example.com"
          className="w-full mt-1 mb-3 px-3 py-2.5 rounded-lg text-sm outline-none disabled:opacity-60"
          style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#0f172a' }} />

        {stage === 'otp' && (
          <>
            <label className="text-xs font-medium" style={{ color: '#64748b' }}>OTP（6桁）</label>
            <input type="text" inputMode="numeric" value={otp} maxLength={6}
              onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
              onKeyDown={e => e.key === 'Enter' && login()}
              placeholder="123456"
              className="w-full mt-1 mb-3 px-3 py-2.5 rounded-lg text-lg font-mono tracking-widest text-center outline-none"
              style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#0f172a' }} />
          </>
        )}

        {msg && <p className="text-xs mb-3" style={{ color: msg.includes('送信') ? '#16a34a' : '#ef4444' }}>{msg}</p>}

        {stage === 'email' ? (
          <button onClick={requestOtp} disabled={busy || !email.trim()}
            className="w-full py-2.5 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #3b82f6, #7c3aed)' }}>
            {busy ? '送信中…' : 'OTPを送信'}
          </button>
        ) : (
          <div className="space-y-2">
            <button onClick={login} disabled={busy || otp.length < 6}
              className="w-full py-2.5 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #3b82f6, #7c3aed)' }}>
              {busy ? '確認中…' : 'ログイン'}
            </button>
            <button onClick={() => { setStage('email'); setOtp(''); setMsg(''); }}
              className="w-full py-2 rounded-lg text-xs transition-all hover:opacity-80"
              style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b' }}>
              メールを変更
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
