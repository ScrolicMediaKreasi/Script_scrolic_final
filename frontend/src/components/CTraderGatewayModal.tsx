import React, { useState } from 'react';
import { 
  X, 
  Activity, 
  ExternalLink, 
  CheckCircle2, 
  ShieldCheck, 
  Zap, 
  Radio, 
  RefreshCw, 
  Unlink, 
  Layers, 
  Terminal, 
  AlertTriangle,
  ArrowRight,
  Sparkles,
  Server,
  Check,
  Plus,
  Lock
} from 'lucide-react';
import { User } from '../types';
import { triggerHaptic } from '../utils/haptics';

interface CTraderGatewayModalProps {
  currentUser: User;
  onClose: () => void;
  onUpdateUser: (updatedUser: User) => void;
}

export const FP_MARKETS_REGISTER_URL = 'https://portal.fp-indonesia.com/register?fpm-affiliate-utm-source=IB&fpm-affiliate-agt=61546';
export const CTRADER_GRANT_ACCESS_URL = 'https://openapi.ctrader.com/apps/auth';

export const CTraderGatewayModal: React.FC<CTraderGatewayModalProps> = ({
  currentUser,
  onClose,
  onUpdateUser
}) => {
  const isConnected = Boolean(currentUser.cTraderConnected);

  const currentAccounts = (currentUser.cTraderAccounts && currentUser.cTraderAccounts.length > 0)
    ? currentUser.cTraderAccounts.filter((account) => currentUser.role === 'admin' || account.accountType === 'LIVE' || account.isLive === true)
    : [];

  // States
  const [config, setConfig] = useState<{ clientId?: string; grantAccessUrl?: string; isConfigured?: boolean }>({});
  const [connectError, setConnectError] = useState<string | null>(null);
  const [isSwitchingAccount, setIsSwitchingAccount] = useState(isConnected);
  const [selectedAccountId, setSelectedAccountId] = useState<string>(currentUser.cTraderAccountId || currentAccounts[0]?.accountId || '');
  const [tokenStatus, setTokenStatus] = useState<{
    isConnected: boolean;
    hasAccessToken: boolean;
    hasRefreshToken: boolean;
    expiresAt: string | null;
    isExpired: boolean;
    isExpiringSoon: boolean;
  } | null>(null);
  const [isRefreshingToken, setIsRefreshingToken] = useState(false);

  const fetchTokenStatus = () => {
    fetch('/api/ctrader/token/status')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.status) {
          setTokenStatus(data.status);
        }
      })
      .catch(() => {});
  };

  React.useEffect(() => {
    fetch('/api/ctrader/config')
      .then((res) => res.json())
      .then((data) => setConfig(data))
      .catch(() => {});

    if (isConnected) {
      fetchTokenStatus();
    }

    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'CTRADER_OAUTH_SUCCESS') {
        if (e.data.user) {
          onUpdateUser(e.data.user);
          setIsSwitchingAccount(true);
        } else if (e.data.accounts && e.data.accounts.length > 0) {
          handleFinalizeConnection(e.data.accounts[0]?.accountId);
        }
        fetchTokenStatus();
        triggerHaptic('success');
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [isConnected]);

  const [isSyncingTrades, setIsSyncingTrades] = useState(false);

  const handleManualRefreshToken = async () => {
    setIsRefreshingToken(true);
    triggerHaptic('medium');
    try {
      const res = await fetch('/api/ctrader/token/refresh', { method: 'POST' });
      const body = await res.text();
      const data = body ? JSON.parse(body) : {};
      if (data.success && data.status) {
        setTokenStatus(data.status);
        triggerHaptic('success');
      }
    } catch {
      triggerHaptic('error');
    } finally {
      setIsRefreshingToken(false);
    }
  };

  const handleSyncAccountTrades = async () => {
    setIsSyncingTrades(true);
    triggerHaptic('medium');
    try {
      const res = await fetch('/api/ctrader/sync', { method: 'POST' });
      const body = await res.text();
      const data = body ? JSON.parse(body) : {};
      if (!res.ok) throw new Error(data.detail || data.error || `Sync gagal (${res.status})`);
      if (data.success && data.user) {
        onUpdateUser(data.user);
        triggerHaptic('success');
      }
    } catch {
      triggerHaptic('error');
    } finally {
      setIsSyncingTrades(false);
    }
  };

  // Step state for Connect Flow after granting access
  const [hasGrantedAccessPrompt, setHasGrantedAccessPrompt] = useState(false);
  const [isConnectingAuthorizedAccount, setIsConnectingAuthorizedAccount] = useState(false);

  // Add custom account inside switch popup
  const [isAddingCustomAccount, setIsAddingCustomAccount] = useState(false);
  const [newAccountIdInput, setNewAccountIdInput] = useState('');
  const [newAccountBroker, setNewAccountBroker] = useState('FP Markets');
  const [newAccountType, setNewAccountType] = useState<'LIVE' | 'DEMO'>('LIVE');

  // Disconnect confirmation
  const [isConfirmingDisconnect, setIsConfirmingDisconnect] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  // 1. User clicks "Hubungkan Sekarang" -> open cTrader official grant access popup
  const handleOpenGrantAccess = async () => {
    triggerHaptic('selection');
    setHasGrantedAccessPrompt(true);
    const popup = window.open('', 'cTraderOAuthPopup', 'width=600,height=750,scrollbars=yes,status=yes');

    if (!popup) {
      setConnectError('Popup cTrader diblokir browser. Izinkan popup untuk melanjutkan otorisasi.');
      return;
    }

    try {
      const userId = currentUser.id || currentUser.username || '';
      const uId = encodeURIComponent(userId);
      const res = await fetch(`/api/ctrader/auth-url?json=true&userId=${uId}`, {
        headers: { 'x-session-user-id': userId }
      });
      const data = await res.json();
      const targetUrl = data.authUrl || data.url;
      if (targetUrl) {
        popup.location.href = targetUrl;
      } else {
        throw new Error('URL otorisasi cTrader tidak tersedia.');
      }
    } catch {
      const userId = currentUser.id || currentUser.username || '';
      popup.location.href = `/api/ctrader/auth-url?userId=${encodeURIComponent(userId)}`;
    }
  };

  // 2. User confirms they gave access or selects account to bind
  const handleFinalizeConnection = async (targetAccountId?: string) => {
    const accId = targetAccountId || selectedAccountId || currentAccounts[0]?.accountId || '';
    if (!accId || currentAccounts.length === 0) {
      setConnectError('Tidak ada akun cTrader terverifikasi dari OAuth. Silakan hubungkan ulang akun cTrader.');
      return;
    }
    setIsConnectingAuthorizedAccount(true);
    setConnectError(null);
    try {
      const res = await fetch('/api/ctrader/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: accId,
          broker: 'FP Markets',
          accounts: currentAccounts
        })
      });
      const body = await res.text();
      const data = body ? JSON.parse(body) : {};
      if (!res.ok) throw new Error(data.detail || data.error || 'Gagal menghubungkan akun cTrader');

      onUpdateUser(data.user);
      triggerHaptic('success');
    } catch (err: any) {
      setConnectError(err.message);
      triggerHaptic('error');
    } finally {
      setIsConnectingAuthorizedAccount(false);
    }
  };

  const [switchingAccountId, setSwitchingAccountId] = useState<string | null>(null);

  // 3. User switches active account in the popup
  const handleSwitchToAccount = async (account: typeof currentAccounts[0]) => {
    if (account.accountId === currentUser.cTraderAccountId && currentUser.cTraderConnected) return;

    triggerHaptic('medium');
    setIsSwitchingAccount(true);
    setSwitchingAccountId(account.accountId);
    setConnectError(null);
    try {
      const res = await fetch('/api/ctrader/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: account.accountId,
          broker: account.brokerName || 'FP Markets',
          environment: account.accountType === 'LIVE' ? 'live' : 'demo'
        })
      });
      const body = await res.text();
      const data = body ? JSON.parse(body) : {};
      if (!res.ok) throw new Error(data.detail || data.error || 'Gagal beralih akun cTrader');

      setSelectedAccountId(account.accountId);
      onUpdateUser(data.user);
      triggerHaptic('success');
    } catch (err: any) {
      setConnectError(err.message);
      triggerHaptic('error');
    } finally {
      setIsSwitchingAccount(false);
      setSwitchingAccountId(null);
    }
  };

  // 4. Add new account to list
  const handleAddNewAccount = async () => {
    if (!newAccountIdInput.trim()) {
      setConnectError('Harap masukkan nomor Akun cTrader');
      return;
    }
    const cleanId = newAccountIdInput.trim();
    const newAccountObj = {
      accountId: cleanId.startsWith('cTrader-') || /^\d+$/.test(cleanId) ? cleanId : `cTrader-${cleanId}`,
      brokerName: newAccountBroker,
      accountType: newAccountType,
      currency: 'USD',
      balance: newAccountType === 'LIVE' ? 10000 : 50000,
      leverage: 500,
      isLive: newAccountType === 'LIVE'
    };

    const updatedList = [...currentAccounts.filter(a => a.accountId !== newAccountObj.accountId), newAccountObj];
    
    setIsSwitchingAccount(true);
    try {
      const res = await fetch('/api/ctrader/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: newAccountObj.accountId,
          broker: newAccountObj.brokerName,
          environment: newAccountType === 'LIVE' ? 'live' : 'demo',
          accounts: updatedList
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menambahkan akun');

      onUpdateUser({
        ...data.user,
        cTraderAccounts: updatedList
      });
      setIsAddingCustomAccount(false);
      setNewAccountIdInput('');
      setSelectedAccountId(newAccountObj.accountId);
      triggerHaptic('success');
    } catch (err: any) {
      setConnectError(err.message);
    } finally {
      setIsSwitchingAccount(false);
    }
  };

  // 5. Disconnect
  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      const res = await fetch('/api/ctrader/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal memutuskan koneksi cTrader');

      onUpdateUser(data.user);
      triggerHaptic('selection');
      onClose();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsDisconnecting(false);
      setIsConfirmingDisconnect(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div 
        id="ctrader-gateway-modal"
        className="w-full max-w-lg bg-[#0B0B0B] border border-[#222222] rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]"
      >
        {/* Modal Header */}
        <div className="p-4 border-b border-[#1c1c1c] flex items-center justify-between bg-[#111111]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-sm">
                  {isConnected ? 'Switch & Kelola Akun cTrader' : 'Hubungkan Akun cTrader'}
                </h3>
                <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase ${
                  isConnected ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                }`}>
                  {isConnected ? 'CONNECTED' : 'STANDBY'}
                </span>
              </div>
              <p className="text-[11px] text-neutral-400">Spotware cTrader Open API Official Authorization</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-[#1c1c1c] text-neutral-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          
          {/* Error notice */}
          {connectError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{connectError}</span>
            </div>
          )}

          {/* ========================================================================= */}
          {/* SCENARIO 1: USER IS NOT CONNECTED TO CTRADER */}
          {/* ========================================================================= */}
          {!isConnected && (
            <div className="space-y-4">
              
              {/* Promo / Broker Register Action (FP Markets cTrader) */}
              <div className="bg-gradient-to-br from-[#0c2419] to-[#081510] border border-emerald-500/35 rounded-2xl p-4 space-y-3 relative overflow-hidden shadow-lg">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
                <div className="flex items-start gap-3 relative z-10">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                    <Zap className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-white uppercase tracking-wider">Belum Punya Akun cTrader?</h4>
                    <p className="text-[11px] text-emerald-200/80 mt-0.5 leading-relaxed">
                      Daftar dan buka akun cTrader resmi via FP Markets Broker untuk eksekusi ECN Raw Spread 0.0 pip & auto-sync real-time ke Scrolic.
                    </p>
                  </div>
                </div>

                <a
                  href={FP_MARKETS_REGISTER_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => triggerHaptic('selection')}
                  className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-emerald-500/20 cursor-pointer"
                >
                  <span>Buka Akun cTrader (FP Markets)</span>
                  <ExternalLink className="w-3.5 h-3.5 stroke-[2.5]" />
                </a>
              </div>

              {/* Official Spotware OAuth Grant Access Card */}
              <div className="bg-[#121212] rounded-2xl p-4 border border-[#222222] space-y-3.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-amber-400" />
                    <span>Otorisasi Resmi Spotware cTrader</span>
                  </h4>
                  <span className="text-[10px] text-emerald-400 font-mono">Bebas Blokir (Cloudflare ECN Proxy) • Open API 2.0</span>
                </div>

                <p className="text-xs text-neutral-300 leading-relaxed">
                  Sesuai aturan resmi Spotware, klik tombol di bawah untuk memberikan izin akses trading akun cTrader Anda secara aman langsung melalui portal cTrader Open API.
                </p>

                {/* Single Direct Action Button as requested */}
                <button
                  type="button"
                  onClick={handleOpenGrantAccess}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-black font-black text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-amber-500/20 cursor-pointer"
                >
                  <ExternalLink className="w-4 h-4 stroke-[2.5]" />
                  <span>Hubungkan Sekarang (cTrader Open API)</span>
                </button>

                <div className="text-[10px] text-neutral-400 bg-[#0e0e0e] p-2.5 rounded-xl border border-[#1f1f1f] space-y-1">
                  <div className="flex items-center gap-1.5 text-neutral-300 font-semibold">
                    <Lock className="w-3 h-3 text-emerald-400" />
                    <span>Keamanan & Privasi Terjamin:</span>
                  </div>
                  <p>
                    Kredensial dan password akun Anda tidak disimpan di Scrolic. Akses otorisasi diatur langsung oleh server resmi Spotware ID.
                  </p>
                </div>
              </div>

              {/* After user clicks Grant Access: Display list of authorized accounts to bind */}
              {hasGrantedAccessPrompt && (
                <div className="bg-[#141414] rounded-2xl p-4 border border-amber-500/40 space-y-3 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      <h4 className="text-xs font-bold text-white">Pilih Akun yang Ingin Dihubungkan</h4>
                    </div>
                    <span className="text-[10px] text-amber-300 font-mono">{currentAccounts.length} Akun Terdeteksi</span>
                  </div>

                  <p className="text-[11px] text-neutral-300 leading-relaxed">
                    Akses otorisasi berhasil diberikan. Silakan pilih salah satu akun trading cTrader Anda untuk mulai sinkronisasi:
                  </p>

                  <div className="space-y-2">
                    {currentAccounts.map((acc) => {
                      const isSelected = selectedAccountId === acc.accountId;
                      return (
                        <div
                          key={acc.accountId}
                          onClick={() => setSelectedAccountId(acc.accountId)}
                          className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                            isSelected
                              ? 'bg-amber-500/15 border-amber-500 text-white'
                              : 'bg-[#181818] border-[#262626] text-neutral-300 hover:border-neutral-700'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                              isSelected ? 'border-amber-400 bg-amber-500 text-black' : 'border-neutral-600'
                            }`}>
                              {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-xs text-white">{acc.accountId}</span>
                                <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase ${
                                  acc.accountType === 'LIVE' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-neutral-800 text-neutral-400'
                                }`}>
                                  {acc.accountType}
                                </span>
                              </div>
                              <span className="text-[10px] text-neutral-400">{acc.brokerName} • Balance: ${((acc.balance ?? 0) > 2000 ? ((acc.balance ?? 0) / 100.0) : (acc.balance ?? 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleFinalizeConnection(acc.accountId);
                            }}
                            disabled={isConnectingAuthorizedAccount}
                            className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-[11px] flex items-center gap-1 cursor-pointer transition-colors shadow-sm"
                          >
                            {isConnectingAuthorizedAccount && isSelected ? (
                              <RefreshCw className="w-3 h-3 animate-spin" />
                            ) : (
                              <>
                                <span>Pilih & Hubungkan</span>
                                <ArrowRight className="w-3 h-3" />
                              </>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* SCENARIO 2: USER IS ALREADY CONNECTED (SWITCH ACCOUNT POPUP) */}
          {/* ========================================================================= */}
          {isConnected && (
            <div className="space-y-4">
              
              {/* Active Connection Summary */}
              <div className="bg-[#0f1f17] border border-emerald-500/40 rounded-2xl p-4 space-y-3 relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-xs font-black text-white uppercase tracking-wider">Akun cTrader Aktif</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold border border-emerald-500/30">
                    ONLINE (WS:5036)
                  </span>
                </div>

                <div className="bg-[#0a140f] p-3 rounded-xl border border-emerald-500/20 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-white font-mono font-black text-sm block">
                      {currentUser.cTraderAccountId || 'Akun Tidak Ditemukan'}
                    </span>
                    <span className="text-emerald-300/80 text-[11px]">
                      FP Markets cTrader • Auto-Sync Feed Aktif
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-neutral-400 block">Total Akun Terhubung:</span>
                    <span className="text-amber-400 font-mono font-bold text-xs">{currentAccounts.length} Akun</span>
                  </div>
                </div>

                {/* Token OAuth & Auto-Refresh Status */}
                <div className="bg-[#0d1712] p-3 rounded-xl border border-emerald-500/20 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-emerald-300 font-bold">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span>cTrader OAuth & Auto-Refresh</span>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      {tokenStatus?.hasRefreshToken ? 'AUTO-REFRESH AKTIF' : 'TOKEN TERSIMPAN'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-neutral-400">
                    <span>
                      Penyimpanan: <strong className="text-neutral-200">Database MongoDB (Per User)</strong>
                    </span>
                    <button
                      type="button"
                      disabled={isRefreshingToken}
                      onClick={handleManualRefreshToken}
                      className="px-2 py-1 rounded bg-[#1c2c22] hover:bg-[#253b2d] text-emerald-300 text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors border border-emerald-500/30"
                    >
                      <RefreshCw className={`w-3 h-3 ${isRefreshingToken ? 'animate-spin' : ''}`} />
                      <span>{isRefreshingToken ? 'Memperbarui...' : 'Refresh Token'}</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={isSyncingTrades}
                    onClick={handleSyncAccountTrades}
                    className="w-full py-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all mt-2"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncingTrades ? 'animate-spin' : ''}`} />
                    <span>{isSyncingTrades ? 'Menyingkronkan Posisi Live & Win Rate...' : '⚡ Sinkronkan Posisi (OP) & History Trade'}</span>
                  </button>
                </div>
              </div>

              {/* Switch Account List (Stored Accounts) */}
              <div className="bg-[#121212] rounded-2xl p-4 border border-[#222222] space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-amber-400" />
                    <span>Daftar Akun cTrader Tersimpan ({currentAccounts.length})</span>
                  </h4>
                  <button
                    type="button"
                    onClick={() => setIsAddingCustomAccount(!isAddingCustomAccount)}
                    className="text-[11px] font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Tambah Akun</span>
                  </button>
                </div>

                <p className="text-[11px] text-neutral-400">
                  Klik akun di bawah untuk langsung beralih (switch) tanpa perlu login ulang:
                </p>

                {/* Account Cards */}
                <div className="space-y-2">
                  {currentAccounts.map((acc) => {
                    const isCurrentActive = acc.accountId === currentUser.cTraderAccountId;
                    return (
                      <div
                        key={acc.accountId}
                        onClick={() => !isCurrentActive && handleSwitchToAccount(acc)}
                        className={`p-3 rounded-xl border transition-all flex items-center justify-between ${
                          isCurrentActive
                            ? 'bg-emerald-500/15 border-emerald-500 text-white'
                            : 'bg-[#181818] border-[#262626] hover:border-amber-500/40 text-neutral-300 cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-mono font-bold text-xs ${
                            isCurrentActive ? 'bg-emerald-500 text-black' : 'bg-[#222222] text-neutral-400'
                          }`}>
                            {isCurrentActive ? <Check className="w-4 h-4 stroke-[3]" /> : <Radio className="w-3.5 h-3.5" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-xs text-white">{acc.accountId}</span>
                              <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase ${
                                acc.accountType === 'LIVE' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-neutral-800 text-neutral-400'
                              }`}>
                                {acc.accountType}
                              </span>
                            </div>
                            <span className="text-[10px] text-neutral-400">
                              {acc.brokerName} • ${((acc.balance ?? 0) > 2000 ? ((acc.balance ?? 0) / 100.0) : (acc.balance ?? 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} • 1:{acc.leverage || 500}
                            </span>
                          </div>
                        </div>

                        {isCurrentActive ? (
                          <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/30">
                            Aktif Sekarang
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={isSwitchingAccount}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSwitchToAccount(acc);
                            }}
                            className="px-3 py-1 rounded-lg bg-[#242424] hover:bg-amber-500 hover:text-black text-neutral-200 text-[10px] font-bold transition-colors cursor-pointer"
                          >
                            {isSwitchingAccount && selectedAccountId === acc.accountId ? (
                              <RefreshCw className="w-3 h-3 animate-spin" />
                            ) : (
                              'Switch'
                            )}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Form Add New Account */}
                {isAddingCustomAccount && (
                  <div className="bg-[#181818] p-3.5 rounded-2xl border border-amber-500/30 space-y-2.5 animate-in fade-in duration-150">
                    <span className="text-xs font-bold text-white block">Tambah Akun cTrader Baru:</span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setNewAccountType('LIVE')}
                        className={`py-1.5 text-[11px] font-bold rounded-lg border cursor-pointer ${
                          newAccountType === 'LIVE' ? 'bg-emerald-500 text-black border-emerald-400' : 'bg-[#222222] text-neutral-400 border-[#2f2f2f]'
                        }`}
                      >
                        Live (Real)
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewAccountType('DEMO')}
                        className={`py-1.5 text-[11px] font-bold rounded-lg border cursor-pointer ${
                          newAccountType === 'DEMO' ? 'bg-amber-500 text-black border-amber-400' : 'bg-[#222222] text-neutral-400 border-[#2f2f2f]'
                        }`}
                      >
                        Demo (Uji Coba)
                      </button>
                    </div>

                    <input
                      type="text"
                      value={newAccountIdInput}
                      onChange={(e) => setNewAccountIdInput(e.target.value)}
                      placeholder="Nomor Akun cTrader (contoh: 8942109)"
                      className="w-full bg-[#121212] border border-[#2f2f2f] rounded-xl px-3 py-2 text-xs text-white placeholder:text-neutral-600 focus:outline-none focus:border-amber-400 font-mono"
                    />

                    <button
                      type="button"
                      onClick={handleAddNewAccount}
                      disabled={isSwitchingAccount}
                      className="w-full py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {isSwitchingAccount ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Menyimpan Akun...</span>
                        </>
                      ) : (
                        <span>Simpan & Beralih ke Akun Ini</span>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* Disconnect action */}
              <div className="space-y-2">
                {!isConfirmingDisconnect ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIsConfirmingDisconnect(true);
                      triggerHaptic('warning');
                    }}
                    className="w-full py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <Unlink className="w-4 h-4" />
                    <span>Putuskan Koneksi cTrader</span>
                  </button>
                ) : (
                  <div className="bg-rose-950/30 border border-rose-500/40 p-3.5 rounded-2xl space-y-2.5 animate-in fade-in duration-150">
                    <div className="flex items-center gap-2 text-rose-300 text-xs font-bold">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                      <span>Yakin ingin memutuskan koneksi cTrader?</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setIsConfirmingDisconnect(false)}
                        className="py-2 rounded-xl bg-[#1c1c1c] text-neutral-300 text-xs font-bold hover:bg-[#262626] cursor-pointer"
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        onClick={handleDisconnect}
                        disabled={isDisconnecting}
                        className="py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-rose-600/30"
                      >
                        {isDisconnecting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <span>Ya, Putuskan</span>}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-[#1c1c1c] bg-[#111111] flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-[#1c1c1c] hover:bg-[#242424] text-neutral-300 font-bold text-xs transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
