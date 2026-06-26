'use client';
import { useState, useEffect } from 'react';
import Nav from '@/components/Nav';

interface TypeCount { type: string; count: number; }
interface Attacker { ip: string; count: number; }
interface Product {
  env: string; site: string; label: string;
  attacks: number; uniqueIps: number; severity: string;
  types: TypeCount[]; topAttackers: Attacker[]; lastSeen: string;
}
interface ProductsResponse {
  products: Product[]; totalProducts: number; totalAttacks: number; updated: string;
}

const POLL_MS = 15000;

function sevColor(s: string) {
  return s === 'Critical' ? '#ef4444' : s === 'High' ? '#f97316' : s === 'Medium' ? '#eab308' : '#22c55e';
}
function typeColor(t: string) {
  if (t.includes('SQL') || t.includes('システム') || t.includes('コマンド')) return '#ef4444';
  if (t.includes('機密') || t.includes('XSS') || t.includes('トラバーサル')) return '#f97316';
  if (t.includes('SSH')) return '#7c3aed';
  return '#3b82f6';
}

function ProductCard({ p }: { p: Product }) {
  const col = sevColor(p.severity);
  const maxType = Math.max(1, ...p.types.map(t => t.count));
  return (
    <div className="cyber-card p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-base font-bold" style={{ color: '#0f172a' }}>{p.site}</p>
          <p className="text-xs font-mono mt-0.5" style={{ color: '#94a3b8' }}>{p.env}</p>
        </div>
        <span className="text-xs px-2 py-0.5 rounded font-medium"
          style={{ color: col, background: `${col}12`, border: `1px solid ${col}30` }}>{p.severity}</span>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="rounded-lg p-2 text-center" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <p className="text-lg font-bold font-mono" style={{ color: '#ef4444' }}>{p.attacks.toLocaleString()}</p>
          <p className="text-[10px]" style={{ color: '#94a3b8' }}>攻撃数</p>
        </div>
        <div className="rounded-lg p-2 text-center" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <p className="text-lg font-bold font-mono" style={{ color: '#3b82f6' }}>{p.uniqueIps}</p>
          <p className="text-[10px]" style={{ color: '#94a3b8' }}>攻撃元IP</p>
        </div>
        <div className="rounded-lg p-2 text-center" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <p className="text-sm font-bold" style={{ color: '#64748b' }}>{p.lastSeen}</p>
          <p className="text-[10px]" style={{ color: '#94a3b8' }}>最終検知</p>
        </div>
      </div>

      <p className="text-xs font-medium mb-2" style={{ color: '#64748b' }}>攻撃の種類</p>
      <div className="space-y-1.5 mb-4">
        {p.types.map(t => (
          <div key={t.type}>
            <div className="flex items-center justify-between text-xs mb-0.5">
              <span style={{ color: '#334155' }}>{t.type}</span>
              <span className="font-mono" style={{ color: '#94a3b8' }}>{t.count}</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#e2e8f0' }}>
              <div className="h-full rounded-full" style={{ width: `${(t.count / maxType) * 100}%`, background: typeColor(t.type) }} />
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs font-medium mb-1.5" style={{ color: '#64748b' }}>主な攻撃元</p>
      <div className="space-y-0.5">
        {p.topAttackers.map(a => (
          <div key={a.ip} className="flex items-center justify-between text-xs">
            <span className="font-mono" style={{ color: '#475569' }}>{a.ip}</span>
            <span className="font-mono" style={{ color: '#94a3b8' }}>{a.count}件</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ProductsPage() {
  const [data, setData] = useState<ProductsResponse | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch('/api/products', { cache: 'no-store' });
        if (res.ok && alive) setData(await res.json());
      } catch { /* keep */ }
    };
    load();
    const id = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const products = data?.products ?? [];

  return (
    <div className="min-h-screen" style={{ background: '#f1f5f9' }}>
      <Nav />
      <div className="px-4 pt-6 pb-12 md:px-8 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold" style={{ color: '#0f172a' }}>プロダクト別 攻撃状況</h1>
            <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>
              各サービス（サイト）にどんな攻撃が来ているかを実ログから集計
            </p>
          </div>
          {data && (
            <div className="hidden sm:flex items-center gap-4 text-xs" style={{ color: '#64748b' }}>
              <span>対象 <span className="font-mono font-bold" style={{ color: '#3b82f6' }}>{data.totalProducts}</span> プロダクト</span>
              <span>総攻撃 <span className="font-mono font-bold" style={{ color: '#ef4444' }}>{data.totalAttacks.toLocaleString()}</span> 件</span>
            </div>
          )}
        </div>

        {!data && <p className="text-sm py-12 text-center" style={{ color: '#94a3b8' }}>読み込み中…</p>}
        {data && products.length === 0 && (
          <p className="text-sm py-12 text-center" style={{ color: '#94a3b8' }}>現在、検知された攻撃はありません</p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {products.map(p => <ProductCard key={p.label} p={p} />)}
        </div>
      </div>
    </div>
  );
}
