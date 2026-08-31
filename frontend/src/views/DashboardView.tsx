import React, { useState } from 'react';
import { 
  BarChart3, 
  Activity, 
  CheckCircle2, 
  TrendingUp, 
  TrendingDown, 
  Zap, 
  Users, 
  ShieldCheck, 
  Clock, 
  ArrowUpRight, 
  Plus,
  RefreshCw,
  XCircle,
  ExternalLink,
  Layers,
  Radio,
  Sparkles,
  Server,
  ChevronRight,
  ArrowRight,
  Shield
} from 'lucide-react';
import { User, Trade, FeedPost } from '../types';
import { PositionProgressBar } from '../components/PositionProgressBar';
import { getStrategy } from '../data/strategies';
import { LoginRequiredGate } from '../components/LoginRequiredGate';
import { FP_MARKETS_REGISTER_URL, CTRADER_GRANT_ACCESS_URL } from '../components/CTraderGatewayModal';
import { triggerHaptic } from '../utils/haptics';

import { socketClient, AccountMetricsPayload, ConnectionStatusPayload } from '../services/socketClient';
import { livePositionStore } from '../services/livePositionStore';

interface DashboardViewProps {
  currentUser: User | null;
  liveTrades: Trade[];
  closedTrades: Trade[];
  posts: FeedPost[];
  onOpenEnergy: () => void;
  onOpenReferral: () => void;
  onCloseTrade: (tradeId: string) => void;
  onOpenLogin?: () => void;
  onOpenCTraderGateway?: () => void;
  onUpdateUser?: (updatedUser: User) => void;
  onRefreshFeed?: () => void;
}

interface DashboardLiveTradeItemProps {
  trade: Trade;
  onCloseTrade: (tradeId: string) => void;
}

const DashboardLiveTradeItem: React.FC<DashboardLiveTradeItemProps> = ({ trade, onCloseTrade }) => {
  const [localTrade, setLocalTrade] = React.useState<Trade>(trade);
  const [isClosing, setIsClosing] = React.useState(false);

  React.useEffect(() => {
    setLocalTrade(trade);
  }, [trade]);

  React.useEffect(() => {
    const unsub = livePositionStore.subscribe(trade.id, (update) => {
      setLocalTrade((prev) => ({
        ...prev,
        currentPrice: update.currentPrice ?? prev.currentPrice,
        pips: update.pips ?? prev.pips,
        volumeLot: update.volumeLot ?? prev.volumeLot,
        profitUSD: update.profitUsd ?? update.profit ?? prev.profitUSD,
        profitPercent: update.profitPercent ?? prev.profitPercent,
        progress: update.progress ?? prev.progress,
        status: update.status ?? prev.status
      }));
    });
    return () => unsub();
  }, [trade.id]);

  const strat = getStrategy(localTrade.strategyId);
  const isBuy = localTrade.direction === 'BUY';
  const isProfit = (localTrade.profitUSD ?? 0) >= 0;

  return (
    <div className="bg-[#111111] rounded-2xl p-4 border border-[#1f1f1f] space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-bold text-white text-base font-display">{localTrade.symbol}</span>
          <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
            isBuy ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
          }`}>
            {localTrade.direction} {localTrade.volumeLot} Lot
          </span>
        </div>
        <div className="text-right">
          <span className={`text-sm font-bold font-mono ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
            {isProfit ? '+' : ''}{(localTrade.pips ?? 0).toFixed(1)} Pips
          </span>
          <span className="text-[11px] text-neutral-400 block font-mono">
            {isProfit ? '+$' : '-$'}{Math.abs(localTrade.profitUSD ?? 0).toFixed(2)}
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <PositionProgressBar trade={localTrade} isLocked={false} strategyGradient={strat.positionBarGradient} />

      {/* Action Bar */}
      <div className="flex items-center justify-between pt-1 text-xs">
        <span className="text-[10px] text-neutral-500 font-mono">
          Opened: {new Date(localTrade.openTime).toLocaleTimeString('id-ID')}
        </span>
        <button
          onClick={async () => {
            setIsClosing(true);
            try {
              await onCloseTrade(localTrade.id);
            } finally {
              setIsClosing(false);
            }
          }}
          disabled={isClosing}
          className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
        >
          {isClosing ? 'Menutup...' : 'Tutup Posisi (Close)'}
        </button>
      </div>
    </div>
  );
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  currentUser,
  liveTrades,
  closedTrades,
  posts,
  onOpenEnergy,
  onOpenReferral,
  onCloseTrade,
  onOpenLogin,
  onOpenCTraderGateway,
  onUpdateUser,
  onRefreshFeed
}) => {
  const [activeTab, setActiveTab] = useState<'summary' | 'live' | 'portfolio'>('summary');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSuccessMsg, setSyncSuccessMsg] = useState<string | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);
  const [accountMetrics, setAccountMetrics] = useState<AccountMetricsPayload | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatusPayload | null>(null);
  const [portfolioPage, setPortfolioPage] = useState(1);
  const PORTFOLIO_PAGE_SIZE = 20;

  // Reset portfolio pagination when active account changes
  React.useEffect(() => {
    setPortfolioPage(1);
  }, [currentUser?.cTraderAccountId, currentUser?.id]);

  // Live account metrics and connection state
  React.useEffect(() => {
    if (!currentUser?.cTraderConnected) return;

    // Fetch initial metrics snapshot
    const fetchMetrics = async () => {
      try {
        const savedUserId = localStorage.getItem('scrolic_user_id') || currentUser.id;
        const res = await fetch('/api/ctrader/account/metrics', {
          headers: { 'x-session-user-id': savedUserId }
        });
        const data = await res.json();
        if (data.metrics) {
          setAccountMetrics(data.metrics);
        }
      } catch (err) {
        console.warn('[Dashboard] Error fetching account metrics:', err);
      }
    };

    const fetchConnStatus = async () => {
      try {
        const res = await fetch('/api/ctrader/connection/status');
        const data = await res.json();
        if (data.connection) {
          setConnectionStatus(data.connection);
        }
      } catch (err) {
        console.warn('[Dashboard] Error fetching connection status:', err);
      }
    };

    fetchMetrics();
    fetchConnStatus();

    const unsubMetrics = socketClient.onAccountMetrics((metrics) => {
      const activeAccountId = currentUser.cTraderAccountId || '';
      const metricAccountId = metrics.accountId || metrics.ctidTraderAccountId;
      if (String(metricAccountId) === String(activeAccountId) || String(metricAccountId) === activeAccountId.replace(/^cTrader-/, '')) {
        setAccountMetrics(metrics);
      }
    });

    const unsubConn = socketClient.onConnectionStatus((status) => {
      setConnectionStatus(status);
    });

    return () => {
      unsubMetrics();
      unsubConn();
    };
  }, [currentUser?.id, currentUser?.cTraderAccountId, currentUser?.cTraderConnected]);

  if (!currentUser) {
    return (
      <LoginRequiredGate
        featureName="Portofolio & cTrader Live"
        title="Dashboard Khusus Trader Terdaftar"
        description="Masuk dengan email dan password untuk melihat statistik trading real-time, Open Position aktif, dan riwayat sinkronisasi cTrader."
        onOpenLogin={onOpenLogin || (() => {})}
      />
    );
  }

  const currentAccounts = (currentUser.cTraderAccounts && currentUser.cTraderAccounts.length > 0)
    ? currentUser.cTraderAccounts
    : (currentUser.cTraderAccountId ? [{ accountId: currentUser.cTraderAccountId, brokerName: currentUser.cTraderBroker || 'cTrader', accountType: 'LIVE', currency: 'USD', balance: currentUser.totalProfitUSD || 10000, isLive: true }] : []);

  const activeAccount = currentAccounts.find((a) => a.accountId === currentUser.cTraderAccountId) || currentAccounts[0];

  // Strictly filter posts that belong ONLY to the current logged-in user or their connected cTrader account
  const activeAccountPosts = posts.filter((post) => {
    const postUserId = post.userId || (post as any).user_id || post.user?.id || post.user?.username || post.trade?.userId;
    const postAccountId = (post as any).accountId || (post as any).account_id || (post.trade as any)?.accountId;
    const cleanActive = activeAccount?.accountId ? String(activeAccount.accountId).replace(/^cTrader-/, '').trim() : '';
    const cleanPost = postAccountId ? String(postAccountId).replace(/^cTrader-/, '').trim() : '';
    
    const isMatchingAccount = Boolean(cleanActive && cleanPost && cleanActive === cleanPost);
    const isMatchingUser = Boolean(
      (currentUser.id && postUserId === currentUser.id) ||
      (currentUser.username && postUserId === currentUser.username) ||
      (post.user && (post.user.id === currentUser.id || post.user.username === currentUser.username))
    );

    // CRITICAL: Live OP must strictly be owned by the active user's cTrader account only
    return isMatchingUser || isMatchingAccount;
  });

  // Extract Live OP trades strictly belonging to this logged in user
  const userLiveTradesProp = (liveTrades || []).filter((t) => {
    const isMatchingUser = Boolean(
      (currentUser.id && t.userId === currentUser.id) ||
      (currentUser.username && t.userId === currentUser.username)
    );
    const isMatchingAccount = Boolean(
      activeAccount?.accountId && (t.accountId === activeAccount.accountId || String(t.accountId) === String(activeAccount.accountId))
    );
    return isMatchingUser || isMatchingAccount || (!t.userId && !t.accountId);
  });

  const liveTradeItems: Trade[] = [
    ...userLiveTradesProp,
    ...activeAccountPosts
      .filter((p) => p.trade && (p.trade.status === 'OPEN' || p.status === 'OPEN'))
      .map((p) => p.trade)
  ];

  const accountLiveTradesMap = new Map<string, Trade>();
  liveTradeItems.forEach((t) => {
    if (t && t.id) {
      accountLiveTradesMap.set(t.id, t);
    }
  });
  const accountLiveTrades = Array.from(accountLiveTradesMap.values());

  // Extract Closed Portfolio trades strictly belonging to this logged in user
  const userClosedTradesProp = (closedTrades || []).filter((t) => {
    const isMatchingUser = Boolean(
      (currentUser.id && t.userId === currentUser.id) ||
      (currentUser.username && t.userId === currentUser.username)
    );
    const isMatchingAccount = Boolean(
      activeAccount?.accountId && (t.accountId === activeAccount.accountId || String(t.accountId) === String(activeAccount.accountId))
    );
    return isMatchingUser || isMatchingAccount || (!t.userId && !t.accountId);
  });

  const closedTradeItems: Trade[] = [
    ...userClosedTradesProp,
    ...activeAccountPosts
      .filter((p) => p.trade && (p.trade.status === 'CLOSED' || p.status === 'CLOSED'))
      .map((p) => p.trade)
  ];

  const accountClosedTradesMap = new Map<string, Trade>();
  closedTradeItems.forEach((t) => {
    if (t && t.id) {
      accountClosedTradesMap.set(t.id, t);
    }
  });
  const accountClosedTrades = Array.from(accountClosedTradesMap.values());

  const [switchingAccountId, setSwitchingAccountId] = useState<string | null>(null);

  // Quick switch account
  const handleQuickSwitch = async (acc: typeof currentAccounts[0]) => {
    if (acc.accountId === currentUser.cTraderAccountId && currentUser.cTraderConnected) return;
    
    // Trigger subtle haptic feedback immediately on click
    triggerHaptic('medium');
    setIsSwitching(true);
    setSwitchingAccountId(acc.accountId);
    setAccountMetrics(null); // Clear old state before loading new account

    try {
      const savedUserId = localStorage.getItem('scrolic_user_id') || currentUser.id;
      const res = await fetch('/api/ctrader/switch', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-session-user-id': savedUserId
        },
        body: JSON.stringify({
          accountId: acc.accountId,
          broker: acc.brokerName || 'FP Markets',
          environment: acc.accountType === 'LIVE' ? 'live' : 'demo'
        })
      });
      const responseBody = await res.text();
      let data: any = {};
      try {
        data = responseBody ? JSON.parse(responseBody) : {};
      } catch {
        throw new Error(`Gagal beralih akun cTrader (${res.status})`);
      }
      if (!res.ok) throw new Error(data.detail || data.error || 'Gagal beralih akun');
      if (onUpdateUser) {
        onUpdateUser(data.user);
      }
      socketClient.joinAccountRoom(acc.accountId);
      
      if (onRefreshFeed) {
        await onRefreshFeed();
      }

      // Success haptic feedback & toast
      triggerHaptic('success');
      setSyncSuccessMsg(`Berhasil beralih ke akun ${acc.accountId}! Data posisi & saldo disinkronkan.`);
      setTimeout(() => setSyncSuccessMsg(null), 3500);
    } catch (err: any) {
      triggerHaptic('error');
      alert(err.message || 'Gagal beralih akun cTrader');
    } finally {
      setIsSwitching(false);
      setSwitchingAccountId(null);
    }
  };

  // Re-sync cTrader
  const handleManualSync = async () => {
    setIsSyncing(true);
    triggerHaptic('medium');
    try {
      const savedUserId = localStorage.getItem('scrolic_user_id') || currentUser.id;
      const syncRes = await fetch('/api/ctrader/sync', {
        headers: { 'x-session-user-id': savedUserId }
      });
      const syncBody = await syncRes.text();
      let syncData: any = {};
      try {
        syncData = syncBody ? JSON.parse(syncBody) : {};
      } catch {
        throw new Error(`Sinkronisasi cTrader gagal (${syncRes.status})`);
      }
      if (!syncRes.ok || !syncData.success || syncData.syncResult?.synced === false) {
        throw new Error(syncData.detail || syncData.error || 'Sinkronisasi cTrader gagal');
      }
      const mRes = await fetch('/api/ctrader/account/metrics', {
        headers: { 'x-session-user-id': savedUserId }
      });
      const mData = await mRes.json();
      if (mData.metrics) {
        setAccountMetrics(mData.metrics);
      }
      if (onRefreshFeed) {
        onRefreshFeed();
      }
      setSyncSuccessMsg('Posisi & Saldo cTrader berhasil disinkronkan!');
      triggerHaptic('success');
      setTimeout(() => setSyncSuccessMsg(null), 3500);
    } catch (err) {
      console.warn('[Dashboard] Manual sync error:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Compute live performance metrics
  const totalTradesCount = Math.max(accountLiveTrades.length + accountClosedTrades.length, currentUser.totalTrades || 0, (currentUser as any).totalTradesCount || 0);
  const winningTrades = accountClosedTrades.filter((t) => (t.profitUSD ?? 0) > 0);
  const calculatedWinRate = accountClosedTrades.length > 0 ? (winningTrades.length / accountClosedTrades.length) * 100 : 0;
  const winRate = (currentUser.winRate && currentUser.winRate > 0)
    ? currentUser.winRate.toFixed(1)
    : accountClosedTrades.length > 0
    ? calculatedWinRate.toFixed(1)
    : '0.0';
  const closedProfitUSD = accountClosedTrades.reduce((acc, t) => acc + (t.profitUSD ?? 0), 0);
  const liveProfitUSD = accountLiveTrades.reduce((acc, t) => acc + (t.profitUSD ?? 0), 0);
  const activeAccountBalance = accountMetrics?.balance ?? activeAccount?.balance ?? 0;
  const activeAccountHasPositions = (accountMetrics?.openPositionsCount ?? accountLiveTrades.length) > 0;
  const activeAccountFloating = activeAccountHasPositions
    ? (accountMetrics?.unrealizedPnL ?? liveProfitUSD)
    : 0;
  const activeAccountEquity = activeAccountHasPositions
    ? (accountMetrics?.equity ?? activeAccountBalance + activeAccountFloating)
    : activeAccountBalance;
  const activeAccountFreeMargin = activeAccountHasPositions
    ? (accountMetrics?.freeMargin ?? activeAccountEquity)
    : activeAccountEquity;
  const activeAccountMarginLevel = activeAccountHasPositions ? accountMetrics?.marginLevel : null;
  const netProfitUSD = +((closedProfitUSD + liveProfitUSD) || currentUser.totalProfitUSD || 0).toFixed(2);
  const totalPips = +((accountClosedTrades.reduce((acc, t) => acc + (t.pips ?? 0), 0) + accountLiveTrades.reduce((acc, t) => acc + (t.pips ?? 0), 0)) || currentUser.totalPips || 0).toFixed(1);

  return (
    <div className="w-full max-w-md mx-auto pb-24 px-3 sm:px-0 space-y-3.5">
      
      {/* Dashboard Top Header */}
      <div className="pt-2 pb-1 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-white font-display flex items-center gap-2">
            <span>Dashboard Trader</span>
          </h2>
          <p className="text-xs text-neutral-400">cTrader Live Activity & Hub Broker</p>
        </div>

        {/* Quick Sync / Gateway Trigger */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleManualSync}
            disabled={isSyncing}
            className="p-2 rounded-xl bg-[#141414] hover:bg-[#1f1f1f] text-neutral-300 border border-[#222222] transition-colors cursor-pointer disabled:opacity-50"
            title="Sinkronkan Posisi"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-amber-400' : ''}`} />
          </button>
          {onOpenCTraderGateway && (
            <button
              onClick={onOpenCTraderGateway}
              className="px-2.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer"
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Kelola Akun</span>
            </button>
          )}
        </div>
      </div>

      {syncSuccessMsg && (
        <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center gap-2 text-xs text-emerald-300">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{syncSuccessMsg}</span>
        </div>
      )}

      {/* 3 Main Tabs: Ringkasan, Live, Portofolio */}
      <div className="flex bg-[#111111] p-1 rounded-2xl border border-[#1f1f1f]">
        <button
          onClick={() => setActiveTab('summary')}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            activeTab === 'summary'
              ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          Ringkasan & Broker
        </button>
        <button
          onClick={() => setActiveTab('live')}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer relative ${
            activeTab === 'live'
              ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <span>Live OP ({accountLiveTrades.length})</span>
          {accountLiveTrades.length > 0 && (
            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block ml-1 animate-pulse" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('portfolio')}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            activeTab === 'portfolio'
              ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          Portofolio ({accountClosedTrades.length})
        </button>
      </div>

      {/* Tab 1: Ringkasan & Broker */}
      {activeTab === 'summary' && (
        <div className="space-y-3.5">
          
          {/* Main Performance Hero Card */}
          <div className="bg-[#111111] rounded-2xl p-4 border border-amber-500/30 space-y-4 relative overflow-hidden shadow-[0_4px_24px_-2px_rgba(0,0,0,0.6)]">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[11px] text-neutral-400 uppercase font-bold tracking-wider">
                  {currentUser.cTraderConnected ? 'Total Equity & Profit Bersih' : 'Total Profit / Loss Bersih'}
                </span>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-2xl font-black font-mono text-emerald-400">
                    ${activeAccountEquity.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                  <span className={`text-xs font-mono font-bold ${activeAccountFloating >= 0 ? 'text-emerald-300' : 'text-rose-400'}`}>
                    (Floating: {activeAccountFloating >= 0 ? '+' : ''}${activeAccountFloating.toFixed(2)})
                  </span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-neutral-400 uppercase font-bold tracking-wider">
                  Win Rate
                </span>
                <span className="text-xl font-black text-amber-300 block font-mono">
                  {winRate}%
                </span>
              </div>
            </div>

            {/* Performance Grid */}
            <div className="grid grid-cols-3 gap-2 pt-3 border-t border-[#1f1f1f] text-center font-mono">
              <div className="bg-[#161616] p-2.5 rounded-xl border border-[#222222]">
                <span className="text-[10px] text-neutral-400 block font-sans">Total Trades</span>
                <span className="text-sm font-bold text-white">{totalTradesCount}</span>
              </div>
              <div className="bg-[#161616] p-2.5 rounded-xl border border-[#222222]">
                <span className="text-[10px] text-neutral-400 block font-sans">Live Active</span>
                <span className="text-sm font-bold text-emerald-400">{accountLiveTrades.length} OP</span>
              </div>
              <div className="bg-[#161616] p-2.5 rounded-xl border border-[#222222]">
                <span className="text-[10px] text-neutral-400 block font-sans">Win / Loss</span>
                <span className="text-sm font-bold text-white">{winningTrades.length} / {accountClosedTrades.length - winningTrades.length}</span>
              </div>
            </div>
          </div>

          {/* === DEDICATED CTRADER BROKER HUB ON DASHBOARD === */}
          <div className="bg-gradient-to-b from-[#0c1f14] to-[#08150d] rounded-2xl p-4 border border-emerald-500/40 space-y-3.5 relative overflow-hidden shadow-lg shadow-emerald-950/40">
            {/* Header / Active Status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                  <Activity className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">Koneksi Broker cTrader</h3>
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
                  </div>
                  <span className="text-[10px] text-emerald-300/80 font-mono">
                    Open API Protobuf (WebSocket WS:5036 • ~18ms)
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {accountMetrics?.isStale && (
                  <span className="text-[9px] font-mono px-2 py-0.5 rounded-full font-bold uppercase bg-amber-500/25 text-amber-300 border border-amber-500/40">
                    Stale (&gt;45s)
                  </span>
                )}
                <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full font-bold uppercase ${
                  !currentUser.cTraderConnected
                    ? 'bg-neutral-800 text-neutral-400 border border-neutral-700'
                    : connectionStatus?.state === 'DEGRADED'
                    ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40'
                    : 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/40'
                }`}>
                  {!currentUser.cTraderConnected 
                    ? 'Disconnected' 
                    : connectionStatus?.state === 'DEGRADED'
                    ? 'Degraded'
                    : 'Connected • Live Realtime'}
                </span>
              </div>
            </div>

            {/* Active Account Card & Switcher */}
            <div className="bg-[#0e2719]/80 p-3 rounded-xl border border-emerald-500/25 space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-white text-xs">
                      {currentUser.cTraderConnected ? (activeAccount?.brokerName || 'Spotware cTrader') : 'Spotware cTrader'}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-black ${
                      (activeAccount?.accountType || 'LIVE') === 'LIVE'
                        ? 'bg-emerald-500 text-black'
                        : 'bg-amber-500 text-black'
                    }`}>
                      {currentUser.cTraderConnected ? (activeAccount?.accountType || 'LIVE') : 'OFFLINE'}
                    </span>
                  </div>
                  <span className="text-[11px] text-emerald-300 font-mono block">
                    ID: {currentUser.cTraderConnected ? (activeAccount?.accountId || 'Belum Terhubung') : 'Belum Terhubung'}
                  </span>
                </div>

                <div className="text-right font-mono">
                  <span className="text-xs font-black text-white block">
                    {currentUser.cTraderConnected ? `$${activeAccountBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${accountMetrics?.currency || activeAccount?.currency || 'USD'}` : '$0 USD'}
                  </span>
                  <span className="text-[9px] text-emerald-300/80 block">
                    Equity: ${activeAccountEquity.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-[8px] text-neutral-400">
                    {currentUser.cTraderConnected ? `Leverage 1:${accountMetrics?.leverage || activeAccount?.leverage || 500}` : 'Status: Belum Terhubung'}
                  </span>
                </div>
              </div>

              {/* Realtime Margin & Equity Bar */}
              {currentUser.cTraderConnected && (
                <div className="grid grid-cols-3 gap-1 pt-2 border-t border-emerald-500/20 text-center font-mono text-[9px]">
                  <div className="bg-[#091f13] p-1.5 rounded-lg border border-emerald-500/15">
                    <span className="text-neutral-400 block font-sans text-[8px]">Floating PnL</span>
                    <span className={`font-bold ${activeAccountFloating >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {activeAccountFloating >= 0 ? '+' : ''}${activeAccountFloating.toFixed(2)}
                    </span>
                  </div>
                  <div className="bg-[#091f13] p-1.5 rounded-lg border border-emerald-500/15">
                    <span className="text-neutral-400 block font-sans text-[8px]">Free Margin</span>
                    <span className="font-bold text-white">${activeAccountFreeMargin.toLocaleString('en-US', { minimumFractionDigits: 1 })}</span>
                  </div>
                  <div className="bg-[#091f13] p-1.5 rounded-lg border border-emerald-500/15">
                    <span className="text-neutral-400 block font-sans text-[8px]">Margin Level</span>
                    <span className="font-bold text-amber-300">{activeAccountMarginLevel !== undefined && activeAccountMarginLevel !== null ? `${activeAccountMarginLevel}%` : 'N/A'}</span>
                  </div>
                </div>
              )}

              {/* Account Switcher Pills */}
              {currentAccounts.length > 0 && (
                <div className="pt-2 border-t border-emerald-500/20">
                  <span className="text-[10px] text-neutral-400 font-semibold mb-1.5 flex items-center justify-between">
                    <span>Pilih / Beralih Akun Aktif:</span>
                    {isSwitching && (
                      <span className="text-amber-300 text-[10px] font-bold flex items-center gap-1.5 animate-pulse">
                        <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />
                        <span>Menyiapkan Data Sinkronisasi...</span>
                      </span>
                    )}
                  </span>

                  <div className="grid grid-cols-3 gap-1.5">
                    {currentAccounts.map((acc) => {
                      const isSelected = acc.accountId === currentUser.cTraderAccountId;
                      const isThisSwitching = switchingAccountId === acc.accountId;
                      return (
                        <button
                          key={acc.accountId}
                          onClick={() => handleQuickSwitch(acc)}
                          disabled={isSwitching}
                          className={`p-2 rounded-xl text-left transition-all border cursor-pointer relative overflow-hidden ${
                            isThisSwitching
                              ? 'bg-amber-500/20 border-amber-400 text-white shadow-lg ring-1 ring-amber-400/50'
                              : isSelected
                              ? 'bg-emerald-500/30 border-emerald-400 text-white shadow-sm'
                              : 'bg-[#091d12] hover:bg-[#113320] border-emerald-500/20 text-neutral-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-bold truncate block">{acc.accountType}</span>
                            {isThisSwitching ? (
                              <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />
                            ) : isSelected ? (
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            ) : null}
                          </div>
                          <span className="text-[9px] font-mono text-neutral-400 block truncate">
                            #{acc.accountId ? acc.accountId.slice(-6) : 'ACC'}
                          </span>
                          <span className="text-[9px] font-mono font-bold text-emerald-300 block">
                            ${(acc.balance || 0).toLocaleString()}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons: Switch/Manage Gateway & New Account */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              {onOpenCTraderGateway && (
                <button
                  onClick={onOpenCTraderGateway}
                  className="py-2 px-2.5 rounded-xl bg-[#0d2a1a] hover:bg-[#143d26] text-emerald-200 border border-emerald-500/30 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Kelola & Switch</span>
                </button>
              )}

              <a
                href={FP_MARKETS_REGISTER_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => triggerHaptic('selection')}
                className="py-2 px-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-black text-[11px] font-black flex items-center justify-center gap-1.5 transition-all shadow-md shadow-amber-500/20 cursor-pointer text-center"
              >
                <span>Buka Akun Baru</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            {/* New User Callout: Buka Akun cTrader Baru */}
            <div className="p-2.5 rounded-xl bg-[#091c12] border border-emerald-500/25 space-y-1.5">
              <div className="flex items-center gap-1.5 text-amber-300">
                <Sparkles className="w-3.5 h-3.5 fill-amber-300" />
                <span className="text-[11px] font-bold">Pengguna Baru? Buka Akun cTrader FP Markets</span>
              </div>
              <p className="text-[10px] text-neutral-300 leading-relaxed">
                Nikmati <strong>Raw Spread mulai 0.0 Pip</strong>, eksekusi &lt;40ms, bebas swap, serta deposit IDR instan lewat bank lokal Indonesia.
              </p>
            </div>
          </div>

          {/* Quick Shortcuts: Energy & Referral */}
          <div className="grid grid-cols-2 gap-3">
            {/* Energy Card */}
            <div 
              onClick={onOpenEnergy}
              className="bg-[#111111] p-3.5 rounded-2xl border border-[#1f1f1f] hover:border-amber-500/40 transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="w-7 h-7 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center">
                  <Zap className="w-4 h-4 fill-amber-400" />
                </div>
                <ArrowUpRight className="w-4 h-4 text-neutral-500 group-hover:text-amber-400 transition-colors" />
              </div>
              <span className="text-[11px] text-neutral-400 block font-medium">Saldo Energy</span>
              <span className="text-base font-black font-mono text-white">
                {currentUser.energyBalance || (currentUser as any).energy || 0} <span className="text-[10px] text-amber-400">ENERGY</span>
              </span>
            </div>

            {/* Referral Card */}
            <div 
              onClick={onOpenReferral}
              className="bg-[#111111] p-3.5 rounded-2xl border border-[#1f1f1f] hover:border-emerald-500/40 transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
                <ArrowUpRight className="w-4 h-4 text-neutral-500 group-hover:text-emerald-400 transition-colors" />
              </div>
              <span className="text-[11px] text-neutral-400 block font-medium">Afiliasi 5 Gen</span>
              <span className="text-base font-black font-mono text-white">
                {currentUser.referralsCount || 0} <span className="text-[10px] text-emerald-400">TRADERS</span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Live Positions */}
      {activeTab === 'live' && (
        <div className="space-y-3">
          {accountLiveTrades.length === 0 ? (
            <div className="text-center py-12 bg-[#111111] rounded-2xl border border-[#1f1f1f] p-5">
              <Activity className="w-8 h-8 text-neutral-600 mx-auto mb-2" />
              <h4 className="text-white font-bold text-xs mb-1">Tidak Ada Posisi Aktif</h4>
              <p className="text-[11px] text-neutral-400 max-w-xs mx-auto">
                Buka order baru dari setup card di feed dengan menekan tombol <strong>Ikuti Setup</strong> atau lakukan eksekusi order langsung di platform cTrader Anda.
              </p>
            </div>
          ) : (
            accountLiveTrades.map((t) => (
              <DashboardLiveTradeItem 
                key={t.id}
                trade={t}
                onCloseTrade={onCloseTrade}
              />
            ))
          )}
        </div>
      )}

      {/* Tab 3: Portofolio (Closed Trades) */}
      {activeTab === 'portfolio' && (() => {
        const sortedClosed = [...accountClosedTrades].sort((a, b) => {
          const at = new Date(a.closeTime || a.openTime || 0).getTime();
          const bt = new Date(b.closeTime || b.openTime || 0).getTime();
          return bt - at;
        });
        const totalPages = Math.max(1, Math.ceil(sortedClosed.length / PORTFOLIO_PAGE_SIZE));
        const currentPage = Math.min(portfolioPage, totalPages);
        const startIdx = (currentPage - 1) * PORTFOLIO_PAGE_SIZE;
        const pageItems = sortedClosed.slice(startIdx, startIdx + PORTFOLIO_PAGE_SIZE);
        return (
        <div className="space-y-2.5">
          <div className="flex justify-between items-center px-1 mb-1 text-xs text-neutral-400">
            <span data-testid="portfolio-summary">Riwayat ({accountClosedTrades.length}) Trade Terakhir</span>
            <span>Realized P/L</span>
          </div>
          {sortedClosed.length === 0 ? (
            <div className="text-center py-10 bg-[#111111] rounded-2xl border border-[#1f1f1f] p-4 text-xs text-neutral-400">
              Belum ada riwayat transaksi selesai untuk akun cTrader ini.
            </div>
          ) : (
            <>
              {pageItems.map((t) => {
              const isBuy = t.direction === 'BUY';
              const isProfit = (t.profitUSD ?? 0) >= 0;

              return (
                <div 
                  key={t.id}
                  data-testid={`portfolio-trade-${t.id}`}
                  className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-3 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                      isProfit ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                    }`}>
                      {isBuy ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-white">{t.symbol}</span>
                        <span className="text-[10px] text-neutral-400 font-mono">({t.volumeLot} Lot)</span>
                      </div>
                      <span className="text-[10px] text-neutral-500 font-mono">
                        {t.duration || 'Closed'} • Entry: {t.entryPrice}
                      </span>
                    </div>
                  </div>

                  <div className="text-right font-mono">
                    <span className={`font-bold block ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {isProfit ? '+' : ''}${(t.profitUSD ?? 0).toFixed(2)}
                    </span>
                    <span className="text-[10px] text-neutral-500">
                      {isProfit ? '+' : ''}{(t.pips ?? 0).toFixed(1)} Pips
                    </span>
                  </div>
                </div>
              );
              })}

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-3 pb-1">
                  <button
                    data-testid="portfolio-prev-page"
                    onClick={() => { triggerHaptic('light'); setPortfolioPage((p) => Math.max(1, p - 1)); }}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 rounded-lg bg-[#141414] hover:bg-[#1f1f1f] disabled:opacity-40 disabled:cursor-not-allowed text-neutral-300 border border-[#222222] text-[11px] font-bold cursor-pointer"
                  >
                    ← Prev
                  </button>
                  <span data-testid="portfolio-page-indicator" className="text-[11px] text-neutral-400 font-mono">
                    Halaman {currentPage} / {totalPages} • {startIdx + 1}–{Math.min(startIdx + PORTFOLIO_PAGE_SIZE, sortedClosed.length)} dari {sortedClosed.length}
                  </span>
                  <button
                    data-testid="portfolio-next-page"
                    onClick={() => { triggerHaptic('light'); setPortfolioPage((p) => Math.min(totalPages, p + 1)); }}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 rounded-lg bg-[#141414] hover:bg-[#1f1f1f] disabled:opacity-40 disabled:cursor-not-allowed text-neutral-300 border border-[#222222] text-[11px] font-bold cursor-pointer"
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
        );
      })()}
    </div>
  );
};
