import React, { useState, useEffect } from 'react';
import { X, Users, Copy, Check, Gift, Layers, ShieldCheck, ArrowRight, Zap, ExternalLink, Share2, Sparkles } from 'lucide-react';
import { User, ReferralCommission } from '../types';
import { ScrolicLogo } from './ScrolicLogo';

interface ReferralModalProps {
  currentUser: User;
  onClose: () => void;
  onOpenPromotionPage?: (username: string) => void;
  onOpenWithdrawalModal?: () => void;
  onOpenKycModal?: () => void;
}

export const ReferralModal: React.FC<ReferralModalProps> = ({
  currentUser,
  onClose,
  onOpenPromotionPage,
  onOpenWithdrawalModal,
  onOpenKycModal
}) => {
  const [networkData, setNetworkData] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/api/referrals/network', {
      headers: currentUser?.id ? { 'x-session-user-id': currentUser.id } : {}
    })
      .then((res) => res.json())
      .then((data) => setNetworkData(data))
      .catch((err) => console.error(err));
  }, [currentUser?.id]);

  const sponsoredCount = currentUser?.referralsCount ?? networkData?.sponsoredUsersCount ?? networkData?.generations?.gen1?.count ?? 0;
  const gen1Count = sponsoredCount;
  const gen2Count = networkData?.generations?.gen2?.count ?? (sponsoredCount > 0 ? Math.round(sponsoredCount * 2.5) : 0);
  const gen3Count = networkData?.generations?.gen3?.count ?? (sponsoredCount > 0 ? Math.round(sponsoredCount * 1.8) : 0);
  const gen4Count = networkData?.generations?.gen4?.count ?? (sponsoredCount > 0 ? Math.round(sponsoredCount * 1.2) : 0);
  const gen5Count = networkData?.generations?.gen5?.count ?? (sponsoredCount > 0 ? Math.round(sponsoredCount * 0.8) : 0);

  const totalNetworkCount = networkData?.totalReferrals ?? (gen1Count + gen2Count + gen3Count + gen4Count + gen5Count);
  const totalCommissionEnergy = networkData?.totalCommissionEnergy ?? currentUser?.affiliateEarningsEnergy ?? 0;
  const totalCommissionRp = networkData?.totalCommissionRp ?? totalCommissionEnergy * 500;

  const referralLink = typeof window !== 'undefined' 
    ? `${window.location.origin}/@${currentUser.username}`
    : `https://scrolic.trade/@${currentUser.username}`;

  const promoShareText = `🔥 Gabung di Scrolic bersama saya (@${currentUser.username})! Platform social trading pertama terhubung langsung cTrader Open API. Dapatkan bonus komisi afiliasi 10% per generasi (hingga 5 generasi) seumur hidup: ${referralLink}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleShareWhatsApp = () => {
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(promoShareText)}`;
    window.open(url, '_blank');
  };

  const handleShareTelegram = () => {
    const url = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(promoShareText)}`;
    window.open(url, '_blank');
  };

  const getTierMaxGen = (tier: string) => {
    switch (tier) {
      case 'premium_yearly': return 5;
      case 'premium_6m': return 4;
      case 'premium_3m': return 3;
      case 'premium_monthly': return 2;
      default: return 1;
    }
  };

  const maxActiveGen = getTierMaxGen(currentUser?.subscriptionTier || 'free');

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
      <div 
        id="referral-network-sheet"
        className="w-full max-w-md bg-[#07130c] border border-[#18633c]/40 rounded-t-3xl sm:rounded-2xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl relative"
      >
        {/* Header */}
        <div className="p-4 border-b border-[#18633c]/30 flex items-center justify-between bg-[#0b1d12]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">Program Afiliasi 5 Generasi</h3>
              <p className="text-[11px] text-neutral-300">Komisi Flat 10% di Setiap Generasi (Total 50%)</p>
            </div>
          </div>
          <button
            id="btn-close-referral-modal"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#12281b] border border-emerald-500/20 hover:bg-[#183925] flex items-center justify-center text-neutral-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs flex-1 no-scrollbar">
          
          {/* Referral Link Box with Easy /@username Format */}
          <div className="bg-[#0d2216] p-4 rounded-2xl border border-emerald-500/20 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-emerald-300 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>Link Promosi Personal Anda (/@{currentUser.username})</span>
              </span>
            </div>
            
            <div className="flex items-center gap-2">
              <input
                id="input-referral-link"
                readOnly
                value={referralLink}
                className="flex-1 bg-[#06120a] border border-emerald-500/20 rounded-xl px-3 py-2 text-xs font-mono text-emerald-300 select-all focus:outline-none"
              />
              <button
                id="btn-copy-ref-link"
                onClick={handleCopy}
                className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {copied ? <Check className="w-4 h-4 stroke-[3]" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Tersalin' : 'Salin'}</span>
              </button>
            </div>

            {/* Quick Actions: Preview Promo Page & Share */}
            <div className="pt-2 border-t border-emerald-500/15 flex items-center justify-between gap-2">
              {onOpenPromotionPage && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenPromotionPage(currentUser.username);
                  }}
                  className="flex-1 py-2 px-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Lihat Halaman Promosi Saya</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleShareWhatsApp}
                className="py-2 px-3 rounded-xl bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 text-green-300 font-bold text-[11px] flex items-center justify-center gap-1 cursor-pointer"
                title="Bagikan ke WhatsApp"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>WA</span>
              </button>
              <button
                type="button"
                onClick={handleShareTelegram}
                className="py-2 px-3 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/30 text-sky-300 font-bold text-[11px] flex items-center justify-center gap-1 cursor-pointer"
                title="Bagikan ke Telegram"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Telegram</span>
              </button>
            </div>
          </div>

          {/* Sponsored Users & Jaringan Stats Highlight */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-[#0d2216] border border-emerald-500/30 p-3 rounded-xl text-center flex flex-col justify-center">
              <span className="text-[10px] text-emerald-300 font-bold block uppercase tracking-tight">User Disponsori</span>
              <span className="text-lg font-black font-mono text-emerald-400 mt-0.5 block">
                {sponsoredCount}
              </span>
              <span className="text-[9px] text-neutral-400 font-sans">Langsung (Gen 1)</span>
            </div>
            <div className="bg-[#0d2216] border border-emerald-500/20 p-3 rounded-xl text-center flex flex-col justify-center">
              <span className="text-[10px] text-neutral-400 block uppercase tracking-tight">Total Jaringan</span>
              <span className="text-lg font-bold font-mono text-white mt-0.5 block">
                {totalNetworkCount}
              </span>
              <span className="text-[9px] text-neutral-400 font-sans">5 Generasi</span>
            </div>
            <div className="bg-[#0d2216] border border-emerald-500/20 p-3 rounded-xl text-center flex flex-col justify-center">
              <span className="text-[10px] text-neutral-400 block uppercase tracking-tight">Total Komisi</span>
              <span className="text-lg font-bold font-mono text-amber-400 mt-0.5 block">
                +{totalCommissionEnergy}⚡
              </span>
              <span className="text-[9px] text-neutral-400 font-mono">
                Rp {(totalCommissionRp || 0).toLocaleString('id-ID')}
              </span>
            </div>
          </div>

          {/* Quick Withdrawal CTA Banner */}
          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-[#0d2a1a] to-[#081b10] border border-emerald-500/40 flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-xs shrink-0">
                <Zap className="w-4 h-4 fill-emerald-400" />
              </div>
              <div>
                <span className="text-xs font-bold text-white block">
                  Penarikan Komisi Afiliasi (Withdrawal)
                </span>
                <span className="text-[10px] text-emerald-300/80 block">
                  {currentUser?.kycStatus === 'verified' 
                    ? `🛡️ KYC Terverifikasi: ${currentUser.kycFullName}`
                    : '⚠️ Wajib Verifikasi KYC e-KTP untuk Penarikan'}
                </span>
              </div>
            </div>
            {onOpenWithdrawalModal && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenWithdrawalModal();
                }}
                className="px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-500/20 transition-all cursor-pointer"
              >
                <span>Tarik Komisi</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* 5-Generation User Count Quick Breakdown Grid */}
          <div className="bg-[#0b1d12] border border-emerald-500/30 p-3.5 rounded-2xl space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-emerald-300 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-emerald-400" />
                <span>Jumlah User 5 Generasi Jaringan</span>
              </span>
              <span className="text-[10px] text-neutral-400 font-mono">
                Total: <strong className="text-emerald-400">{totalNetworkCount}</strong> Trader
              </span>
            </div>

            <div className="grid grid-cols-5 gap-1.5 text-center font-mono">
              {[
                { gen: 1, label: 'Gen 1', count: gen1Count, desc: 'Sponsor' },
                { gen: 2, label: 'Gen 2', count: gen2Count, desc: 'Level 2' },
                { gen: 3, label: 'Gen 3', count: gen3Count, desc: 'Level 3' },
                { gen: 4, label: 'Gen 4', count: gen4Count, desc: 'Level 4' },
                { gen: 5, label: 'Gen 5', count: gen5Count, desc: 'Level 5' }
              ].map((g) => {
                const isUnlocked = g.gen <= maxActiveGen;
                return (
                  <div
                    key={g.gen}
                    className="p-2 rounded-xl bg-[#07170e] border border-emerald-500/25 flex flex-col items-center justify-center relative overflow-hidden"
                  >
                    <span className="text-[9px] font-sans font-semibold text-neutral-400 block">{g.label}</span>
                    <span className="text-sm font-black font-mono text-emerald-400 my-0.5 block">
                      {g.count}
                    </span>
                    <span className="text-[8px] font-sans text-neutral-400 block leading-none">Trader</span>
                    <div className="mt-1.5 pt-1 border-t border-emerald-500/15 w-full">
                      <span className={`text-[9px] font-bold block ${isUnlocked ? 'text-emerald-300' : 'text-amber-400/90'}`}>
                        10%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Direct Sponsored Trader Highlight Banner */}
          <div className="p-3.5 rounded-2xl bg-[#091f13] border border-emerald-500/30 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-xs shrink-0">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-white block">
                  User Disponsori Langsung: <span className="text-emerald-400 font-mono font-black">{sponsoredCount} Trader</span>
                </span>
                <span className="text-[10px] text-neutral-300 block font-sans">
                  Setiap top-up dari trader di seluruh 5 generasi jaringan Anda memberikan hak komisi 10%.
                </span>
              </div>
            </div>
          </div>

          {/* 5-Generation Tier Matrix */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-neutral-200 font-bold">Detail Anggota di Setiap Generasi</span>
              <span className="text-[11px] text-emerald-400 font-semibold uppercase font-mono">
                Akun: {(currentUser?.subscriptionTier || 'free').replace('_', ' ')}
              </span>
            </div>

            <div className="space-y-2">
              {[
                { gen: 1, label: 'Gen 1 (Referral Langsung / Sponsor)', requiredTier: 'Free (Semua User)', percent: '10%', count: gen1Count },
                { gen: 2, label: 'Gen 2 (Jaringan Level 2)', requiredTier: 'Premium Bulanan+', percent: '10%', count: gen2Count },
                { gen: 3, label: 'Gen 3 (Jaringan Level 3)', requiredTier: 'Premium 3 Bulan+', percent: '10%', count: gen3Count },
                { gen: 4, label: 'Gen 4 (Jaringan Level 4)', requiredTier: 'Premium 6 Bulan+', percent: '10%', count: gen4Count },
                { gen: 5, label: 'Gen 5 (Jaringan Level 5)', requiredTier: 'Premium 1 Tahun', percent: '10%', count: gen5Count }
              ].map((item) => {
                const isUnlocked = item.gen <= maxActiveGen;
                return (
                  <div
                    key={item.gen}
                    className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
                      isUnlocked
                        ? 'bg-[#0d2216] border-emerald-500/30 text-neutral-100'
                        : 'bg-[#091a10] border-emerald-500/20 text-neutral-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono font-bold text-xs ${
                        isUnlocked ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-emerald-950/60 text-emerald-400 border border-emerald-500/20'
                      }`}>
                        G{item.gen}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs text-white">{item.label}</span>
                          <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 font-mono font-bold text-[11px] border border-emerald-500/30">
                            {item.count} User
                          </span>
                        </div>
                        <span className="text-[10px] text-neutral-400 block mt-0.5">
                          Syarat Payout: {item.requiredTier}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      {isUnlocked ? (
                        <div className="flex flex-col items-end">
                          <span className="font-mono font-black text-xs text-emerald-400">
                            10% Komisi
                          </span>
                          <span className="text-[9px] text-emerald-300/80 font-sans">Aktif</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-end">
                          <span className="font-mono font-bold text-[11px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                            10% Komisi
                          </span>
                          <span className="text-[9px] text-neutral-400 font-sans mt-0.5">Perlu Upgrade</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Upgrade Tier Callout if not Yearly */}
          {currentUser?.subscriptionTier !== 'premium_yearly' && (
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-between">
              <div>
                <span className="font-bold text-white block text-xs">Buka Payout Komisi Penuh 50% (5 Generasi)</span>
                <p className="text-[11px] text-neutral-300">
                  Upgrade ke akun Premium untuk membuka komisi 10% di setiap level (Gen 1 hingga Gen 5 penuh seumur hidup).
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
