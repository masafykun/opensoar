'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { label: 'ダッシュボード', href: '/' },
  { label: 'プロダクト別',   href: '/products' },
  { label: 'アラート',       href: '/alerts' },
  { label: 'ログ管理',       href: '/logs' },
  { label: 'レポート',       href: '/reports' },
  { label: '設定',           href: '/settings' },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 flex items-center justify-between px-6 py-3"
      style={{ background: 'rgba(255,255,255,0.95)', borderBottom: '1px solid #e2e8f0', backdropFilter: 'blur(12px)', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm text-white"
          style={{ background: 'linear-gradient(135deg, #3b82f6, #7c3aed)', boxShadow: '0 0 16px rgba(59,130,246,0.3)' }}>
          S
        </div>
        <div>
          <span className="text-sm font-bold tracking-wide" style={{ color: '#0f172a' }}>SOAR</span>
          <span className="text-xs ml-2" style={{ color: '#94a3b8' }}>AIセキュリティ監視</span>
        </div>
      </div>

      <div className="hidden md:flex items-center gap-1 text-xs">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link key={item.href} href={item.href}
              className="px-3 py-1.5 rounded-lg transition-colors"
              style={{
                color: isActive ? '#3b82f6' : '#64748b',
                background: isActive ? 'rgba(59,130,246,0.08)' : 'transparent',
                fontWeight: isActive ? 600 : 400,
                textDecoration: 'none',
              }}>
              {item.label}
            </Link>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          <span style={{ color: '#22c55e' }}>監視中</span>
        </div>
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium"
          style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', color: '#3b82f6' }}>
          AC
        </div>
      </div>
    </nav>
  );
}
