'use client';
import { useState } from 'react';
import { type Alert } from '@/data/sampleData';

const SUGGESTIONS = [
  '今一番危険な攻撃元はどれ？',
  'SSHブルートフォースへの対策は？',
  '機密ファイル探索の対応手順を作って',
  '今のリスク状況を要約して',
];

interface Message { role: 'user' | 'ai'; text: string; }

const INITIAL_MSG: Message = {
  role: 'ai',
  text: 'こんにちは。SOAR AIアナリストです。現在の実際の攻撃・ログ状況をもとにお答えします。自然言語でどうぞ。',
};

export default function AIChat({ selectedAlert }: { selectedAlert?: Alert }) {
  const [messages, setMessages] = useState<Message[]>([INITIAL_MSG]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return;
    const q = text.trim();
    const history = messages.map(m => ({ role: m.role, text: m.text }));
    setMessages(prev => [...prev, { role: 'user', text: q }]);
    setInput('');
    setLoading(true);
    try {
      const message = selectedAlert
        ? `${q}\n（参考: 現在選択中のアラート ${selectedAlert.id} / 送信元 ${selectedAlert.sourceIp} / ${selectedAlert.title}）`
        : q;
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'ai', text: data.reply ?? '（応答がありませんでした）' }]);
    } catch {
      setMessages(prev => [...prev, { role: 'ai', text: '（AIへの通信に失敗しました）' }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="cyber-card flex flex-col" style={{ height: 480 }}>
      <div className="flex items-center gap-3 px-5 py-3 border-b" style={{ borderColor: '#e2e8f0' }}>
        <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
          style={{ background: 'linear-gradient(135deg, #7c3aed, #3b82f6)' }}>
          AI
        </span>
        <div>
          <p className="text-sm font-semibold" style={{ color: '#0f172a' }}>SOAR AI アナリスト</p>
          <p className="text-xs" style={{ color: '#16a34a' }}>● オンライン</p>
        </div>
        <span className="ml-auto text-xs px-2 py-1 rounded"
          style={{ background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.15)', color: '#7c3aed' }}>
          gpt-4o-mini
        </span>
      </div>

      <div className="px-5 pt-3 pb-2 flex flex-wrap gap-2">
        {SUGGESTIONS.map(s => (
          <button key={s} onClick={() => sendMessage(s)}
            className="text-xs px-3 py-1.5 rounded-full transition-all hover:opacity-80"
            style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', color: '#3b82f6' }}>
            {s}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-2 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-xs font-medium mt-0.5"
              style={{
                background: m.role === 'ai' ? 'linear-gradient(135deg, #7c3aed, #3b82f6)' : '#e2e8f0',
                color: m.role === 'ai' ? 'white' : '#64748b',
              }}>
              {m.role === 'ai' ? 'AI' : '👤'}
            </div>
            <div className="max-w-xs rounded-xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap"
              style={{
                background: m.role === 'ai' ? 'rgba(124,58,237,0.06)' : 'rgba(59,130,246,0.06)',
                border: m.role === 'ai' ? '1px solid rgba(124,58,237,0.15)' : '1px solid rgba(59,130,246,0.15)',
                color: '#334155',
              }}>
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-xs font-medium text-white"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #3b82f6)' }}>AI</div>
            <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.15)' }}>
              <span className="flex gap-1">
                {[0, 1, 2].map(j => (
                  <span key={j} className="w-1.5 h-1.5 rounded-full animate-bounce bg-violet-400"
                    style={{ animationDelay: `${j * 0.15}s` }} />
                ))}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="px-5 py-3 border-t" style={{ borderColor: '#e2e8f0' }}>
        <div className="flex gap-2">
          <input className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none"
            style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#0f172a' }}
            placeholder="自然言語でAIに質問..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage(input)}
          />
          <button className="px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-80 text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #3b82f6)' }}
            disabled={loading}
            onClick={() => sendMessage(input)}>
            送信
          </button>
        </div>
      </div>
    </div>
  );
}
