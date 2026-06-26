'use client';
import dynamic from 'next/dynamic';

const ThreatMapLeaflet = dynamic(() => import('./ThreatMapLeaflet'), {
  ssr: false,
  loading: () => (
    <div className="cyber-card overflow-hidden flex items-center justify-center" style={{ height: 600 }}>
      <span style={{ color: '#94a3b8', fontSize: 14 }}>マップを読み込み中...</span>
    </div>
  ),
});

interface Props { selectedIp?: string; onSelectIp?: (ip: string) => void; }

export default function ThreatMap(props: Props) {
  return <ThreatMapLeaflet {...props} />;
}
