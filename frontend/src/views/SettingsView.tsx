import React, { useState } from 'react';
import { 
  Settings as SettingsIcon, 
  User, 
  Activity, 
  Bell, 
  ShieldCheck, 
  Zap, 
  Lock, 
  Smartphone, 
  CheckCircle2, 
  ChevronRight,
  ExternalLink,
  Save,
  LogOut,
  Unlink,
  Radio,
  Camera,
  Crown,
  Info,
  DollarSign,
  Users,
  RefreshCw,
  Sparkles,
  Layers
} from 'lucide-react';
import { User as UserType } from '../types';
import { STRATEGY_LIST } from '../data/strategies';
import { CTraderGatewayModal } from '../components/CTraderGatewayModal';
import { EditAvatarModal } from '../components/EditAvatarModal';
import { triggerHaptic } from '../utils/haptics';

interface SettingsViewProps {
  currentUser: UserType | null;
  onUpdateUser: (updatedUser: UserType) => void;
  onOpenEnergy: () => void;
  onOpenReferral: () => void;
  onOpenSubscription?: () => void;
  onOpenKycModal?: () => void;
  onOpenWithdrawalModal?: () => void;
  onOpenAdmin?: () => void;
  onLogout: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  currentUser,
  onUpdateUser,
  onOpenEnergy,
  onOpenReferral,
  onOpenSubscription,
  onOpenKycModal,
  onOpenWithdrawalModal,
  onOpenAdmin,
  onLogout
}) => {
  if (!currentUser) return null;

  const isPremium = Boolean(currentUser.subscriptionTier && currentUser.subscriptionTier !== 'free');

  const [displayName, setDisplayName] = useState(currentUser.displayName);
  const [bio, setBio] = useState(currentUser.bio || '');
  const [primaryStrategyId, setPrimaryStrategyId] = useState(currentUser.primaryStrategyId || currentUser.strategyDNA);
  const [defaultUnlockPrice, setDefaultUnlockPrice] = useState<number>(currentUser.defaultUnlockPrice || 1);
  const [defaultFollowPrice, setDefaultFollowPrice] = useState<number>(currentUser.defaultFollowPrice || 1);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isGatewayModalOpen, setIsGatewayModalOpen] = useState(false);
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [isTransferringCommission, setIsTransferringCommission] = useState(false);
  const [transferFeedback, setTransferFeedback] = useState<string | null>(null);

  const affiliateEarnings = currentUser.affiliateEarningsEnergy || 0;
  const tradeEarnings = currentUser.tradeEarningsEnergy || 0;
  const totalCommission = affiliateEarnings + tradeEarnings;

  const handleSaveProfile = async () => {
    setIsSaving(true);
    setSavedSuccess(false);
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'x-session-user-id': currentUser.id
        },
        body: JSON.stringify({
          displayName,
          bio,
          primaryStrategyId,
          defaultUnlockPrice: isPremium ? defaultUnlockPrice : 1,
          defaultFollowPrice: isPremium ? defaultFollowPrice : 1
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan profil');
      onUpdateUser(data.user);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTransferCommissionToEnergy = async () => {
    if (totalCommission <= 0) return;
    setIsTransferringCommission(true);
    setTransferFeedback(null);
    try {
      const res = await fetch('/api/commission/transfer-to-energy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-user-id': currentUser.id
        },
        body: JSON.stringify({ amountEnergy: totalCommission })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Gagal transfer komisi');
      }
      triggerHaptic('success');
      onUpdateUser(data.user);
      setTransferFeedback(`+${totalCommission} ⚡ berhasil dipindahkan ke Saldo Energy!`);
      setTimeout(() => setTransferFeedback(null), 4000);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsTransferringCommission(false);
    }
  };

  const getTierDetails = (tier?: string) => {
    switch (tier) {
      case 'premium_yearly':
        return { name: 'VIP Tahunan (12 Bulan)', gen: 5, comm: 50 };
      case 'premium_6m':
        return { name: 'VIP 6 Bulan', gen: 4, comm: 40 };
      case 'premium_3m':
        return { name: 'VIP 3 Bulan', gen: 3, comm: 30 };
      case 'premium_monthly':
        return { name: 'VIP Bulanan (1 Bulan)', gen: 2, comm: 20 };
      default:
        return { name: 'Free Tier', gen: 1, comm: 10 };
    }
  };

  const tierDetails = getTierDetails(currentUser.subscriptionTier);

  return (
    <div className="w-full max-w-md mx-auto pb-28 px-3 sm:px-0 space-y-4">
      
      {/* Header */}
      <div className="pt-2 pb-2">
        <h2 className="text-xl font-black text-white font-display">Pengaturan Akun</h2>
        <p className="text-xs text-neutral-400">Profil Trader, Biaya Monetisasi Setup (1-10 Energy), dan Broker</p>
      </div>

      {/* Profile Avatar Quick Row */}
      <div className="bg-[#111111] rounded-2xl p-4 border border-[#1f1f1f] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative group">
            <img 
              src={currentUser.avatar} 
              alt={currentUser.username} 
              referrerPolicy="no-referrer"
              className="w-12 h-12 rounded-full object-cover border border-emerald-500/40"
            />
            <button
              onClick={() => setIsAvatarModalOpen(true)}
              className="absolute -bottom-1 -right-1 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center text-black hover:scale-110 transition-transform cursor-pointer"
              title="Ganti Foto"
            >
              <Camera className="w-2.5 h-2.5 stroke-[2.5]" />
            </button>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="font-bold text-white text-sm">{currentUser.displayName}</h3>
              {isPremium && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-0.5">
                  <Crown className="w-2.5 h-2.5 fill-amber-400" /> PRO
                </span>
              )}
            </div>
            <span className="text-xs text-neutral-400 font-mono">@{currentUser.username}</span>
          </div>
        </div>

        <button
          onClick={() => setIsAvatarModalOpen(true)}
          className="px-3 py-1.5 rounded-xl bg-[#1a1a1a] hover:bg-[#242424] text-neutral-300 text-xs font-semibold border border-[#2a2a2a] transition-colors cursor-pointer"
        >
          Ubah Foto
        </button>
      </div>

      {/* VIP Status & Multi-Generation Commission Hub */}
      <div className="bg-gradient-to-br from-[#181308] via-[#100e07] to-[#0a0a0a] rounded-2xl p-4 border border-amber-500/30 space-y-3 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Crown className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">Status VIP Member</h3>
                <span className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase ${
                  isPremium ? 'bg-amber-500 text-black' : 'bg-neutral-800 text-neutral-400'
                }`}>
                  {isPremium ? 'ACTIVE PRO' : 'FREE'}
                </span>
              </div>
              <span className="text-[11px] text-amber-300/90 font-medium">
                {tierDetails.name} • Payout Gen 1-{tierDetails.gen} ({tierDetails.comm}%)
              </span>
            </div>
          </div>

          {onOpenSubscription && (
            <button
              type="button"
              onClick={onOpenSubscription}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-black font-extrabold text-xs shadow-md shadow-amber-500/20 transition-all cursor-pointer"
            >
              {isPremium ? 'Perpanjang' : 'Upgrade VIP'}
            </button>
          )}
        </div>

        {/* Commission Transfer to Energy Section */}
        <div className="bg-[#121008] border border-amber-500/20 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] text-neutral-400 block font-sans">Komisi Afiliasi & Trading:</span>
              <span className="text-sm font-mono font-black text-emerald-400">
                +{totalCommission} ⚡
                <span className="text-[10px] text-neutral-400 font-sans font-normal ml-1">
                  (Rp {(totalCommission * 1000).toLocaleString('id-ID')})
                </span>
              </span>
            </div>

            {totalCommission > 0 ? (
              <button
                type="button"
                disabled={isTransferringCommission}
                onClick={handleTransferCommissionToEnergy}
                className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-bold text-[11px] flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isTransferringCommission ? 'animate-spin' : ''}`} />
                <span>{isTransferringCommission ? 'Memindahkan...' : 'Pindah ke Saldo Energy'}</span>
              </button>
            ) : (
              <span className="text-[10px] text-neutral-300 italic">Belum ada komisi</span>
            )}
          </div>

          {transferFeedback && (
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] font-medium flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>{transferFeedback}</span>
            </div>
          )}

          <p className="text-[10px] text-neutral-300">
            💡 Komisi berupa Energy dapat dipindahkan ke Saldo Energy untuk unlock setup, follow signal, tanya AI, atau upgrade VIP pass.
          </p>
        </div>
      </div>

      {/* Trader Monetization & Default Fee Settings (1 - 10 Energy) */}
      <div className="bg-[#111111] rounded-2xl p-4 border border-[#1f1f1f] space-y-3.5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
            <Zap className="w-4 h-4 text-amber-400 fill-amber-400" />
            <span>Monetisasi Setup Trading (1 - 10 Energy)</span>
          </h3>
          <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">
            Bagi Hasil 80%
          </span>
        </div>

        <p className="text-[11px] text-neutral-400 leading-relaxed">
          Tentukan tarif standar energi untuk setup yang Anda bagikan. Anda menerima <strong>80%</strong> dari setiap energi yang dibayarkan follower, dan 20% dialokasikan ke platform fee.
        </p>

        {/* Total Earnings Card */}
        <div className="bg-[#161616] p-3 rounded-xl border border-[#222222] flex items-center justify-between">
          <div>
            <span className="text-[10px] text-neutral-400 block font-sans">Total Pendapatan Setup Anda</span>
            <span className="text-base font-black font-mono text-emerald-400 flex items-center gap-1 mt-0.5">
              <Zap className="w-4 h-4 fill-emerald-400" /> {currentUser.tradeEarningsEnergy || 0} Energy
            </span>
          </div>
          <div className="text-right text-[10px] text-neutral-400">
            <span>Alokasi Trader:</span>
            <span className="block font-bold text-neutral-200">80% Net Share</span>
          </div>
        </div>

        {/* Default Unlock Fee */}
        <div className="space-y-1.5 pt-1">
          <div className="flex justify-between items-center">
            <label className="text-[11px] font-semibold text-neutral-300">Default Biaya Unlock Setup</label>
            <span className="text-xs font-bold font-mono text-amber-400">{defaultUnlockPrice} Energy</span>
          </div>
          {isPremium ? (
            <div className="space-y-1.5">
              <input
                type="range"
                min="1"
                max="10"
                step="1"
                value={defaultUnlockPrice}
                onChange={(e) => setDefaultUnlockPrice(parseInt(e.target.value, 10))}
                className="w-full accent-amber-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-neutral-400 font-mono">
                <span>1 Energy (Min)</span>
                <span className="text-emerald-400 font-bold">Penghasilan: +{(defaultUnlockPrice * 0.8).toFixed(1)} Energy</span>
                <span>10 Energy (Max)</span>
              </div>
            </div>
          ) : (
            <div className="p-2.5 bg-amber-500/5 border border-amber-500/20 rounded-xl flex items-center justify-between text-[11px]">
              <span className="text-neutral-300">Akun Free: Standar <strong>1 Energy</strong></span>
              {onOpenSubscription && (
                <button
                  type="button"
                  onClick={onOpenSubscription}
                  className="px-2.5 py-1 rounded bg-amber-500 text-black font-bold text-[10px] flex items-center gap-1 cursor-pointer"
                >
                  <Crown className="w-2.5 h-2.5 fill-black" /> Upgrade PRO
                </button>
              )}
            </div>
          )}
        </div>

        {/* Default Follow Fee */}
        <div className="space-y-1.5 pt-1">
          <div className="flex justify-between items-center">
            <label className="text-[11px] font-semibold text-neutral-300">Default Biaya Ikuti Setup (Copy)</label>
            <span className="text-xs font-bold font-mono text-emerald-400">{defaultFollowPrice} Energy</span>
          </div>
          {isPremium ? (
            <div className="space-y-1.5">
              <input
                type="range"
                min="1"
                max="10"
                step="1"
                value={defaultFollowPrice}
                onChange={(e) => setDefaultFollowPrice(parseInt(e.target.value, 10))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-neutral-400 font-mono">
                <span>1 Energy (Min)</span>
                <span className="text-emerald-400 font-bold">Penghasilan: +{(defaultFollowPrice * 0.8).toFixed(1)} Energy</span>
                <span>10 Energy (Max)</span>
              </div>
            </div>
          ) : (
            <div className="p-2.5 bg-emerald-500/5 border border-emerald-500/20 rounded-xl flex items-center justify-between text-[11px]">
              <span className="text-neutral-300">Akun Free: Standar <strong>1 Energy</strong></span>
              {onOpenSubscription && (
                <button
                  type="button"
                  onClick={onOpenSubscription}
                  className="px-2.5 py-1 rounded bg-emerald-500 text-black font-bold text-[10px] flex items-center gap-1 cursor-pointer"
                >
                  <Crown className="w-2.5 h-2.5 fill-black" /> Upgrade PRO
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Profile Form */}
      <div className="bg-[#111111] rounded-2xl p-4 border border-[#1f1f1f] space-y-3.5">
        <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
          <User className="w-4 h-4 text-amber-400" />
          <span>Profil Trader</span>
        </h3>

        {/* Display Name */}
        <div>
          <label className="block text-[11px] font-semibold text-neutral-400 mb-1">Nama Tampilan</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full bg-[#161616] border border-[#222222] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
          />
        </div>

        {/* Strategy DNA Preference */}
        <div>
          <label className="block text-[11px] font-semibold text-neutral-400 mb-1">Trader DNA Identity</label>
          <select
            value={primaryStrategyId}
            onChange={(e) => setPrimaryStrategyId(e.target.value)}
            className="w-full bg-[#161616] border border-[#222222] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
          >
            {STRATEGY_LIST.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} - {s.tagline}
              </option>
            ))}
          </select>
        </div>

        {/* Bio */}
        <div>
          <label className="block text-[11px] font-semibold text-neutral-400 mb-1">Bio / Trading Philosophy</label>
          <textarea
            rows={3}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className="w-full bg-[#161616] border border-[#222222] rounded-xl p-3 text-xs text-white focus:outline-none focus:border-amber-500 leading-relaxed"
            placeholder="Tulis ringkasan profil trading Anda..."
          />
        </div>

        <button
          onClick={handleSaveProfile}
          disabled={isSaving}
          className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer disabled:opacity-50"
        >
          {isSaving ? (
            <span>Menyimpan...</span>
          ) : savedSuccess ? (
            <>
              <CheckCircle2 className="w-4 h-4" />
              <span>Profil & Biaya Setup Berhasil Disimpan!</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              <span>Simpan Perubahan</span>
            </>
          )}
        </button>
      </div>

      {/* cTrader Connection Status */}
      <div className="bg-[#111111] rounded-2xl p-4 border border-[#1f1f1f] space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-emerald-400" />
            <span>Koneksi Broker cTrader</span>
          </h3>
          <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold uppercase ${
            currentUser.cTraderConnected
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
          }`}>
            {currentUser.cTraderConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>

        <div className="bg-[#161616] p-3 rounded-xl border border-[#222222] flex items-center justify-between text-xs">
          <div className="space-y-0.5">
            <span className="font-bold text-white block">Spotware cTrader Open API</span>
            {currentUser.cTraderConnected ? (
              <span className="text-[10px] text-emerald-400 font-mono block">
                Akun: {currentUser.cTraderAccountId || 'cTrader-894210'} (WS:5036)
              </span>
            ) : (
              <span className="text-[10px] text-amber-400/90 font-mono block">
                Status: Belum Terhubung
              </span>
            )}
          </div>
          <button
            onClick={() => setIsGatewayModalOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30 font-bold text-xs hover:bg-amber-500/25 transition-colors cursor-pointer"
          >
            Kelola Gateway
          </button>
        </div>
      </div>

      {/* Admin Console Entry (Only if user is Admin or has onOpenAdmin) */}
      {String(currentUser.role || '').toLowerCase() === 'admin' && onOpenAdmin && (
        <div className="bg-gradient-to-r from-amber-500/15 via-emerald-500/10 to-amber-500/15 rounded-2xl p-4 border border-amber-500/40 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-amber-400" />
              <div>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Panel Administrator Scrolic
                </h3>
                <span className="text-[10px] text-neutral-300">
                  Kelola Pengguna, Diskon Topup, Paket VIP, dan Pencairan Komisi
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenAdmin}
              className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs flex items-center gap-1 cursor-pointer shadow-md shadow-amber-500/20"
            >
              <span>Buka Admin</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Wallet, KYC & Withdrawal Quick Links */}
      <div className="bg-[#111111] rounded-2xl p-4 border border-[#1f1f1f] space-y-2">
        {/* KYC Verification Card */}
        <div 
          onClick={onOpenKycModal}
          className="flex items-center justify-between p-2.5 rounded-xl hover:bg-[#161616] transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <ShieldCheck className={`w-4 h-4 ${currentUser.kycStatus === 'verified' ? 'text-emerald-400' : 'text-amber-400'}`} />
            <div>
              <span className="text-xs font-bold text-white block">Verifikasi KYC (KTP) AI</span>
              <span className="text-[10px] text-neutral-400 block">
                {currentUser.kycStatus === 'verified'
                  ? `Terverifikasi: ${currentUser.kycFullName}`
                  : 'Syarat wajib penarikan komisi (Gemini OCR)'}
              </span>
            </div>
          </div>
          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
            currentUser.kycStatus === 'verified'
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
          }`}>
            {currentUser.kycStatus === 'verified' ? 'TERVERIFIKASI' : 'VERIFIKASI'}
          </span>
        </div>

        {/* Withdrawal Row */}
        <div 
          onClick={onOpenWithdrawalModal}
          className="flex items-center justify-between p-2.5 rounded-xl hover:bg-[#161616] transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <div>
              <span className="text-xs font-bold text-white block">Penarikan Komisi (Withdrawal)</span>
              <span className="text-[10px] text-neutral-400 block">
                Transfer instan ke Rekening Bank / E-Wallet via BI-FAST
              </span>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-neutral-500" />
        </div>

        {/* Energy Balance */}
        <div 
          onClick={onOpenEnergy}
          className="flex items-center justify-between p-2.5 rounded-xl hover:bg-[#161616] transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <Zap className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold text-white">Dompet Saldo Energy & Top-Up</span>
          </div>
          <ChevronRight className="w-4 h-4 text-neutral-500" />
        </div>

        {/* Referral 5-Generations */}
        <div 
          onClick={onOpenReferral}
          className="flex items-center justify-between p-2.5 rounded-xl hover:bg-[#161616] transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <Users className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold text-white">Program Afiliasi 5 Generasi (Komisi 10%)</span>
          </div>
          <ChevronRight className="w-4 h-4 text-neutral-500" />
        </div>
      </div>

      {/* Logout Action */}
      <div className="pt-2">
        <button
          onClick={onLogout}
          className="w-full py-3 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          <span>Keluar dari Akun (Logout)</span>
        </button>
      </div>

      {/* Modals inside SettingsView */}
      {isGatewayModalOpen && (
        <CTraderGatewayModal
          currentUser={currentUser}
          onClose={() => setIsGatewayModalOpen(false)}
          onUpdateUser={(updated) => {
            onUpdateUser(updated);
          }}
        />
      )}

      {isAvatarModalOpen && (
        <EditAvatarModal
          currentUser={currentUser}
          onClose={() => setIsAvatarModalOpen(false)}
          onUpdateUser={(updated) => {
            onUpdateUser(updated);
            setIsAvatarModalOpen(false);
          }}
        />
      )}
    </div>
  );
};
