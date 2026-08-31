import React, { useState } from 'react';
import { X, ShieldAlert, CheckCircle2, Zap, ArrowRight, Sparkles, AlertCircle, Users, Link2 } from 'lucide-react';
import { FeedPost, User } from '../types';
import { triggerHaptic } from '../utils/haptics';
import { 
  getSymbolSpecs, 
  formatCTraderPrice, 
  calculateCTraderProfitUSD, 
  lotToCTraderVolume,
  getPipSize,
  getContractSize,
  cTraderVolumeToLot
} from '../utils/ctraderCalculations';

interface FollowSetupModalProps {
  post: FeedPost | null;
  currentUser: User;
  onClose: () => void;
  onNavigateToDashboard?: () => void;
  onFollowExecuted?: (orderEvent: any) => void;
  onOpenEnergyModal?: () => void;
  onOpenCTraderModal?: () => void;
}

export const FollowSetupModal: React.FC<FollowSetupModalProps> = ({
  post,
  currentUser,
  onClose,
  onNavigateToDashboard,
  onFollowExecuted,
  onOpenEnergyModal,
  onOpenCTraderModal
}) => {
  if (!post) return null;

  const { trade, user, strategy } = post;
  const isBuy = trade.direction === 'BUY';
  const sym = trade?.symbol && trade.symbol !== 'Unknown' ? trade.symbol : 'XAUUSD';
  const specs = getSymbolSpecs(sym);
  const pipSize = getPipSize(specs);
  const contractSize = getContractSize(specs);
  const minLot = cTraderVolumeToLot(specs.minVolume ?? 100000, specs);
  const maxLot = cTraderVolumeToLot(specs.maxVolume ?? 1000000000, specs);

  const entry = Number(trade.currentPrice || trade.entryPrice || 100);
  const defaultSL = Number(trade.stopLoss || (isBuy ? +(entry - (pipSize * 150)).toFixed(specs.digits) : +(entry + (pipSize * 150)).toFixed(specs.digits)));

  const isOwner = currentUser.id === post.userId || currentUser.username === post.user.username;
  const isCTraderAuthorized = Boolean(currentUser.cTraderConnected && currentUser.cTraderAccountId);

  const followFee = post.followFee || 1;
  const traderShare = Math.round(followFee * 0.8 * 100) / 100;
  const platformFee = Math.round((followFee - traderShare) * 100) / 100;

  const [lot, setLot] = useState<number>(0.10);
  const [selectedRR, setSelectedRR] = useState<'1:1' | '1:2' | '1:3' | '1:4' | '1:5'>('1:2');
  const [sl, setSl] = useState<number>(defaultSL);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [executedOrder, setExecutedOrder] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Dynamic TP calculation based on R:R and SL according to exact cTrader symbol digits
  const riskAmount = isBuy ? Math.max(pipSize, entry - sl) : Math.max(pipSize, sl - entry);
  const rrMultiplier = parseInt(selectedRR.split(':')[1], 10);
  const targetDistance = riskAmount * rrMultiplier;
  const rawCalculatedTP = isBuy ? (entry + targetDistance) : (entry - targetDistance);
  const calculatedTP = Number(rawCalculatedTP.toFixed(specs.digits));

  // Estimated Risk & Reward in USD based on exact cTrader contract size & specifications
  const estimatedRiskUSD = calculateCTraderProfitUSD(sym, entry, sl, lot, isBuy ? 'BUY' : 'SELL');
  const estimatedRiskUSDDisplay = Math.abs(estimatedRiskUSD);
  const estimatedRewardUSD = Number((estimatedRiskUSDDisplay * rrMultiplier).toFixed(2));
  const cTraderVolumeCents = lotToCTraderVolume(lot, sym);

  const handleConfirm = async () => {
    if (isOwner) {
      setErrorMsg('Anda tidak dapat mengikuti setup trading milik sendiri.');
      return;
    }

    if (!isCTraderAuthorized) {
      setErrorMsg('Akun cTrader belum terhubung. Harap hubungkan akun cTrader Anda terlebih dahulu.');
      return;
    }

    if (currentUser.energyBalance < followFee) {
      if (onOpenEnergyModal) {
        onOpenEnergyModal();
      } else {
        alert(`Energy tidak mencukupi (${currentUser.energyBalance}/${followFee} Energy). Silakan Top-Up Energy.`);
      }
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/posts/${post.id}/follow-setup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-user-id': currentUser.id
        },
        body: JSON.stringify({
          volumeLot: lot,
          rrRatio: selectedRR,
          customSL: sl,
          customTP: calculatedTP,
          estimatedRiskUSD: estimatedRiskUSDDisplay
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || data.error || 'Gagal mengikuti setup');
      }

      triggerHaptic('success');
      setExecutedOrder(data.executionEvent);
      setIsSuccess(true);

      if (onFollowExecuted) {
        onFollowExecuted(data.executionEvent);
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
      <div 
        id="follow-setup-sheet"
        className="w-full max-w-md bg-[#0A0A0A] border border-[#1f1f1f] rounded-t-3xl sm:rounded-2xl flex flex-col overflow-hidden shadow-2xl relative max-h-[92vh]"
      >
        {isSuccess ? (
          /* Celebratory Execution Success State */
          <div className="p-6 text-center flex flex-col items-center justify-center space-y-4 animate-in zoom-in-95 duration-300">
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center text-emerald-400 shadow-2xl shadow-emerald-500/40 animate-pulse">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <div className="absolute -top-1 -right-1">
                <Sparkles className="w-6 h-6 text-amber-400 animate-spin" />
              </div>
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-black text-white font-display">
                Order Berhasil Dikirim ke cTrader!
              </h3>
              <p className="text-xs text-neutral-400">
                Setup live @{user.username} telah disinkronkan ke akun cTrader Anda.
              </p>
            </div>

            {/* Execution Receipt Box */}
            <div className="w-full bg-[#111111] border border-emerald-500/30 rounded-2xl p-4 text-left font-mono text-xs space-y-2">
              <div className="flex justify-between items-center pb-2 border-b border-[#222222]">
                <span className="text-neutral-400 font-sans">Simbol & Arah</span>
                <span className={`font-bold px-2 py-0.5 rounded text-xs ${
                  isBuy ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                }`}>
                  {trade.symbol} {trade.direction}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-neutral-400 font-sans">Akun Tujuan cTrader</span>
                <span className="text-emerald-400 font-bold font-mono">cTrader-{executedOrder?.targetAccountId || currentUser.cTraderAccountId || 'Auto'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-neutral-400 font-sans">Volume Eksekusi</span>
                <span className="text-white font-bold">{lot} Lot</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-neutral-400 font-sans">Stop Loss</span>
                <span className="text-rose-400 font-semibold">{sl}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-neutral-400 font-sans">Take Profit (R:R {selectedRR})</span>
                <span className="text-emerald-400 font-bold">{calculatedTP}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-[#222222]">
                <span className="text-neutral-400 font-sans">Status Sinkronisasi</span>
                <span className="text-emerald-400 font-bold flex items-center gap-1 font-sans text-[11px]">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  Live Terverifikasi di Broker
                </span>
              </div>
            </div>

            <button
              id="btn-close-success-follow"
              onClick={() => {
                if (onNavigateToDashboard) {
                  onNavigateToDashboard();
                } else {
                  onClose();
                }
              }}
              className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-sm shadow-lg shadow-emerald-500/30 active:scale-95 transition-all cursor-pointer"
            >
              Lihat di Dashboard
            </button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="p-4 border-b border-[#1f1f1f] flex items-center justify-between bg-[#0e0e0e]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Zap className="w-4 h-4 fill-emerald-400" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">Ikuti Setup Trading</h3>
                  <p className="text-[11px] text-neutral-400">cTrader Mirrored Order Control</p>
                </div>
              </div>
              <button
                id="btn-close-follow-modal"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-[#161616] border border-[#222222] hover:bg-[#222222] flex items-center justify-center text-neutral-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              
              {/* Target Trader Setup Info & Multi-Follower Count */}
              <div className="bg-[#111111] p-3.5 rounded-xl border border-[#1f1f1f] flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <img 
                    src={user.avatar} 
                    alt={user.username} 
                    className="w-8 h-8 rounded-full object-cover border border-[#2a2a2a]" 
                  />
                  <div>
                    <span className="text-neutral-200 font-bold block">@{user.username}</span>
                    <div className="flex items-center gap-2 text-[11px] text-neutral-400">
                      <span>{strategy.name}</span>
                      <span className="text-neutral-600">•</span>
                      <span className="text-amber-400/90 flex items-center gap-1 font-mono">
                        <Users className="w-3 h-3" />
                        {post.followersCount || 0} Follower
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 font-display font-black text-sm text-white">
                  <span>{trade.symbol}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-mono ${
                    isBuy ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                  }`}>
                    {trade.direction}
                  </span>
                </div>
              </div>

              {/* 1. Self Follow Guard Warning */}
              {isOwner && (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Setup Milik Anda Sendiri</span>
                    <span className="text-[11px] text-amber-300/80">
                      Anda adalah pembuat setup ini. Posisi asli sudah berjalan di akun cTrader Anda sehingga tidak dapat diikuti ulang oleh akun sendiri.
                    </span>
                  </div>
                </div>
              )}

              {/* 2. cTrader Authorization Status Box */}
              {!isOwner && (
                <div className={`p-3 rounded-xl border flex items-center justify-between ${
                  isCTraderAuthorized 
                    ? 'bg-[#0d1712] border-emerald-500/30 text-emerald-300'
                    : 'bg-[#18110b] border-amber-500/30 text-amber-300'
                }`}>
                  <div className="flex items-center gap-2">
                    <Link2 className={`w-4 h-4 ${isCTraderAuthorized ? 'text-emerald-400' : 'text-amber-400'}`} />
                    <div>
                      <span className="font-bold block text-[11px]">
                        {isCTraderAuthorized ? 'Akun cTrader Follower Terotorisasi' : 'Akun cTrader Belum Terhubung'}
                      </span>
                      <span className="text-[10px] text-neutral-400 font-mono">
                        {isCTraderAuthorized
                          ? `Tujuan: cTrader-${currentUser.cTraderAccountId || 'Auto'} (${currentUser.brokerName || 'FP Markets'})`
                          : 'Hubungkan via cTrader Gateway untuk mengeksekusi order'}
                      </span>
                    </div>
                  </div>
                  {!isCTraderAuthorized && (
                    <button
                      type="button"
                      onClick={() => {
                        if (onOpenCTraderModal) onOpenCTraderModal();
                      }}
                      className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-[10px] transition-colors cursor-pointer shrink-0"
                    >
                      Hubungkan
                    </button>
                  )}
                </div>
              )}

              {/* 3. Volume / Lot Control */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <label className="text-neutral-300 font-bold">Ukuran Lot Anda</label>
                  <span className="text-neutral-400 font-mono text-[11px]">
                    1 Lot = {contractSize.toLocaleString()} {specs.assetClass === 'METALS' ? 'oz' : specs.assetClass === 'CRYPTO' ? 'BTC' : 'Unit'}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {[0.05, 0.10, 0.50, 1.00].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      disabled={isOwner}
                      onClick={() => setLot(preset)}
                      className={`py-1.5 rounded-lg border text-xs font-mono font-bold transition-all cursor-pointer ${
                        lot === preset
                          ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 shadow-sm'
                          : 'bg-[#141414] border-[#222222] text-neutral-400 hover:text-neutral-200'
                      }`}
                    >
                      {preset} Lot
                    </button>
                  ))}
                </div>
                <div className="relative mt-2">
                  <input
                    id="input-lot-size"
                    type="number"
                    step="0.01"
                    min={minLot}
                    max={maxLot}
                    disabled={isOwner}
                    value={lot}
                    onChange={(e) => setLot(parseFloat(e.target.value) || minLot)}
                    className="w-full bg-[#141414] border border-[#222222] rounded-xl px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-right">
                    <span className="text-neutral-400 font-mono text-xs font-bold block">
                      LOT
                    </span>
                    <span className="text-[9px] text-neutral-500 font-mono block">
                      {cTraderVolumeCents.toLocaleString()} cents
                    </span>
                  </div>
                </div>
              </div>

              {/* 4. Risk / Reward Selector */}
              <div className="space-y-1.5">
                <label className="text-neutral-300 font-bold flex justify-between">
                  <span>Pilih Rasio Risk:Reward (R:R)</span>
                  <span className="text-amber-400 font-mono">Otomatis hitung TP</span>
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  {(['1:1', '1:2', '1:3', '1:4', '1:5'] as const).map((ratio) => (
                    <button
                      key={ratio}
                      type="button"
                      disabled={isOwner}
                      onClick={() => setSelectedRR(ratio)}
                      className={`py-2 rounded-xl border text-xs font-mono font-extrabold transition-all cursor-pointer ${
                        selectedRR === ratio
                          ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-md shadow-amber-500/15'
                          : 'bg-[#141414] border-[#222222] text-neutral-400 hover:text-neutral-200'
                      } disabled:opacity-50`}
                    >
                      {ratio}
                    </button>
                  ))}
                </div>
              </div>

              {/* 5. Real-Time Order Safety Preview */}
              <div className="bg-[#111111] border border-[#1f1f1f] rounded-2xl p-4 space-y-2.5">
                <div className="flex items-center justify-between border-b border-[#1f1f1f] pb-2">
                  <div className="flex items-center gap-1.5 text-neutral-300 font-bold text-xs">
                    <ShieldAlert className="w-4 h-4 text-emerald-400" />
                    <span>Safety Order Confirmation Sheet</span>
                  </div>
                  <span className="text-[10px] text-neutral-400 font-mono bg-[#161616] px-2 py-0.5 rounded border border-[#262626]">
                    {specs.description}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 font-mono">
                  <div>
                    <span className="text-[10px] text-neutral-500 block font-sans">Market Price Entry</span>
                    <span className="text-neutral-200 font-semibold">{formatCTraderPrice(entry, sym)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-neutral-500 block font-sans">Stop Loss (SL)</span>
                    <span className="text-red-400 font-semibold">{formatCTraderPrice(sl, sym)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-neutral-500 block font-sans">Calculated Take Profit</span>
                    <span className="text-emerald-400 font-bold">{formatCTraderPrice(calculatedTP, sym)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-neutral-500 block font-sans">Target R:R</span>
                    <span className="text-amber-300 font-bold">{selectedRR}</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-[#1f1f1f] flex justify-between items-center text-xs">
                  <span className="text-neutral-400">Estimated Max Risk:</span>
                  <span className="font-mono font-bold text-red-400">~${estimatedRiskUSDDisplay.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-neutral-400">Estimated Target Reward:</span>
                  <span className="font-mono font-bold text-emerald-400">+${estimatedRewardUSD.toFixed(2)}</span>
                </div>

                {/* ProtoOASymbol Specs Display */}
                <div className="pt-2 border-t border-[#181818] grid grid-cols-3 gap-1.5 text-[10px] font-mono text-neutral-400">
                  <div className="bg-[#161616] p-1.5 rounded border border-[#222222]">
                    <span className="text-[9px] text-neutral-500 block">pipPosition</span>
                    <span className="text-neutral-200 font-bold">{specs.pipPosition} (10^-{specs.pipPosition})</span>
                  </div>
                  <div className="bg-[#161616] p-1.5 rounded border border-[#222222]">
                    <span className="text-[9px] text-neutral-500 block">lotSize / Units</span>
                    <span className="text-neutral-200 font-bold">{contractSize.toLocaleString()} {specs.measurementUnits || 'Unit'}</span>
                  </div>
                  <div className="bg-[#161616] p-1.5 rounded border border-[#222222]">
                    <span className="text-[9px] text-neutral-500 block">tickSize</span>
                    <span className="text-neutral-200 font-bold">10^-{specs.digits}</span>
                  </div>
                </div>
              </div>

              {/* Error Banner */}
              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
                  {errorMsg}
                </div>
              )}

              {/* Energy Cost & 80/20 Revenue Allocation Notice */}
              <div className="p-3 rounded-xl bg-[#141414] border border-amber-500/20 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-neutral-300 font-medium">Biaya Ikuti Setup:</span>
                  <span className="font-bold text-amber-400 flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5 fill-amber-400" /> {followFee} Energy
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-neutral-400 pt-1 border-t border-[#222222]">
                  <span>Alokasi Trader @{user.username} (80%):</span>
                  <span className="font-mono font-bold text-emerald-400">+{traderShare} Energy</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-neutral-400">
                  <span>Platform Fee (20%):</span>
                  <span className="font-mono text-neutral-400">{platformFee} Energy</span>
                </div>
              </div>
            </div>

            {/* Action Button */}
            <div className="p-4 border-t border-[#1f1f1f] bg-[#0c0c0c]">
              <button
                id="btn-confirm-follow-order"
                disabled={isSubmitting || isOwner || !isCTraderAuthorized || currentUser.energyBalance < followFee}
                onClick={handleConfirm}
                className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-sm shadow-xl shadow-emerald-500/25 flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <span>Mengirim Order ke cTrader...</span>
                ) : isOwner ? (
                  <span>Setup Milik Sendiri (Tidak Dapat Diikuti)</span>
                ) : !isCTraderAuthorized ? (
                  <span>Hubungkan cTrader Terlebih Dahulu</span>
                ) : currentUser.energyBalance < followFee ? (
                  <span>Energy Kurang ({currentUser.energyBalance}/{followFee}) - Top Up</span>
                ) : (
                  <>
                    <span>Konfirmasi & Kirim Order ({followFee} Energy)</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

