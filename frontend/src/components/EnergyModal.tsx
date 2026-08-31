import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Zap, 
  CreditCard, 
  Wallet, 
  ArrowUpRight, 
  ArrowDownLeft, 
  CheckCircle2, 
  Gift, 
  ExternalLink, 
  Copy, 
  Check, 
  Clock, 
  ShieldCheck, 
  RefreshCw,
  ChevronLeft,
  Globe,
  Lock
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { User, EnergyTransaction, MayarPaymentOrder } from '../types';
import { triggerHaptic } from '../utils/haptics';
import { ScrolicLogo } from './ScrolicLogo';
import { socketClient } from '../services/socketClient';

interface EnergyModalProps {
  currentUser: User;
  onClose: () => void;
  onTopupSuccess: (newBalance: number) => void;
  onOpenWithdrawalModal?: () => void;
  onOpenKycModal?: () => void;
}

const cleanMayarUrl = (url?: string | null): string => {
  if (!url || typeof url !== 'string' || url.trim() === '') {
    return '';
  }
  return url.trim();
};

export const EnergyModal: React.FC<EnergyModalProps> = ({
  currentUser,
  onClose,
  onTopupSuccess,
  onOpenWithdrawalModal,
  onOpenKycModal
}) => {
  const [activeTab, setActiveTab] = useState<'topup' | 'history'>('topup');
  const [selectedPackage, setSelectedPackage] = useState<number>(50);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeOrder, setActiveOrder] = useState<MayarPaymentOrder | null>(null);
  const [transactions, setTransactions] = useState<EnergyTransaction[]>([]);
  const [successMessage, setSuccessMessage] = useState('');
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(900); // 15 mins timer
  const pollingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [dynamicPackages, setDynamicPackages] = useState<Array<{
    energy: number;
    priceRp: number;
    basePriceRp?: number;
    discountPercent?: number;
    label: string;
    bonus?: string;
  }>>([
    { energy: 10, priceRp: 10000, label: 'Starter' },
    { energy: 25, priceRp: 25000, label: 'Standard' },
    { energy: 50, priceRp: 45000, basePriceRp: 50000, discountPercent: 10, label: 'Popular', bonus: '+2 Bonus' },
    { energy: 100, priceRp: 85000, basePriceRp: 100000, discountPercent: 15, label: 'Pro Trader', bonus: '+5 Bonus' },
    { energy: 250, priceRp: 200000, basePriceRp: 250000, discountPercent: 20, label: 'Elite Squad', bonus: '+15 Bonus' },
    { energy: 500, priceRp: 375000, basePriceRp: 500000, discountPercent: 25, label: 'Master Fund', bonus: '+35 Bonus' }
  ]);

  // Listen to real-time Energy balance updates via WebSocket
  useEffect(() => {
    const unsub = socketClient.onEnergyUpdate((payload) => {
      const myId = currentUser.id || (currentUser as any).username;
      if (payload.userId === myId || payload.userId === (currentUser as any)._id) {
        onTopupSuccess(payload.energyBalance);
        if (activeOrder && activeOrder.status !== 'PAID') {
          handlePaymentSuccess(activeOrder, payload.energyBalance);
        }
      }
    });

    return () => {
      unsub();
    };
  }, [currentUser, activeOrder]);

  // Fetch transactions and energy packages from admin config on mount
  useEffect(() => {
    fetch('/api/config/energy-packages')
      .then((res) => res.json())
      .then((data) => {
        if (data.packages && Array.isArray(data.packages) && data.packages.length > 0) {
          const activeOnly = data.packages
            .filter((p: any) => p.isActive !== false)
            .map((p: any) => ({
              energy: p.energy,
              priceRp: p.discountPriceRp || p.basePriceRp || p.energy * 1000,
              basePriceRp: p.basePriceRp,
              discountPercent: p.discountPercent || 0,
              label: p.label || `${p.energy} Energy`,
              bonus: p.bonus
            }));
          if (activeOnly.length > 0) setDynamicPackages(activeOnly);
        }
      })
      .catch((err) => console.error(err));

    fetch('/api/payment/transactions')
      .then((res) => res.json())
      .then((data) => {
        if (data.transactions) setTransactions(data.transactions);
      })
      .catch((err) => console.error(err));

    return () => {
      if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
    };
  }, []);

  // Countdown timer for active Mayar order
  useEffect(() => {
    if (!activeOrder || activeOrder.status === 'PAID') return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [activeOrder]);

  // Polling for active Mayar order status
  useEffect(() => {
    if (!activeOrder || activeOrder.status === 'PAID') {
      if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
      return;
    }
    pollingTimerRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/payments/mayar/status/${activeOrder.orderId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.order && (data.order.status === 'PAID' || data.isPaid)) {
          handlePaymentSuccess(data.order, data.currentEnergyBalance);
        }
      } catch (err) {
        console.error('Error polling Mayar order:', err);
      }
    }, 2500);

    return () => {
      if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
    };
  }, [activeOrder]);

  const handlePaymentSuccess = (order: MayarPaymentOrder, newBalance?: number) => {
    if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
    
    triggerHaptic('success');
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });

    setActiveOrder((prev) => (prev ? { ...prev, status: 'PAID' } : null));
    setSuccessMessage(`Top Up Berhasil! +${order.amountEnergy} Energy telah masuk ke akun Anda.`);
    
    const balance = newBalance !== undefined ? newBalance : currentUser.energyBalance + order.amountEnergy;
    onTopupSuccess(balance);

    // Refresh transaction list
    fetch('/api/payment/transactions', {
      headers: {
        'Content-Type': 'application/json',
        'x-session-user-id': currentUser.id || currentUser.username || ''
      }
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.transactions) setTransactions(data.transactions);
      })
      .catch((err) => console.error(err));
  };

  const handleCreateMayarPayment = async () => {
    triggerHaptic('medium');
    setIsProcessing(true);
    setSuccessMessage('');
    try {
      const response = await fetch('/api/payments/mayar/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-user-id': currentUser.id || currentUser.username || ''
        },
        body: JSON.stringify({ 
          userId: currentUser.id || currentUser.username,
          amountEnergy: selectedPackage,
          method: 'portal',
          customerName: currentUser.displayName || currentUser.name || currentUser.username,
          customerEmail: currentUser.email || `${currentUser.username}@scrolic.com`
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || data.error || 'Gagal menghubungi server Mayar.id');
      setActiveOrder(data.order);
      setTimeLeft(900); // 15 minutes countdown
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    triggerHaptic('selection');
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
      <div 
        id="energy-wallet-sheet"
        className="w-full max-w-md bg-[#07130c] border border-[#18633c]/40 rounded-t-3xl sm:rounded-3xl max-h-[94vh] flex flex-col overflow-hidden shadow-2xl relative text-neutral-200"
      >
        {/* Header */}
        <div className="p-4 border-b border-[#18633c]/30 flex items-center justify-between bg-[#0b1d12]">
          <div className="flex items-center gap-2.5">
            {activeOrder && activeOrder.status !== 'PAID' ? (
              <button
                onClick={() => {
                  triggerHaptic('light');
                  setActiveOrder(null);
                }}
                className="w-8 h-8 rounded-full bg-[#12281b] border border-emerald-500/20 hover:bg-[#183524] flex items-center justify-center text-neutral-300 hover:text-white transition-colors cursor-pointer"
                title="Kembali ke pilihan paket"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            ) : (
              <ScrolicLogo size={34} />
            )}
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="font-bold text-white text-sm">Scrolic Energy Wallet</h3>
                <span className="px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px] font-extrabold rounded">
                  Mayar.id
                </span>
              </div>
              <p className="text-[11px] text-emerald-400/80">1 Energy = Rp 1.000 • In-App Portal Mayar</p>
            </div>
          </div>
          <button
            id="btn-close-energy-modal"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#12281b] border border-emerald-500/20 hover:bg-[#183524] flex items-center justify-center text-neutral-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Current Balance Hero */}
        <div className="p-4 bg-[#0a180f] border-b border-[#18633c]/30 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-emerald-400 font-semibold block uppercase tracking-wider">
              Saldo Energy Anda
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-3xl font-black text-white font-mono">
                {(currentUser?.energyBalance ?? (currentUser as any)?.energy ?? 0).toLocaleString('id-ID')}
              </span>
              <span className="text-xs text-emerald-400 font-bold">ENERGY</span>
            </div>
            <span className="text-xs text-neutral-400">
              ≈ Rp {((currentUser?.energyBalance ?? (currentUser as any)?.energy ?? 0) * 1000).toLocaleString('id-ID')}
            </span>
          </div>
          <div className="text-right space-y-1.5">
            {onOpenWithdrawalModal && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenWithdrawalModal();
                }}
                className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <span>Tarik Komisi</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            )}
            <div className="text-[10px] text-neutral-400 flex items-center justify-end gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              <span>KYC: {currentUser?.kycStatus === 'verified' ? 'Terverifikasi' : 'Belum Verifikasi'}</span>
            </div>
          </div>
        </div>

        {/* Tab Toggle (Only when not in active checkout) */}
        {!activeOrder && (
          <div className="flex border-b border-[#1f1f1f] bg-[#0c0c0c] p-1">
            <button
              onClick={() => {
                triggerHaptic('selection');
                setActiveTab('topup');
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                activeTab === 'topup'
                  ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Top Up Energy
            </button>
            <button
              onClick={() => {
                triggerHaptic('selection');
                setActiveTab('history');
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                activeTab === 'history'
                  ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Riwayat Ledger
            </button>
          </div>
        )}

        {/* --- VIEW 1: ACTIVE MAYAR CHECKOUT SCREEN --- */}
        {activeOrder ? (
          <div className="p-4 sm:p-5 overflow-y-auto space-y-3.5 text-xs flex-1 no-scrollbar">
            {activeOrder.status === 'PAID' ? (
              // Payment Success State
              <div className="py-6 text-center space-y-4 animate-in zoom-in-95 duration-200">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center mx-auto text-emerald-400 shadow-lg shadow-emerald-500/20">
                  <CheckCircle2 className="w-9 h-9" />
                </div>
                <div>
                  <h4 className="text-lg font-black text-white">Pembayaran Sukses!</h4>
                  <p className="text-xs text-neutral-300 mt-1">
                    Top up <span className="text-amber-400 font-bold">+{activeOrder.amountEnergy} Energy</span> berhasil dikreditkan ke dompet Anda via Mayar.id.
                  </p>
                </div>
                <div className="bg-[#141414] border border-[#222222] rounded-2xl p-4 text-left space-y-2 font-mono text-[11px]">
                  <div className="flex justify-between text-neutral-400">
                    <span>Order ID:</span>
                    <span className="text-white font-semibold">{activeOrder.orderId}</span>
                  </div>
                  <div className="flex justify-between text-neutral-400">
                    <span>Nominal:</span>
                    <span className="text-emerald-400 font-bold">Rp {(activeOrder.amountRp || 0).toLocaleString('id-ID')}</span>
                  </div>
                  <div className="flex justify-between text-neutral-400">
                    <span>Gateway:</span>
                    <span className="text-white">Portal Mayar.id</span>
                  </div>
                  <div className="flex justify-between text-neutral-400">
                    <span>Waktu Bayar:</span>
                    <span className="text-white">{new Date(activeOrder.paidAt || Date.now()).toLocaleTimeString('id-ID')}</span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    triggerHaptic('light');
                    setActiveOrder(null);
                  }}
                  className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs transition-colors cursor-pointer"
                >
                  Selesai & Lihat Saldo
                </button>
              </div>
            ) : (
              // Active Pending Payment Screen with In-App Mayar Portal
              <div className="space-y-3">
                {/* Status Bar */}
                <div className="bg-[#12281b] border border-emerald-500/30 rounded-xl px-3 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
                    <span className="text-emerald-300 font-bold text-[11px]">
                      Menunggu Pembayaran di Portal Mayar.id
                    </span>
                  </div>
                  <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-mono font-bold">
                    <Clock className="w-3 h-3" />
                    <span>{formatTimer(timeLeft)}</span>
                  </div>
                </div>

                {/* In-App Mayar Portal Frame */}
                <div className="bg-[#121212] border border-emerald-500/30 rounded-2xl overflow-hidden shadow-2xl">
                  <div className="bg-[#0b1d12] px-3 py-2 border-b border-emerald-500/20 flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5 text-emerald-300 font-bold">
                      <Globe className="w-3.5 h-3.5" />
                      <span>Portal Pembayaran Mayar.id</span>
                    </div>
                    <span className="text-[10px] text-neutral-400 font-mono">
                      https://scrolic.myr.id
                    </span>
                  </div>
                  <div className="w-full h-[400px] bg-white relative">
                    <iframe 
                      src={cleanMayarUrl(activeOrder.paymentUrl || (activeOrder as any).checkoutUrl)}
                      title="Mayar In-App Checkout"
                      className="w-full h-full border-0"
                      allow="payment"
                    />
                  </div>
                </div>

                {/* Details Breakdown Card */}
                <div className="bg-[#141414] border border-[#222222] rounded-xl p-3 space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-neutral-400">Total Tagihan</span>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-black text-amber-400 font-mono">
                        Rp {(activeOrder.amountRp || 0).toLocaleString('id-ID')}
                      </span>
                      <button
                        onClick={() => copyToClipboard(activeOrder.amountRp.toString(), 'amount')}
                        className="p-1 rounded bg-[#202020] hover:bg-[#2a2a2a] text-neutral-300 cursor-pointer"
                        title="Salin nominal"
                      >
                        {copiedText === 'amount' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-neutral-400">Order ID</span>
                    <div className="flex items-center gap-2 font-mono text-[11px]">
                      <span className="text-neutral-300">{activeOrder.orderId}</span>
                      <button
                        onClick={() => copyToClipboard(activeOrder.orderId, 'orderId')}
                        className="p-1 rounded bg-[#202020] hover:bg-[#2a2a2a] text-neutral-300 cursor-pointer"
                        title="Salin Order ID"
                      >
                        {copiedText === 'orderId' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Direct Mayar Link CTA */}
                <a
                  href={cleanMayarUrl(activeOrder.paymentUrl || (activeOrder as any).checkoutUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => triggerHaptic('medium')}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-black font-extrabold text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 cursor-pointer"
                >
                  <ExternalLink className="w-4 h-4 stroke-[2.5]" />
                  <span>Buka Halaman Pembayaran Mayar.id (QRIS / VA)</span>
                </a>

                {/* Real-time sync hint */}
                <div className="p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-500/20 text-center text-[10px] text-emerald-300/80 flex items-center justify-center gap-1.5">
                  <Lock className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span>Setelah pembayaran selesai di portal Mayar, Energy akan otomatis masuk ke akun Anda.</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* --- VIEW 2: PACKAGE SELECTION & PAYMENT CHANNELS --- */
          activeTab === 'topup' && (
            <div className="p-5 overflow-y-auto space-y-4 text-xs flex-1 no-scrollbar">
              
              {successMessage && (
                <div className="p-3 bg-emerald-500/15 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>{successMessage}</span>
                </div>
              )}

              {/* Packages Grid */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-neutral-300 font-bold block">Pilih Paket Energy</label>
                  <span className="text-[10px] text-amber-400 font-semibold">1 Energy = Rp 1.000</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {dynamicPackages.map((pkg) => (
                    <button
                      key={pkg.energy}
                      type="button"
                      onClick={() => {
                        triggerHaptic('selection');
                        setSelectedPackage(pkg.energy);
                      }}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer relative overflow-hidden ${
                        selectedPackage === pkg.energy
                          ? 'bg-amber-500/15 border-amber-400 shadow-md shadow-amber-500/10'
                          : 'bg-[#141414] border-[#222222] hover:border-[#333333]'
                      }`}
                    >
                      {pkg.discountPercent && pkg.discountPercent > 0 ? (
                        <span className="absolute top-1 right-1 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-rose-500 text-white animate-pulse">
                          -{pkg.discountPercent}%
                        </span>
                      ) : pkg.bonus ? (
                        <span className="absolute top-1 right-1 text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500 text-black">
                          {pkg.bonus}
                        </span>
                      ) : null}
                      <div className="flex items-center gap-1 font-bold text-white text-sm">
                        <Zap className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                        <span>{pkg.energy} Energy</span>
                      </div>
                      <div className="mt-1 flex items-baseline gap-1.5">
                        <span className="text-[11px] text-amber-300 font-mono font-bold">
                          Rp {(pkg.priceRp || 0).toLocaleString('id-ID')}
                        </span>
                        {pkg.basePriceRp && pkg.basePriceRp > pkg.priceRp && (
                          <span className="text-[9px] text-neutral-500 line-through font-mono">
                            Rp {pkg.basePriceRp.toLocaleString('id-ID')}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Payment Gateway Information */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-neutral-300 font-bold block">Gateway Pembayaran Resmi</label>
                  <span className="text-[10px] text-emerald-400 font-mono">Mayar.id Portal</span>
                </div>
                <div className="p-3 bg-[#111111] border border-emerald-500/30 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-white font-semibold">
                    <Globe className="w-4 h-4 text-emerald-400" />
                    <span>Portal Resmi Mayar (https://scrolic.myr.id)</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-neutral-400 pt-1">
                    <div className="flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-amber-400" />
                      <span>Virtual Account (BCA, Mandiri, BNI, BRI)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Wallet className="w-3.5 h-3.5 text-emerald-400" />
                      <span>QRIS Dinamis, E-Wallet & Direct Debit</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Referral Economy Info */}
              <div className="p-3 bg-[#111111] rounded-xl border border-[#1f1f1f] text-[11px] text-neutral-400 leading-relaxed">
                <div className="flex items-center gap-1 text-amber-300 font-semibold mb-0.5">
                  <Gift className="w-3.5 h-3.5" />
                  <span>5-Generation Referral Economy</span>
                </div>
                Setiap pembayaran otomatis diproses aman oleh Mayar.id dan komisi afiliasi hingga 5 generasi didistribusikan secara real-time.
              </div>
            </div>
          )
        )}

        {/* --- VIEW 3: LEDGER HISTORY --- */}
        {!activeOrder && activeTab === 'history' && (
          <div className="p-4 overflow-y-auto space-y-2.5 text-xs flex-1 no-scrollbar">
            {transactions.length === 0 ? (
              <div className="text-center py-8 text-neutral-500">
                Belum ada riwayat transaksi Energy.
              </div>
            ) : (
              transactions.map((tx: any) => {
                const status = (tx.status || 'COMPLETED').toUpperCase();
                const isPending = status === 'PENDING';
                const isPaid = status === 'PAID' || status === 'COMPLETED';
                const isExpired = status === 'EXPIRED' || tx.isExpired;
                const payUrl = cleanMayarUrl(tx.checkoutUrl || tx.paymentUrl);

                return (
                  <div 
                    key={tx.id} 
                    className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          tx.amount > 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                        }`}>
                          {tx.amount > 0 ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                        </div>
                        <div>
                          <span className="font-semibold text-neutral-200 block text-xs">
                            {tx.description || (tx.amount > 0 ? 'Top Up Energy' : 'Penggunaan Energy')}
                          </span>
                          <span className="text-[10px] text-neutral-500 font-mono">
                            {tx.createdAt ? new Date(tx.createdAt).toLocaleString('id-ID') : '-'}
                          </span>
                        </div>
                      </div>
                      <div className="text-right font-mono font-bold">
                        <span className={tx.amount > 0 ? 'text-emerald-400' : 'text-rose-400'}>
                          {tx.amount > 0 ? `+${tx.amount}` : tx.amount} Energy
                        </span>
                        {tx.amountRp && tx.amountRp > 0 ? (
                          <span className="block text-[10px] text-neutral-400 font-normal">
                            Rp {(tx.amountRp || 0).toLocaleString('id-ID')}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* Status Badge & Payment Action */}
                    <div className="flex items-center justify-between pt-1 border-t border-[#1a1a1a] text-[10px]">
                      <div className="flex items-center gap-1.5">
                        <span className="text-neutral-400">Status:</span>
                        {isPaid && (
                          <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold">
                            ✓ LUNAS
                          </span>
                        )}
                        {isPending && (
                          <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-bold animate-pulse">
                            ⏳ MENUNGGU PEMBAYARAN
                          </span>
                        )}
                        {isExpired && (
                          <span className="px-2 py-0.5 rounded bg-rose-500/15 text-rose-400 border border-rose-500/30 font-bold">
                            ✕ KADALUARSA
                          </span>
                        )}
                      </div>

                      {/* Active Payment Link Button */}
                      {isPending && payUrl && !isExpired && (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              triggerHaptic('medium');
                              setActiveOrder({
                                orderId: tx.mayarInvoiceId || tx.id,
                                amountEnergy: tx.amount,
                                amountRp: tx.amountRp || tx.amount * 1000,
                                paymentUrl: payUrl,
                                checkoutUrl: payUrl,
                                status: 'PENDING'
                              });
                              setActiveTab('topup');
                            }}
                            className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-[10px] flex items-center gap-1 transition-all shadow-sm shadow-amber-500/20 cursor-pointer"
                          >
                            <span>Bayar di Modal</span>
                          </button>
                          <a
                            href={payUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => triggerHaptic('medium')}
                            className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 font-bold text-[10px] flex items-center gap-1 transition-all cursor-pointer"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>Link Mayar</span>
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Bottom Pay Button (Selection Screen) */}
        {!activeOrder && activeTab === 'topup' && (
          <div className="p-4 border-t border-[#1f1f1f] bg-[#0c0c0c]">
            <button
              id="btn-submit-topup"
              disabled={isProcessing}
              onClick={handleCreateMayarPayment}
              className="w-full py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-sm shadow-xl shadow-amber-500/20 flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
            >
              {isProcessing ? (
                <span className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Membuka Portal Mayar.id...
                </span>
              ) : (
                <>
                  <Zap className="w-4 h-4 fill-black" />
                  <span>Bayar Rp {((selectedPackage || 0) * 1000).toLocaleString('id-ID')} via Mayar.id (+{selectedPackage} Energy)</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

