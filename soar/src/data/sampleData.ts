export type Severity = 'Critical' | 'High' | 'Medium' | 'Low';
export type AlertStatus = 'Escalated' | 'Investigating' | 'New' | 'Resolved';

export interface AttackSource {
  ip: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  severity: Severity;
  events: number;
  logTypes: string;
}

export interface Alert {
  id: string;
  title: string;
  severity: Severity;
  status: AlertStatus;
  logSource: string;
  user: string;
  host: string;
  sourceIp: string;
  time: string;
  lastEpoch?: number;   // 最新検知時刻(epoch秒)。アラート一覧「新しい順」並べ替え用
  aiScore: number;
  aiSummary: string;
  confidence: number;
  evidenceLogs: number;
  timeline: { time: string; event: string }[];
  recommendations: string[];
}

export interface LogSource {
  name: string;
  status: 'Healthy' | 'Delayed' | 'Error';
  events: number;
  icon: string;
}

export const ATTACK_SOURCES: AttackSource[] = [
  { ip: '185.220.101.42', city: 'Amsterdam', country: 'Netherlands',     lat: 52.37,  lon:   4.90, severity: 'Critical', events: 118, logTypes: 'VPN, Firewall'       },
  { ip: '203.0.113.91',   city: 'Singapore', country: 'Singapore',       lat:  1.35,  lon: 103.82, severity: 'Medium',   events:  84, logTypes: 'Auth, Access Log'    },
  { ip: '198.51.100.24',  city: 'Los Angeles', country: 'United States', lat: 34.05,  lon:-118.24, severity: 'High',     events:  31, logTypes: 'Firewall, IDS'        },
  { ip: '198.51.100.77',  city: 'Frankfurt',  country: 'Germany',        lat: 50.11,  lon:   8.68, severity: 'High',     events:  27, logTypes: 'Firewall'             },
  { ip: '203.0.113.144',  city: 'Sydney',     country: 'Australia',      lat:-33.87,  lon: 151.21, severity: 'Medium',   events:  14, logTypes: 'IDS'                  },
  { ip: '203.0.113.62',   city: 'São Paulo',  country: 'Brazil',         lat:-23.55,  lon: -46.63, severity: 'Medium',   events:  11, logTypes: 'Firewall'             },
];

export const TOKYO = { lat: 35.68, lon: 139.69, name: '東京 (保護対象)' };

export const ALERTS: Alert[] = [
  {
    id: 'ALT-1029',
    title: '海外IPからの管理者ログイン後に大量ダウンロード',
    severity: 'Critical',
    status: 'Escalated',
    logSource: 'VPN / Access Log / File Audit',
    user: 'admin.tanaka',
    host: 'fileserver-01',
    sourceIp: '185.220.101.42',
    time: '11分前',
    aiScore: 96,
    aiSummary: '通常と異なる国から管理者ログインが成功し、その直後に機密フォルダへの大量アクセスが確認されています。アカウント侵害の可能性が高く、直ちに対応が必要です。',
    confidence: 96,
    evidenceLogs: 347,
    timeline: [
      { time: '10:42', event: 'VPNログイン成功: admin.tanaka / 185.220.101.42 (Amsterdam, NL)' },
      { time: '10:44', event: '管理画面ログイン成功: file-admin-console' },
      { time: '10:47', event: '機密フォルダへのアクセス急増 (通常比 +1,240%)' },
      { time: '10:51', event: '2.4GBのファイルダウンロードを検知' },
      { time: '10:53', event: 'AIがCriticalとして優先度を引き上げ' },
      { time: '10:54', event: '外部専門家へエスカレーション済み' },
    ],
    recommendations: [
      '対象アカウント (admin.tanaka) の一時停止',
      '関連端末のプロセス履歴確認',
      '送信元IP (185.220.101.42) のブロック検討',
      '証跡ログの保全',
      'パスワードリセット',
      'MFA再設定確認',
    ],
  },
  {
    id: 'ALT-1028',
    title: 'PowerShellによる不審な外部通信',
    severity: 'High',
    status: 'Investigating',
    logSource: 'Endpoint / Process Log',
    user: 'sato.yuki',
    host: 'win-client-23',
    sourceIp: '10.10.24.18',
    time: '23分前',
    aiScore: 88,
    aiSummary: 'PowerShellプロセスが通常使用しない外部エンドポイントへHTTPS通信を行っています。マルウェアのC2通信またはLiving-off-the-land攻撃の可能性があります。',
    confidence: 88,
    evidenceLogs: 124,
    timeline: [
      { time: '10:30', event: 'PowerShell.exeが起動 (親プロセス: cmd.exe)' },
      { time: '10:32', event: '未知の外部ホストへHTTPS通信 (port 443)' },
      { time: '10:35', event: 'Base64エンコードされたコマンド実行を検知' },
      { time: '10:40', event: 'EDRがプロセスを疑わしいとしてフラグ' },
    ],
    recommendations: [
      '対象ホスト (win-client-23) のネットワーク遮断',
      'PowerShellスクリプトのログ取得・解析',
      'EDRによるフルスキャン実行',
      '該当ユーザーへの確認',
    ],
  },
  {
    id: 'ALT-1027',
    title: '短時間でのログイン失敗増加',
    severity: 'Medium',
    status: 'New',
    logSource: 'Entra ID / Authentication',
    user: 'multiple users',
    host: 'cloud-auth',
    sourceIp: '203.0.113.91',
    time: '41分前',
    aiScore: 67,
    aiSummary: '同一IPから複数アカウントへのログイン失敗が急増しています。パスワードスプレー攻撃の可能性があります。現時点で成功ログインは確認されていません。',
    confidence: 67,
    evidenceLogs: 89,
    timeline: [
      { time: '10:12', event: 'ログイン失敗が増加開始 (Singapore IP)' },
      { time: '10:18', event: '15アカウントに対して試行を確認' },
      { time: '10:22', event: 'AIがパスワードスプレーパターンを検知' },
      { time: '10:25', event: 'アラートとして記録' },
    ],
    recommendations: [
      '対象IPのレート制限またはブロック',
      '影響アカウントのパスワードポリシー確認',
      'Entra ID条件付きアクセスポリシーの見直し',
      'MFA未設定アカウントの確認',
    ],
  },
  {
    id: 'ALT-1026',
    title: 'FWでC2通信らしき宛先を検知',
    severity: 'High',
    status: 'New',
    logSource: 'Firewall / IDS',
    user: 'unknown',
    host: 'linux-app-04',
    sourceIp: '198.51.100.24',
    time: '1時間前',
    aiScore: 83,
    aiSummary: 'FWおよびIDSが既知の脅威インテリジェンスと一致する宛先への通信を検知しました。C2 (Command & Control) サーバーへの接続の可能性があります。',
    confidence: 83,
    evidenceLogs: 56,
    timeline: [
      { time: '09:58', event: 'FWが不審な外部通信を検知 (定期的なビーコン)' },
      { time: '10:01', event: 'IDSが既知C2シグネチャと一致と報告' },
      { time: '10:05', event: 'AIがC2通信パターンとして分類' },
    ],
    recommendations: [
      '対象サーバー (linux-app-04) の通信遮断',
      'プロセスリストとネットワーク接続の確認',
      '宛先IPのブロックリスト追加',
      'ファイルシステムの整合性チェック',
    ],
  },
];

export const LOG_SOURCES: LogSource[] = [
  { name: 'Firewall',         status: 'Healthy',  events: 128402,  icon: '🔥' },
  { name: 'IDS / IPS',        status: 'Healthy',  events:  22918,  icon: '🛡' },
  { name: 'Access Log',       status: 'Healthy',  events: 301554,  icon: '📋' },
  { name: 'Endpoint',         status: 'Delayed',  events:  89120,  icon: '💻' },
  { name: 'Operation Log',    status: 'Healthy',  events:  14091,  icon: '⚙️' },
  { name: 'Process Log',      status: 'Healthy',  events: 210885,  icon: '🔄' },
];

export const KPI = {
  unresolvedAlerts: 17,
  criticalAlerts: 3,
  aiRiskScore: 82,
  logsLast24h: '766K',
  protectedAssets: 128,
  logSourceUptime: '98.7%',
};

export const MONTHLY_REPORT = {
  totalAlerts: 184,
  criticalAlerts: 9,
  avgResponseTime: '18分',
  falsePositiveRate: '14%',
  logSourceUptime: '98.7%',
  improvements: 12,
};
