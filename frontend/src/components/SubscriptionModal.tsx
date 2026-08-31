import React, { useState, useEffect } from 'react';
import { 
  X, 
  Crown, 
  Zap, 
  CheckCircle2, 
  Sparkles, 
  ShieldCheck, 
  ArrowRight, 
  TrendingUp, 
  Coins, 
  Layers, 
  RefreshCw,
  Clock
} from 'lucide-react';
import { User, PremiumPackageConfig } from '../types';
import { triggerHaptic } from '../utils/haptics';
import confetti from 'canvas-confetti';

interface SubscriptionModalProps {
  currentUser: User;
  onClose: () => void;
  onSuccess: (updatedUser: User) => void;
  onOpenEnergyModal?: () => void;
}

export const SubscriptionModal: React.FC<SubscriptionModalProps> = ({
  currentUser,
  onClose,
  onSuccess,
  onOpenEnergyModal
}) => {
  const [packages, setPackages] = useState<PremiumPackageConfig[]>([]);
  const [selectedTier, setSelectedTier] = useState<string>('premium_monthly');
  const [isLoading, setIsLoading] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferSuccessMsg, setTransferSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const energyBalance = currentUser.energyBalance ?? (currentUser as any).energy ?? 0;
  const affiliateEarnings = currentUser.affiliateEarningsEnergy ?? 0;
  const tradeEarnings = currentUser.tradeEarningsEnergy ?? 0;
  const totalCommission = affiliateEarnings + tradeEarnings;

  useEffect(() => {
    fetch('/api/config/premium-packages')
      .then((res) => res.json())
      .then((data) => {
        if (data.packages && Array.isArray(data.packages)) {
          setPackages(data.packages.filter((p: any) => p.isActive !== false));
        }
      })
      .catch((err) => console.error('Failed to load VIP packages', err));
  }, []);

  const selectedPkg = packages.find((p) => p.tier === selectedTier) || packages[0];

  const handleSubscribe = async () => {
    if (!selectedPkg) return;
    if (energyBalance < (selectedPkg.priceEnergy || 99)) {
      setErrorMsg(`Saldo Energy tidak mencukupi (${energyBalance} ⚡). Anda memerlukan ${selectedPkg.priceEnergy || 99} ⚡.`);
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/premium/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-user-id': currentUser.id
        },
        body: JSON.stringify({ tier: selectedPkg.tier })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Gagal berlangganan paket VIP');
      }

      triggerHaptic('success');
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 }
      });

      onSuccess(data.user);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTransferCommission = async () => {
    if (totalCommission <= 0) return;
    setIsTransferring(true);
    setTransferSuccessMsg(null);
    setErrorMsg(null);
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
        throw new Error(data.error || 'Gagal memindahkan komisi ke saldo Energy');
      }

      triggerHaptic('success');
      onSuccess(data.user);
      setTransferSuccessMsg(`Berhasil memindahkan +${totalCommission} ⚡ komisi ke Saldo Energy aktif!`);
      setTimeout(() => setTransferSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsTransferring(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
      <div 
        id="subscription-vip-modal"
        className="w-full max-w-lg bg-[#0d0f12] border border-amber-500/30 rounded-t-3xl sm:rounded-3xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl relative"
      >
        {/* Header */}
        <div className="p-4 border-b border-amber-500/20 flex items-center justify-between bg-gradient-to-r from-[#181205] via-[#100d07] to-[#181205]">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
              <Crown className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="font-black text-white text-sm">Upgrade Scrolic VIP Pass</h3>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-500 text-black uppercase">PRO</span>
              </div>
              <p className="text-[11px] text-amber-300/80">Bayar dengan Energy • 1 Energy = Rp 1.000</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#1c1c1c] border border-neutral-800 hover:bg-[#252525] flex items-center justify-center text-neutral-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs flex-1 no-scrollbar">
          
          {/* Energy & Commission Balance Card with 1-Click Transfer */}
          <div className="p-3.5 rounded-2xl bg-[#141414] border border-neutral-800 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] text-neutral-400 block uppercase font-bold tracking-wider">Saldo Energy Aktif</span>
                <span className="text-xl font-black text-white font-mono flex items-center gap-1 mt-0.5">
                  <Zap className="w-4 h-4 text-amber-400 fill-amber-400" />
                  {energyBalance.toLocaleString('id-ID')} ⚡
                </span>
              </div>

              <div className="text-right">
                <span className="text-[10px] text-neutral-400 block uppercase font-bold tracking-wider">Komisi Belum Ditransfer</span>
                <span className="text-sm font-bold text-emerald-400 font-mono">
                  +{totalCommission.toLocaleString('id-ID')} ⚡
                </span>
              </div>
            </div>

            {totalCommission > 0 && (
              <div className="pt-2 border-t border-neutral-800/80 flex items-center justify-between gap-2">
                <span className="text-[10px] text-neutral-300">
                  Pindahkan komisi untuk unlock setup, ikuti setup, atau bayar VIP:
                </span>
                <button
                  type="button"
                  disabled={isTransferring}
                  onClick={handleTransferCommission}
                  className="px-2.5 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 font-bold text-[11px] flex items-center gap-1 shrink-0 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${isTransferring ? 'animate-spin' : ''}`} />
                  <span>{isTransferring ? 'Memindahkan...' : 'Pindah ke Saldo ⚡'}</span>
                </button>
              </div>
            )}

            {transferSuccessMsg && (
              <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] font-medium flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>{transferSuccessMsg}</span>
              </div>
            )}
          </div>

          {/* Tier Selection Grid */}
          <div className="space-y-2">
            <span className="text-[11px] font-bold text-neutral-300 uppercase tracking-wider block">
              Pilih Periode Langganan VIP:
            </span>

            <div className="grid grid-cols-2 gap-2.5">
              {packages.map((pkg) => {
                const isSelected = selectedTier === pkg.tier;
                const priceE = pkg.priceEnergy || Math.round(pkg.discountPriceRp / 1000) || 99;
                const baseE = pkg.basePriceEnergy || Math.round((pkg.basePriceRp || (priceE * 1000)) / 1000);
                const maxGen = pkg.maxGenerations || (pkg.tier === 'premium_yearly' ? 5 : pkg.tier === 'premium_6m' ? 4 : pkg.tier === 'premium_3m' ? 3 : 2);
                const commPct = pkg.totalCommissionPercent || (maxGen * 10);

                return (
                  <button
                    key={pkg.id}
                    type="button"
                    onClick={() => {
                      triggerHaptic('selection');
                      setSelectedTier(pkg.tier);
                    }}
                    className={`p-3 rounded-2xl border text-left transition-all relative overflow-hidden flex flex-col justify-between cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500/10 border-amber-500 shadow-lg shadow-amber-500/10'
                        : 'bg-[#121212] border-[#222222] hover:border-neutral-700'
                    }`}
                  >
                    {pkg.isPopular && (
                      <span className="absolute top-0 right-0 bg-amber-500 text-black text-[8px] font-black px-2 py-0.5 rounded-bl-lg uppercase">
                        POPULER
                      </span>
                    )}

                    <div>
                      <div className="flex items-center gap-1">
                        <Crown className={`w-3.5 h-3.5 ${isSelected ? 'text-amber-400' : 'text-neutral-400'}`} />
                        <span className="font-bold text-xs text-white">{pkg.name}</span>
                      </div>
                      <span className="text-[10px] text-neutral-400 font-mono block mt-0.5">
                        {pkg.durationMonths} Bulan {pkg.energyBonus > 0 ? `• +${pkg.energyBonus}⚡ Bonus` : ''}
                      </span>
                    </div>

                    <div className="mt-3 pt-2 border-t border-neutral-800/80 flex justify-between items-end">
                      <div>
                        <span className="text-base font-black text-amber-400 font-mono block">
                          {priceE} ⚡
                        </span>
                        <span className="text-[9px] text-neutral-400 font-mono">
                          Rp {(priceE * 1000).toLocaleString('id-ID')}
                        </span>
                      </div>
                      <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                        Gen 1-{maxGen} ({commPct}%)
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected VIP Package Benefits Card */}
          {selectedPkg && (
            <div className="p-4 rounded-2xl bg-gradient-to-b from-[#141208] to-[#0d0d0d] border border-amber-500/30 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-amber-500/20">
                <span className="font-bold text-amber-300 text-xs flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Keuntungan Akses {selectedPkg.name}</span>
                </span>
                <span className="text-[11px] font-black text-white font-mono">
                  {selectedPkg.priceEnergy || 99} Energy ⚡
                </span>
              </div>

              {/* Special Rule Callouts: Unlock & Follow price freedom + Multi-generation */}
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="p-2.5 rounded-xl bg-[#18150a] border border-amber-500/20 space-y-0.5">
                  <span className="text-neutral-400 block">Monetisasi Setup:</span>
                  <span className="font-bold text-white block">Atur Biaya Bebas (1 - 10 ⚡)</span>
                  <span className="text-[9px] text-amber-400/90">User free terkunci di 1 ⚡</span>
                </div>

                <div className="p-2.5 rounded-xl bg-[#0b1a10] border border-emerald-500/20 space-y-0.5">
                  <span className="text-neutral-400 block">Payout Afiliasi:</span>
                  <span className="font-bold text-emerald-400 block">
                    Buka Generasi ke-{selectedPkg.maxGenerations || 2}
                  </span>
                  <span className="text-[9px] text-emerald-300/80">Total {selectedPkg.totalCommissionPercent || 20}% Komisi</span>
                </div>
              </div>

              {/* Feature Points */}
              <div className="space-y-1.5 pt-1 text-[11px] text-neutral-200">
                {(selectedPkg.features || (selectedPkg as any).benefits || []).map((feat: string, idx: number) => (
                  <div key={idx} className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>{feat}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex flex-col gap-2">
              <span>{errorMsg}</span>
              {onOpenEnergyModal && energyBalance < (selectedPkg?.priceEnergy || 99) && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenEnergyModal();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 text-black font-bold text-xs flex items-center justify-center gap-1 self-start cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5 fill-black" />
                  <span>Top Up Energy Sekarang</span>
                </button>
              )}
            </div>
          )}

          {/* Subscribe CTA Button */}
          <button
            type="button"
            disabled={isLoading || !selectedPkg}
            onClick={handleSubscribe}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-black font-black text-sm flex items-center justify-center gap-2 shadow-xl shadow-amber-500/20 transition-all cursor-pointer disabled:opacity-50"
          >
            {isLoading ? (
              <span>Mengaktifkan VIP Pass...</span>
            ) : (
              <>
                <Crown className="w-4 h-4 fill-black" />
                <span>Upgrade VIP Sekarang ({selectedPkg?.priceEnergy || 99} ⚡)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
