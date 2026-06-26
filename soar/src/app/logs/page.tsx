'use client';
import { useState, useEffect, useCallback } from 'react';
import Nav from '@/components/Nav';
import LogSourceStatus from '@/components/LogSourceStatus';

interface LogSource { name: string; status: string; events: number; icon: string; }
interface LogEntry {
  time: string; ip: string; method: string; path: string;
  status: string; type: string; site: string; env: string;
}
interface LogsResponse {
  entries: LogEntry[]; total: number; page: number; size: number; pages: number; total_requests: number;
}

const PAGE_SIZE = 50;
const POLL_MS = 15000;
const DANGEROUS = ['機密ファイルアクセス', 'システムファイルアクセス', 'SQLインジェクション', 'XSS', 'ディレクトリトラバーサル', 'コマンドインジェクション'];

function levelOf(type: string): { label: string; color: string; bg: string } {
  if (DANGEROUS.includes(type)) return { label: 'ALERT', color: '#ef4444', bg: 'rgba(239,68,68,0.04)' };
  return { label: 'WARN', color: '#f97316', bg: 'rgba(249,115,22,0.04)' };
}

export default function LogsPage() {
  const [logSources, setLogSources] = useState<LogSource[]>([]);
  const [data, setData] = useState<LogsResponse | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const loadLogs = useCallback(async (p: number) => {
    try {
      const res = await fetch(`/api/logs?page=${p}&size=${PAGE_SIZE}`, { cache: 'no-store' });
      if (res.ok) setData(await res.json());
    } catch { /* keep previous */ }
  }, []);

  // ログソース状態（実データ）
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch('/api/dashboard', { cache: 'no-store' });
        if (res.ok && alive) setLogSources((await res.json()).logSources ?? []);
      } catch { /* keep */ }
    };
    load();
    const id = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // ページ変更時 + 定期更新
  useEffect(() => {
    loadLogs(page);
    const id = setInterval(() => loadLogs(page), POLL_MS);
    return () => clearInterval(id);
  }, [page, loadLogs]);

  // 取得ページ数が縮んだら現在ページをクランプ（ログ更新で空ページに取り残されない）
  useEffect(() => {
    if (data?.pages && page > data.pages) setPage(data.pages);
  }, [data?.pages, page]);

  const entries = data?.entries ?? [];
  const q = search.toLowerCase();
  const filtered = entries.filter(l =>
    !search || [l.ip, l.path, l.type, l.site, l.env].some(v => String(v ?? '').toLowerCase().includes(q))
  );
  const pages = data?.pages ?? 1;

  return (
    <div className="min-h-screen" style={{ background: '#f1f5f9' }}>
      <Nav />
      <div className="px-4 pt-6 pb-12 md:px-8 space-y-5">
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#0f172a' }}>ログ管理</h1>
          <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>
            ログソースの状態と、検知した不審リクエストの全件（ページ送りで閲覧）
          </p>
        </div>

        <LogSourceStatus logSources={logSources} />

        <div className="cyber-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: '#e2e8f0' }}>
            <h2 className="text-sm font-semibold" style={{ color: '#0f172a' }}>
              不審リクエスト ログ
              {data && <span className="ml-2 text-xs font-normal" style={{ color: '#94a3b8' }}>全 {data.total.toLocaleString()} 件</span>}
            </h2>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: '#94a3b8' }}>🔍</span>
              <input type="text" placeholder="このページ内を検索..." value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 pr-4 py-1.5 text-xs rounded-lg outline-none"
                style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#0f172a', width: 220 }} />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                  {['時刻', 'ソース', 'レベル', '送信元IP', '種別', 'メッセージ'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 font-medium" style={{ color: '#64748b' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!data && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center" style={{ color: '#94a3b8' }}>読み込み中…</td></tr>
                )}
                {data && filtered.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center" style={{ color: '#94a3b8' }}>該当ログがありません</td></tr>
                )}
                {filtered.map((log, i) => {
                  const lv = levelOf(log.type);
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: lv.bg }}>
                      <td className="px-4 py-2.5 font-mono whitespace-nowrap" style={{ color: '#475569' }}>{log.time}</td>
                      <td className="px-4 py-2.5 font-mono whitespace-nowrap" style={{ color: '#334155' }}>{log.env}:{log.site}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap"><span className="font-bold" style={{ color: lv.color }}>{lv.label}</span></td>
                      <td className="px-4 py-2.5 font-mono whitespace-nowrap" style={{ color: '#475569' }}>{log.ip}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: '#64748b' }}>{log.type}</td>
                      <td className="px-4 py-2.5 font-mono" style={{ color: '#334155', maxWidth: 460 }}>
                        <span className="truncate block" style={{ maxWidth: 440 }}>{log.method} {log.path} → {log.status}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ページネーション */}
          <div className="px-5 py-3 border-t flex items-center justify-between" style={{ borderColor: '#e2e8f0' }}>
            <span className="text-xs" style={{ color: '#94a3b8' }}>
              {data ? `ページ ${data.page} / ${pages} ・ 全 ${data.total.toLocaleString()} 件（取込 ${data.total_requests.toLocaleString()} リクエスト）` : '—'}
            </span>
            <div className="flex items-center gap-2">
              <button disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="text-xs px-3 py-1 rounded-lg border transition-all disabled:opacity-40"
                style={{ borderColor: '#e2e8f0', color: '#475569', background: '#f8fafc' }}>← 前へ</button>
              <span className="text-xs font-mono" style={{ color: '#64748b' }}>{page} / {pages}</span>
              <button disabled={page >= pages}
                onClick={() => setPage(p => Math.min(pages, p + 1))}
                className="text-xs px-3 py-1 rounded-lg border transition-all disabled:opacity-40"
                style={{ borderColor: '#e2e8f0', color: '#475569', background: '#f8fafc' }}>次へ →</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
