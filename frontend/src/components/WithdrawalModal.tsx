import React, { useState, useEffect } from 'react';
import { 
  X, 
  Building2, 
  Wallet, 
  Lock, 
  ShieldCheck, 
  AlertCircle, 
  ArrowRight, 
  CheckCircle2, 
  Zap, 
  History, 
  Sparkles, 
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Receipt
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { User, Withdrawal } from '../types';
import { triggerHaptic } from '../utils/haptics';

interface WithdrawalModalProps {
  currentUser: User;
  onClose: () => void;
  onOpenKycModal: () => void;
  onWithdrawalSuccess: (newBalance: number) => void;
}

const SUPPORTED_BANKS = [
  { code: 'BCA', name: 'Bank Central Asia (BCA)', type: 'BANK' },
  { code: 'MANDIRI', name: 'Bank Mandiri', type: 'BANK' },
  { code: 'BRI', name: 'Bank Rakyat Indonesia (BRI)', type: 'BANK' },
  { code: 'BNI', name: 'Bank Negara Indonesia (BNI)', type: 'BANK' },
  { code: 'BSI', name: 'Bank Syariah Indonesia (BSI)', type: 'BANK' },
  { code: 'JAGO', name: 'Bank Jago', type: 'BANK' },
  { code: 'SEABANK', name: 'SeaBank Indonesia', type: 'BANK' },
  { code: 'BLU', name: 'Blu by BCA Digital', type: 'BANK' },
  { code: 'CIMB', name: 'Bank CIMB Niaga', type: 'BANK' },
  { code: 'DANA', name: 'DANA (E-Wallet)', type: 'EWALLET' },
  { code: 'GOPAY', name: 'GoPay (E-Wallet)', type: 'EWALLET' },
  { code: 'OVO', name: 'OVO (E-Wallet)', type: 'EWALLET' },
  { code: 'SHOPEEPAY', name: 'ShopeePay (E-Wallet)', type: 'EWALLET' }
];

export const WithdrawalModal: React.FC<WithdrawalModalProps> = ({
  currentUser,
  onClose,
  onOpenKycModal,
  onWithdrawalSuccess
}) => {
  const isKycVerified = currentUser?.kycStatus === 'verified' && Boolean(currentUser?.kycFullName);
  const lockedKtpName = currentUser?.kycFullName || '';

  const [activeTab, setActiveTab] = useState<'withdraw' | 'history'>('withdraw');
  const [selectedBankCode, setSelectedBankCode] = useState<string>('BCA');
  const [accountNumber, setAccountNumber] = useState<string>(
    currentUser?.bankAccounts?.[0]?.accountNumber || ''
  );
  const [amountEnergy, setAmountEnergy] = useState<number>(50);
  
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successReceipt, setSuccessReceipt] = useState<Withdrawal | null>(null);
  const [withdrawalHistory, setWithdrawalHistory] = useState<Withdrawal[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);

  const affiliateEnergy = currentUser?.affiliateEarningsEnergy || 0;
  const tradeEnergy = currentUser?.tradeEarningsEnergy || 0;
  // Total withdrawable commission (Energy and IDR: 1 Energy = Rp 500)
  const availableEnergy = Math.max(currentUser?.energyBalance || 0, affiliateEnergy + tradeEnergy);
  const availableRp = availableEnergy * 500;

  const currentAmountRp = amountEnergy * 500;
  const adminFeeRp = 0; // Promo Free BI-FAST
  const netAmountRp = currentAmountRp - adminFeeRp;

  // Load withdrawal history on tab switch or mount
  useEffect(() => {
    if (activeTab === 'history' || currentUser?.id) {
      setIsLoadingHistory(true);
      fetch('/api/withdrawals/history', {
        headers: currentUser?.id ? { 'x-session-user-id': currentUser.id } : {}
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.withdrawals) setWithdrawalHistory(data.withdrawals);
        })
        .catch((err) => console.error(err))
        .finally(() => setIsLoadingHistory(false));
    }
  }, [activeTab, currentUser?.id]);

  const handleSelectPreset = (energy: number) => {
    setAmountEnergy(energy);
    setErrorMessage(null);
    triggerHaptic('selection');
  };

  const handleWithdrawAll = () => {
    const maxVal = Math.max(50, availableEnergy);
    setAmountEnergy(maxVal);
    setErrorMessage(null);
    triggerHaptic('selection');
  };

  const handleProcessWithdrawal = async () => {
    setErrorMessage(null);

    // 1. Mandatory Gatekeeper Check
    if (!isKycVerified) {
      setErrorMessage('Verifikasi KYC (KTP) AI adalah satu-satunya syarat sebelum dapat melakukan penarikan.');
      return;
    }

    if (amountEnergy < 50) {
      setErrorMessage('Minimal penarikan komisi adalah 50 Energy (Rp 25.000).');
      return;
    }

    if (amountEnergy > availableEnergy) {
      setErrorMessage(`Saldo komisi tidak mencukupi (Tersedia: ${availableEnergy} Energy / Rp ${availableRp.toLocaleString('id-ID')}).`);
      return;
    }

    if (!accountNumber.trim()) {
      setErrorMessage('Nomor rekening / nomor e-wallet tujuan wajib diisi.');
      return;
    }

    setIsSubmitting(true);
    triggerHaptic('medium');

    const selectedBank = SUPPORTED_BANKS.find((b) => b.code === selectedBankCode);
    const bankName = selectedBank?.name || selectedBankCode;

    try {
      const response = await fetch('/api/withdrawals/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(currentUser?.id ? { 'x-session-user-id': currentUser.id } : {})
        },
        body: JSON.stringify({
          amountEnergy,
          bankCode: selectedBankCode,
          bankName,
          accountNumber: accountNumber.trim()
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Gagal memproses penarikan komisi.');
      }

      setSuccessReceipt(data.withdrawal);
      onWithdrawalSuccess(data.remainingBalance);

      // Trigger Celebration Confetti
      try {
        confetti({
          particleCount: 90,
          spread: 80,
          origin: { y: 0.6 }
        });
      } catch (e) {}

      triggerHaptic('success');
    } catch (err: any) {
      setErrorMessage(err.message || 'Terjadi kendala saat memproses penarikan');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
      <div 
        id="withdrawal-sheet"
        className="w-full max-w-md bg-[#07130c] border border-emerald-500/30 rounded-t-3xl sm:rounded-2xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl relative"
      >
        {/* Header */}
        <div className="p-4 border-b border-emerald-500/20 flex items-center justify-between bg-[#0b1d12]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">Penarikan Komisi (Withdrawal)</h3>
              <p className="text-[11px] text-neutral-300">Komisi Referral & Setup • Transfer BI-FAST Instan</p>
            </div>
          </div>
          <button
            id="btn-close-withdrawal-modal"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#12281b] border border-emerald-500/20 hover:bg-[#183925] flex items-center justify-center text-neutral-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-emerald-500/20 bg-[#091a10] px-4 pt-2">
          <button
            onClick={() => {
              setActiveTab('withdraw');
              setSuccessReceipt(null);
            }}
            className={`pb-2.5 px-3 text-xs font-bold transition-all relative flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'withdraw'
                ? 'text-emerald-400 border-b-2 border-emerald-400'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Form Penarikan</span>
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`pb-2.5 px-3 text-xs font-bold transition-all relative flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'history'
                ? 'text-emerald-400 border-b-2 border-emerald-400'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Riwayat Penarikan</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs flex-1 no-scrollbar">

          {/* TAB 1: WITHDRAWAL FORM */}
          {activeTab === 'withdraw' && !successReceipt && (
            <div className="space-y-4">
              {/* Available Commission Balance Highlight */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-[#0c2818] to-[#07160d] border border-emerald-500/35 relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-neutral-300 font-bold uppercase tracking-wider">
                    Saldo Komisi Tersedia untuk Ditarik
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono text-[10px] font-bold border border-emerald-500/30">
                    1⚡ = Rp 500
                  </span>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <div>
                    <span className="text-2xl font-black font-mono text-white block">
                      Rp {availableRp.toLocaleString('id-ID')}
                    </span>
                    <span className="text-xs text-emerald-400 font-mono font-bold">
                      {availableEnergy} Energy
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleWithdrawAll}
                    className="px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 font-bold text-[11px] transition-colors cursor-pointer"
                  >
                    Tarik Semua
                  </button>
                </div>
              </div>

              {/* KYC Gatekeeper Warning Banner OR Verified Card */}
              {!isKycVerified ? (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/35 space-y-2.5">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-bold text-amber-300 text-xs">Verifikasi KYC (KTP) Diperlukan!</h4>
                      <p className="text-[11px] text-amber-200/90 leading-relaxed mt-0.5">
                        Sebagai satu-satunya syarat penarikan komisi, akun Anda wajib diverifikasi e-KTP dengan AI agar nama rekening bank terkunci otomatis dan mencegah mismatch identitas.
                      </p>
                    </div>
                  </div>
                  <button
                    id="btn-trigger-kyc-from-wd"
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenKycModal();
                    }}
                    className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20 transition-all cursor-pointer"
                  >
                    <ShieldCheck className="w-4 h-4 fill-black" />
                    <span>Verifikasi e-KTP dengan AI Sekarang</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="p-3 rounded-2xl bg-[#092013] border border-emerald-500/30 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-white text-xs">KYC AI Terverifikasi</span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-mono">
                          OK
                        </span>
                      </div>
                      <span className="text-[10px] text-neutral-300 block font-mono">
                        KTP: <strong className="text-emerald-300">{lockedKtpName}</strong>
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] text-emerald-400 font-mono font-bold">
                    {currentUser.kycNik ? `${currentUser.kycNik.slice(0, 6)}...` : '317101...'}
                  </span>
                </div>
              )}

              {/* Amount Selection Chips */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-neutral-200">
                  Pilih Nominal Penarikan
                </label>
                <div className="grid grid-cols-3 gap-2 font-mono">
                  {[50, 100, 200].map((energy) => (
                    <button
                      key={energy}
                      type="button"
                      onClick={() => handleSelectPreset(energy)}
                      className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                        amountEnergy === energy
                          ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                          : 'bg-[#091a10] border-emerald-500/20 text-neutral-300 hover:border-emerald-500/40'
                      }`}
                    >
                      <span className="text-xs font-bold block">{energy} Energy</span>
                      <span className="text-[10px] text-neutral-400 block mt-0.5">
                        Rp {(energy * 500).toLocaleString('id-ID')}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Bank & E-Wallet Destination Form */}
              <div className="space-y-3 pt-1">
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                    Bank / E-Wallet Tujuan Penarikan
                  </label>
                  <select
                    id="select-withdrawal-bank"
                    value={selectedBankCode}
                    onChange={(e) => setSelectedBankCode(e.target.value)}
                    className="w-full bg-[#0a1b11] border border-emerald-500/30 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-400"
                  >
                    <optgroup label="Bank Nasional Indonesia (BI-FAST)">
                      {SUPPORTED_BANKS.filter((b) => b.type === 'BANK').map((b) => (
                        <option key={b.code} value={b.code}>
                          {b.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="E-Wallet Indonesia">
                      {SUPPORTED_BANKS.filter((b) => b.type === 'EWALLET').map((b) => (
                        <option key={b.code} value={b.code}>
                          {b.name}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                    Nomor Rekening / No. HP E-Wallet
                  </label>
                  <input
                    id="input-account-number"
                    type="text"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    placeholder="Contoh: 1234567890 (BCA) atau 08123456789 (DANA)"
                    className="w-full bg-[#0a1b11] border border-emerald-500/30 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono placeholder-neutral-500 focus:outline-none focus:border-emerald-400"
                  />
                </div>

                {/* CRITICAL REQUIREMENT: Nama Pemilik Rekening is STRICTLY LOCKED to KTP Full Name */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-semibold text-neutral-300 flex items-center gap-1">
                      <Lock className="w-3 h-3 text-emerald-400" />
                      <span>Nama Pemilik Rekening (Terkunci Sesuai KTP)</span>
                    </label>
                    <span className="text-[10px] text-emerald-400 font-bold uppercase">
                      🔒 Read-Only
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      id="input-locked-account-holder-name"
                      type="text"
                      readOnly
                      disabled
                      value={lockedKtpName || 'Wajib Selesaikan Verifikasi KYC Terlebih Dahulu'}
                      className="w-full bg-[#06120a] border border-emerald-500/40 rounded-xl px-3.5 py-2.5 text-xs text-emerald-300 font-mono font-bold uppercase select-none cursor-not-allowed opacity-90"
                    />
                  </div>
                  <span className="text-[10px] text-neutral-400 block mt-1">
                    🛡️ Sistem otomatis mengunci nama rekening sesuai nama e-KTP untuk menjamin keamanan dana dan kepatuhan anti-fraud.
                  </span>
                </div>
              </div>

              {/* Fee & Payout Summary */}
              <div className="p-3.5 rounded-2xl bg-[#08190f] border border-emerald-500/25 space-y-1.5 font-mono">
                <div className="flex justify-between text-neutral-300">
                  <span>Nominal Penarikan:</span>
                  <span>Rp {currentAmountRp.toLocaleString('id-ID')} ({amountEnergy}⚡)</span>
                </div>
                <div className="flex justify-between text-neutral-300">
                  <span>Biaya Transfer BI-FAST:</span>
                  <span className="text-emerald-400 font-bold">Rp 0 (GRATIS)</span>
                </div>
                <div className="pt-1.5 border-t border-emerald-500/15 flex justify-between text-xs font-bold text-white">
                  <span>Total Dana Diterima:</span>
                  <span className="text-emerald-400 font-black">
                    Rp {netAmountRp.toLocaleString('id-ID')}
                  </span>
                </div>
              </div>

              {errorMessage && (
                <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs">
                  {errorMessage}
                </div>
              )}

              {/* Submit Withdrawal Button */}
              <button
                id="btn-confirm-withdrawal"
                onClick={handleProcessWithdrawal}
                disabled={isSubmitting || !isKycVerified || amountEnergy > availableEnergy}
                className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Mentransfer via BI-FAST...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 fill-black" />
                    <span>Tarik Komisi Rp {netAmountRp.toLocaleString('id-ID')} Sekarang</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* TAB 1 SUCCESS RECEIPT */}
          {activeTab === 'withdraw' && successReceipt && (
            <div className="space-y-4 text-center py-2">
              <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center text-emerald-400 shadow-xl shadow-emerald-500/30">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div className="space-y-1">
                <h4 className="font-bold text-white text-base">Penarikan Komisi Berhasil!</h4>
                <p className="text-xs text-emerald-300 font-mono">
                  Dana Rp {(successReceipt?.netAmountRp || 0).toLocaleString('id-ID')} telah ditransfer via BI-FAST
                </p>
              </div>

              {/* Receipt Box */}
              <div className="p-4 rounded-2xl bg-[#0a1f13] border border-emerald-500/30 text-left space-y-2.5 font-mono text-xs">
                <div className="flex justify-between border-b border-emerald-500/20 pb-2">
                  <span className="text-neutral-400 text-[10px]">Reference ID:</span>
                  <span className="text-emerald-400 font-bold">{successReceipt.referenceId}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-neutral-400 text-[10px]">Bank Tujuan:</span>
                  <span className="text-white font-bold">{successReceipt.bankName}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-neutral-400 text-[10px]">Nomor Rekening:</span>
                  <span className="text-white font-bold">{successReceipt.accountNumber}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-neutral-400 text-[10px]">Nama Pemilik (KTP):</span>
                  <span className="text-emerald-300 font-bold">{successReceipt.accountHolderName}</span>
                </div>

                <div className="flex justify-between pt-2 border-t border-emerald-500/20 text-xs">
                  <span className="text-neutral-300 font-sans">Status Transaksi:</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">
                    SUKSES / DITERIMA
                  </span>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setSuccessReceipt(null);
                    setActiveTab('history');
                  }}
                  className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs transition-colors cursor-pointer"
                >
                  Lihat Riwayat Penarikan
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-2.5 rounded-xl bg-[#0d2216] hover:bg-[#122e1e] border border-emerald-500/20 text-neutral-300 text-xs transition-colors cursor-pointer"
                >
                  Selesai
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: WITHDRAWAL HISTORY */}
          {activeTab === 'history' && (
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-white">Daftar Penarikan Komisi Anda</span>
                <span className="text-[10px] text-neutral-400 font-mono">
                  Total: {withdrawalHistory.length} Transaksi
                </span>
              </div>

              {isLoadingHistory ? (
                <div className="py-12 text-center text-neutral-400 space-y-2">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-400" />
                  <p className="text-xs">Memuat riwayat...</p>
                </div>
              ) : withdrawalHistory.length === 0 ? (
                <div className="py-12 text-center text-neutral-400 space-y-2 bg-[#091a10] rounded-2xl border border-emerald-500/20 p-6">
                  <Receipt className="w-8 h-8 mx-auto text-emerald-500/40" />
                  <p className="text-xs text-white font-bold">Belum Ada Riwayat Penarikan</p>
                  <p className="text-[11px] text-neutral-400 max-w-xs mx-auto">
                    Komisi yang Anda hasilkan dari referral dan unlock setup dapat ditarik kapan saja setelah KYC terverifikasi.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {withdrawalHistory.map((item) => (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-2xl bg-[#091d12] border border-emerald-500/25 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-xs">
                            <Building2 className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <span className="font-bold text-white text-xs block">{item.bankName}</span>
                            <span className="text-[10px] text-neutral-400 font-mono block">
                              {item.accountNumber} • a/n {item.accountHolderName}
                            </span>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono font-bold text-[10px] border border-emerald-500/30">
                          {item.status}
                        </span>
                      </div>

                      <div className="pt-2 border-t border-emerald-500/15 flex justify-between items-center text-[11px] font-mono">
                        <span className="text-neutral-400">
                          {new Date(item.createdAt).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                        <div className="text-right">
                          <span className="font-bold text-emerald-400 text-xs block">
                            Rp {(item.netAmountRp || 0).toLocaleString('id-ID')}
                          </span>
                          <span className="text-[9px] text-neutral-400 block">
                            ({item.amountEnergy}⚡ Energy)
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
