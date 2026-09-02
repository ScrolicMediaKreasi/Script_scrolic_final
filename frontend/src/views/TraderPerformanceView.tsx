import React, { useEffect, useState } from 'react';
import { ArrowLeft, BrainCircuit, CalendarDays, Activity, TrendingDown, TrendingUp } from 'lucide-react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { User } from '../types';
import { safeAvatarUrl, handleAvatarError } from '../utils/avatar';

export interface TraderPerformanceData {
  profile: { username: string; displayName: string; avatar: string; bio: string };
  period: string;
  summary: {
    cumulativeProfit: number;
    realizedPnL: number;
    unrealizedPnL: number;
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    profitFactor: number | string | null;
    averageProfitLoss: number;
    averageWin: number;
    averageLoss: number;
    largestWin: number;
    largestLoss: number;
  };
  risk: { maxDrawdown: number; available: boolean };
  tradingPeriod: { from: string | null; to: string | null; days: number };
  cumulativeProfitSeries: Array<{ date: string; value: number; profit: number }>;
  recentActivity: Array<{ symbol: string; direction: string; status: string; profit: number; pips: number; lot: number; date: string | null }>;
  dataAvailability: { closedTrades: number; openPositions: number; hasRealData: boolean };
}

interface TraderPerformanceViewProps {
  user: User;
  currentUser: User | null;
  onBack: () => void;
  onAskAI: (performance: TraderPerformanceData) => void;
}

const money = (value: number) => `${value >= 0 ? '+' : '-'}$${Math.abs(value).toFixed(2)}`;

export const TraderPerformanceView: React.FC<TraderPerformanceViewProps> = ({ user, currentUser, onBack, onAskAI }) => {
  const [period, setPeriod] = useState('all');
  const [data, setData] = useState<TraderPerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/users/${encodeURIComponent(user.username)}/performance?period=${period}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.detail || 'Gagal memuat performance trader');
        return body.performance as TraderPerformanceData;
      })
      .then((performance) => { if (active) setData(performance); })
      .catch((reason: Error) => { if (active) setError(reason.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user.username, period]);

  if (loading) return <div className="w-full max-w-md mx-auto p-6 text-center text-sm text-neutral-400">Memuat performance trader...</div>;
  if (error || !data) return <div className="w-full max-w-md mx-auto p-4"><button onClick={onBack} className="text-sm text-amber-300 flex items-center gap-2 mb-6"><ArrowLeft className="w-4 h-4" /> Kembali</button><div className="p-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-sm">{error || 'Data performance tidak tersedia.'}</div></div>;

  const summary = data?.summary || {
    cumulativeProfit: 0,
    realizedPnL: 0,
    unrealizedPnL: 0,
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    winRate: 0,
    profitFactor: '-',
    averageProfitLoss: 0,
    averageWin: 0,
    averageLoss: 0,
    largestWin: 0,
    largestLoss: 0
  };
  const metricItems = [
    ['Realized P&L', money(summary.realizedPnL || 0)], ['Unrealized P&L', money(summary.unrealizedPnL || 0)],
    ['Total Trades', String(summary.totalTrades || 0)], ['Win Rate', `${(summary.winRate || 0).toFixed(1)}%`],
    ['Profit Factor', String(summary.profitFactor ?? '-')], ['Avg Profit/Loss', money(summary.averageProfitLoss || 0)],
    ['Largest Win', money(summary.largestWin || 0)], ['Largest Loss', money(summary.largestLoss || 0)]
  ];

  const cumulativeProfitSeries = data.cumulativeProfitSeries || [];
  const recentActivity = data.recentActivity || [];
  const tradingPeriod = data.tradingPeriod || { days: 0 };
  const risk = data.risk || { maxDrawdown: 0, available: false };
  const profile = data.profile || { username: user.username, displayName: user.displayName, avatar: user.avatar, bio: user.bio };

  return (
    <div className="w-full max-w-md mx-auto pb-24 px-3 sm:px-0 space-y-3">
      <div className="flex items-center justify-between py-2"><button onClick={onBack} className="text-sm text-neutral-300 flex items-center gap-2"><ArrowLeft className="w-4 h-4" /> Profil</button><select value={period} onChange={(event) => setPeriod(event.target.value)} className="bg-[#111b14] border border-emerald-500/25 rounded-lg px-2 py-1 text-xs text-neutral-200"><option value="all">Semua waktu</option><option value="90d">90 hari</option><option value="30d">30 hari</option><option value="7d">7 hari</option></select></div>
      <section className="bg-[#07130c] border border-emerald-500/30 rounded-2xl p-4"><div className="flex items-center gap-3"><img src={safeAvatarUrl(profile.avatar, profile.username)} alt={profile.username} onError={(event) => handleAvatarError(event, profile.username, profile.avatar)} className="w-11 h-11 rounded-full object-cover" /><div><h1 className="text-base font-black text-white">Performance Trader Detail</h1><p className="text-xs text-neutral-400">@{profile.username}</p></div></div><div className="mt-4"><span className="text-[11px] text-neutral-400">Cumulative Profit</span><strong className={`block text-3xl font-black font-mono ${(summary.cumulativeProfit || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{money(summary.cumulativeProfit || 0)}</strong></div><button onClick={() => onAskAI(data)} disabled={!currentUser} className="mt-4 w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-xs font-bold flex items-center justify-center gap-2"><BrainCircuit className="w-4 h-4" /> Tanya AI</button></section>
      <section className="grid grid-cols-2 gap-2">{metricItems.map(([label, value]) => <div key={label} className="bg-[#0b1710] border border-emerald-500/15 rounded-xl p-3"><span className="text-[10px] text-neutral-500 block">{label}</span><span className="text-sm font-bold font-mono text-neutral-100">{value}</span></div>)}</section>
      <section className="bg-[#07130c] border border-emerald-500/20 rounded-2xl p-3"><div className="flex justify-between items-center mb-2"><h2 className="text-sm font-bold text-white">Cumulative Profit</h2><span className="text-[10px] text-neutral-500">Closed trades</span></div>{cumulativeProfitSeries.length ? <div className="h-48 min-w-0"><ResponsiveContainer width="100%" height={192} minWidth={0} minHeight={192}><LineChart data={cumulativeProfitSeries}><XAxis dataKey="date" hide /><YAxis width={45} tick={{ fill: '#9ca3af', fontSize: 10 }} /><Tooltip formatter={(value) => [`$${Number(value).toFixed(2)}`, 'Profit']} /><Line type="monotone" dataKey="value" stroke="#34d399" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div> : <p className="py-12 text-center text-xs text-neutral-500">Belum ada closed trade.</p>}</section>
      <section className="bg-[#07130c] border border-emerald-500/20 rounded-2xl p-3"><h2 className="text-sm font-bold text-white mb-3">Trading Period & Risk Analysis</h2><p className="text-xs text-neutral-400 flex items-center gap-2"><CalendarDays className="w-3.5 h-3.5" /> {tradingPeriod.days || 0} hari data tersedia</p><p className="text-xs text-neutral-400 mt-2 flex items-center gap-2"><TrendingDown className="w-3.5 h-3.5" /> Max drawdown: <b className="text-rose-300">{money(-(risk.maxDrawdown || 0))}</b></p></section>
      <section className="bg-[#07130c] border border-emerald-500/20 rounded-2xl p-3"><h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2"><Activity className="w-4 h-4 text-emerald-400" /> Recent Trading Activity</h2>{recentActivity.length ? recentActivity.map((trade, index) => <div key={`${trade.date}-${index}`} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0"><div><span className="text-xs font-bold text-white">{trade.symbol} {trade.direction}</span><span className="block text-[10px] text-neutral-500">{trade.status} · {trade.lot} Lot</span></div><span className={`text-xs font-mono font-bold ${trade.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{money(trade.profit)}</span></div>) : <p className="text-xs text-neutral-500">Belum ada aktivitas trading.</p>}</section>
      <p className="text-[10px] text-neutral-500 leading-relaxed">Performance Trader Detail dan analisis AI hanya berdasarkan data historis yang tersedia untuk tujuan informasi dan edukasi. Scrolic bukan broker, bukan penasihat investasi, dan tidak menjamin hasil trading.</p>
    </div>
  );
};
