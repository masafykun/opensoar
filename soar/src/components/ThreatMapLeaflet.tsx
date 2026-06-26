'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { type AttackSource, type Severity } from '@/data/sampleData';

// 着弾点（保護対象の所在地）。バックエンド /api/threats の defender を使い、無ければこの既定値。
interface Defender { lat: number; lon: number; label: string }
const DEFAULT_DEFENDER: Defender = { lat: 35.68, lon: 139.69, label: '保護拠点' };

// ─── Helpers ─────────────────────────────────────────────────────────────────
function severityColor(s: Severity): string {
  if (s === 'Critical') return '#ef4444';
  if (s === 'High')     return '#f97316';
  if (s === 'Medium')   return '#eab308';
  return '#22c55e';
}

function quadBezierPath(x1: number, y1: number, x2: number, y2: number): string {
  const cx = (x1 + x2) / 2;
  const cy = Math.min(y1, y2) - Math.abs(x2 - x1) * 0.25;
  return `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`;
}

function quadBezierPoint(t: number, x1: number, y1: number, x2: number, y2: number): [number, number] {
  const cx = (x1 + x2) / 2;
  const cy = Math.min(y1, y2) - Math.abs(x2 - x1) * 0.25;
  return [
    (1 - t) ** 2 * x1 + 2 * (1 - t) * t * cx + t ** 2 * x2,
    (1 - t) ** 2 * y1 + 2 * (1 - t) * t * cy + t ** 2 * y2,
  ];
}

// ─── 日本中心マップ用の経度補正 ──────────────────────────────────────────────
// 中心を東経155°に置き、それより西180°未満（= 経度 < -25°）の地点は
// 360°加算して地図の右側（太平洋越え）に表示する
const MAP_CENTER: [number, number] = [30, 155];

function adjustLon(lon: number): number {
  return lon < MAP_CENTER[1] - 180 ? lon + 360 : lon;
}

// events → 粒の数（1〜5）。突出した1IPに引っ張られないよう対数スケール
function dotCount(events: number, maxEvents: number): number {
  const ratio = Math.log10(events + 1) / Math.log10(Math.max(10, maxEvents) + 1);
  if (ratio > 0.8) return 5;
  if (ratio > 0.6) return 4;
  if (ratio > 0.4) return 3;
  if (ratio > 0.2) return 2;
  return 1;
}

// events → 線の太さスケール（0.35〜1.0）。対数スケールで偏りを抑制
function lineScale(events: number, maxEvents: number): number {
  const ratio = Math.log10(events + 1) / Math.log10(Math.max(10, maxEvents) + 1);
  return 0.35 + ratio * 0.65;
}

// ─── SVG overlay ─────────────────────────────────────────────────────────────
function AttackSVGOverlay({ activeIp, tick, sources, defender }: {
  activeIp: string;
  tick: number;
  sources: AttackSource[];
  defender: Defender;
}) {
  const map = useMap();
  const [mounted, setMounted] = useState(false);
  const [, setMapVer] = useState(0);

  useEffect(() => {
    setMounted(true);
    const refresh = () => setMapVer(v => v + 1);
    map.on('move zoom resize moveend zoomend', refresh);
    return () => { map.off('move zoom resize moveend zoomend', refresh); };
  }, [map]);

  if (!mounted) return null;

  const container = map.getContainer();
  const { clientWidth: W, clientHeight: H } = container;
  const tokyoPx = map.latLngToContainerPoint([defender.lat, adjustLon(defender.lon)]);
  const maxEvents = sources.length ? Math.max(...sources.map(s => s.events)) : 1;
  const rendered = sources.map(s => ({
    ...s,
    col:   severityColor(s.severity),
    px:    map.latLngToContainerPoint([s.lat, adjustLon(s.lon)]),
    scale: lineScale(s.events, maxEvents),
    dots:  dotCount(s.events, maxEvents),
  }));

  const dotT = (tick * 0.012) % 1;

  return createPortal(
    <svg style={{ position: 'absolute', top: 0, left: 0, width: W, height: H, pointerEvents: 'none', zIndex: 450 }}>
      {rendered.map(src => {
        const isActive = src.ip === activeIp;
        const [sx, sy] = [src.px.x, src.px.y];
        const [tx, ty] = [tokyoPx.x, tokyoPx.y];
        const d = quadBezierPath(sx, sy, tx, ty);

        // 線の太さ：件数スケール × アクティブ倍率
        const glowW = (isActive ? 8 : 4) * src.scale;
        const dashW = (isActive ? 2.5 : 1.6) * src.scale;

        // 粒：件数分を均等位相で配置
        const dotPositions = Array.from({ length: src.dots }, (_, i) => {
          const t = (dotT + i / src.dots) % 1;
          return quadBezierPoint(t, sx, sy, tx, ty);
        });

        return (
          <g key={src.ip}>
            {/* glow base */}
            <path d={d} fill="none" stroke={src.col}
              strokeWidth={glowW} strokeOpacity={isActive ? 0.32 : 0.2} />
            {/* animated dash */}
            <path d={d} fill="none" stroke={src.col}
              strokeWidth={dashW} strokeOpacity={isActive ? 1 : 0.65}
              strokeDasharray="8 5"
              style={{
                strokeDashoffset: -(tick * 0.8) % 26,
                filter: isActive
                  ? `drop-shadow(0 0 4px ${src.col})`
                  : `drop-shadow(0 0 2px ${src.col})`,
              }}
            />
            {/* moving dots */}
            {dotPositions.map(([dx, dy], i) => (
              <circle key={i} cx={dx} cy={dy}
                r={isActive ? 3.5 : 2.2}
                fill={src.col}
                opacity={isActive ? 1 : 0.7}
                style={{ filter: isActive
                  ? `drop-shadow(0 0 6px ${src.col})`
                  : `drop-shadow(0 0 3px ${src.col})` }}
              />
            ))}
          </g>
        );
      })}

      {/* Tokyo */}
      <circle cx={tokyoPx.x} cy={tokyoPx.y} r={22} fill="rgba(59,130,246,0.12)" />
      <circle cx={tokyoPx.x} cy={tokyoPx.y} r={10} fill="rgba(59,130,246,0.22)" stroke="#3b82f6" strokeWidth="1.5" />
      <circle cx={tokyoPx.x} cy={tokyoPx.y} r={4.5} fill="#3b82f6"
        style={{ filter: 'drop-shadow(0 0 8px rgba(59,130,246,0.9))' }} />
      <text x={tokyoPx.x + 14} y={tokyoPx.y - 8} fill="#1e40af"
        fontSize="11" fontFamily="Inter, sans-serif" fontWeight="600">{defender.label}</text>
      <text x={tokyoPx.x + 14} y={tokyoPx.y + 5} fill="#3b82f6"
        fontSize="9" fontFamily="Inter, sans-serif">保護対象</text>
    </svg>,
    container
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
interface Props { selectedIp?: string; onSelectIp?: (ip: string) => void; }

interface ThreatRange { oldest: string | null; newest: string | null }
type WindowKey = '1h' | '24h' | '7d' | '30d' | 'all';
interface ThreatResponse {
  sources: AttackSource[];
  defender?: Defender;
  total_events: number;
  updated: string;
  window: string;
  windowLabel?: string;
  range?: ThreatRange;
}

const WINDOWS: { key: WindowKey; label: string }[] = [
  { key: '1h', label: '1時間' },
  { key: '24h', label: '24時間' },
  { key: '7d', label: '7日' },
  { key: '30d', label: '30日' },
  { key: 'all', label: '全期間' },
];

function fmtRange(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

const POLL_MS = 10000;  // 10秒ごとに本番データを再取得

export default function ThreatMapLeaflet({ selectedIp, onSelectIp }: Props) {
  const [tick, setTick]       = useState(0);
  const [hovered, setHovered] = useState<string | null>(null);
  const [sources, setSources] = useState<AttackSource[]>([]);
  const [defender, setDefender] = useState<Defender>(DEFAULT_DEFENDER);
  const [updated, setUpdated] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [stale, setStale]     = useState(false);
  const [win, setWin]         = useState<WindowKey>('24h');     // 既定=直近24時間
  const [range, setRange]     = useState<ThreatRange>({ oldest: null, newest: null });
  const [windowLabel, setWindowLabel] = useState('直近24時間');

  // アニメーション用の tick
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 50);
    return () => clearInterval(id);
  }, []);

  // 本番の実攻撃データをポーリング取得（期間 win 連動）
  useEffect(() => {
    let alive = true;
    setLoading(true);
    const load = async () => {
      try {
        const res = await fetch(`/api/threats?window=${win}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const data: ThreatResponse = await res.json();
        if (!alive) return;
        setSources(data.sources ?? []);
        if (data.defender) setDefender(data.defender);
        setUpdated(data.updated ?? '');
        setRange(data.range ?? { oldest: null, newest: null });
        if (data.windowLabel) setWindowLabel(data.windowLabel);
        setStale(false);
      } catch {
        if (alive) setStale(true);  // 失敗時は前回値を保持して stale 表示
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    const id = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, [win]);

  const activeIp = (selectedIp && sources.some(s => s.ip === selectedIp))
    ? selectedIp
    : (hovered ?? sources[0]?.ip ?? '');
  const totalEvents = sources.reduce((s, r) => s + r.events, 0);
  const updatedLabel = updated
    ? new Date(updated).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';

  return (
    <div className="cyber-card overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-3 border-b" style={{ borderColor: '#e2e8f0' }}>
        <div className="flex items-center gap-3 flex-wrap">
          <span className={`w-2 h-2 rounded-full shrink-0 ${stale ? 'bg-slate-400' : 'bg-red-500 animate-pulse'}`} />
          <span className="text-sm font-semibold tracking-widest uppercase" style={{ color: '#0f172a' }}>
            Threat Intelligence Map
          </span>

          {/* LIVE バッジ */}
          <span className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{
              background: stale ? 'rgba(100,116,139,0.08)' : 'rgba(239,68,68,0.08)',
              color:      stale ? '#64748b' : '#ef4444',
              border:     stale ? '1px solid rgba(100,116,139,0.2)' : '1px solid rgba(239,68,68,0.2)',
            }}>
            {stale ? 'OFFLINE' : 'LIVE'}
          </span>

          {/* Stats badge */}
          <span className="text-xs px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(59,130,246,0.08)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.2)' }}>
            {sources.length} 拠点 · {totalEvents.toLocaleString()} イベント
          </span>

          {/* 最終更新 */}
          <span className="text-xs" style={{ color: '#94a3b8' }}>
            最終更新 <span className="font-mono" style={{ color: '#64748b' }}>{updatedLabel}</span>
          </span>

          {/* 期間セレクタ（既定=直近24時間） */}
          <div className="flex items-center gap-1">
            {WINDOWS.map(w => {
              const active = win === w.key;
              return (
                <button key={w.key} onClick={() => setWin(w.key)}
                  className="text-xs px-2 py-0.5 rounded-full font-medium transition-all"
                  style={active
                    ? { background: 'rgba(59,130,246,0.12)', color: '#2563eb', border: '1px solid rgba(59,130,246,0.35)' }
                    : { background: 'transparent', color: '#94a3b8', border: '1px solid #e2e8f0' }}>
                  {w.label}
                </button>
              );
            })}
          </div>

          {/* 対象期間（実データの最古〜最新） */}
          <span className="text-xs" style={{ color: '#94a3b8' }}>
            {windowLabel}
            {range.newest && (
              <> ・ <span className="font-mono" style={{ color: '#64748b' }}>{fmtRange(range.oldest)} 〜 {fmtRange(range.newest)}</span></>
            )}
          </span>
        </div>

        {/* Right: legend */}
        <div className="hidden sm:flex gap-4 text-xs shrink-0" style={{ color: '#64748b' }}>
          {(['Critical', 'High', 'Medium'] as Severity[]).map(s => (
            <span key={s} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: severityColor(s) }} />
              {s}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full inline-block"
              style={{ background: '#3b82f6', boxShadow: '0 0 6px rgba(59,130,246,0.5)' }} />
            保護拠点
          </span>
        </div>
      </div>

      {/* ── Leaflet map ─────────────────────────────────────────────── */}
      <MapContainer
        center={MAP_CENTER}
        zoom={2}
        minZoom={1}
        maxZoom={8}
        scrollWheelZoom={false}
        zoomControl={true}
        style={{ height: 420, width: '100%' }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />

        {sources.map(src => {
          const col      = severityColor(src.severity);
          const isActive = src.ip === activeIp;
          return (
            <CircleMarker
              key={src.ip}
              center={[src.lat, adjustLon(src.lon)]}
              radius={isActive ? 12 : 9}
              pathOptions={{
                color:       col,
                fillColor:   col,
                fillOpacity: isActive ? 1 : 0.75,
                weight:      isActive ? 3 : 2,
              }}
              eventHandlers={{
                click:     () => onSelectIp?.(src.ip),
                mouseover: () => setHovered(src.ip),
                mouseout:  () => setHovered(null),
              }}
            >
              <Tooltip>
                <div style={{ fontSize: 12, lineHeight: 1.5 }}>
                  <strong style={{ color: col }}>{src.ip}</strong><br />
                  {src.city}, {src.country}<br />
                  {src.severity} · {src.events.toLocaleString()} events
                </div>
              </Tooltip>
            </CircleMarker>
          );
        })}

        <AttackSVGOverlay activeIp={activeIp} tick={tick} sources={sources} defender={defender} />
      </MapContainer>

      {/* ── Attack source table ─────────────────────────────────────── */}
      <div className="px-6 pb-5 pt-3">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs uppercase tracking-wider font-medium" style={{ color: '#94a3b8' }}>攻撃元一覧（本番ログ）</p>
          <p className="text-xs" style={{ color: '#94a3b8' }}>
            nginx不正アクセス + SSH失敗 + fail2ban
          </p>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <p className="text-xs py-6 text-center" style={{ color: '#94a3b8' }}>攻撃データを取得中…</p>
          ) : sources.length === 0 ? (
            <p className="text-xs py-6 text-center" style={{ color: '#94a3b8' }}>現在、地理的に特定できる攻撃元はありません</p>
          ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b" style={{ borderColor: '#e2e8f0' }}>
                {['IP アドレス', '都市', '重大度', 'イベント数', 'ログ種別'].map(h => (
                  <th key={h} className="text-left pb-2 pr-4 font-medium" style={{ color: '#94a3b8' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sources.map(src => {
                const col      = severityColor(src.severity);
                const isActive = src.ip === activeIp;
                return (
                  <tr key={src.ip} className="border-b transition-colors cursor-pointer"
                    style={{ borderColor: '#f1f5f9', background: isActive ? `${col}08` : 'transparent' }}
                    onClick={() => onSelectIp?.(src.ip)}
                    onMouseEnter={() => setHovered(src.ip)}
                    onMouseLeave={() => setHovered(null)}>
                    <td className="py-2 pr-4">
                      <span className="font-mono font-semibold" style={{ color: col }}>{src.ip}</span>
                    </td>
                    <td className="py-2 pr-4" style={{ color: '#334155' }}>{src.city}, {src.country}</td>
                    <td className="py-2 pr-4">
                      <span className="px-2 py-0.5 rounded font-medium"
                        style={{ color: col, background: `${col}12`, border: `1px solid ${col}30` }}>
                        {src.severity}
                      </span>
                    </td>
                    <td className="py-2 pr-4 font-mono" style={{ color: '#475569' }}>{src.events.toLocaleString()}</td>
                    <td className="py-2" style={{ color: '#64748b' }}>{src.logTypes}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          )}
        </div>
      </div>
    </div>
  );
}
