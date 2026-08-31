import React, { useState, useRef } from 'react';
import { 
  X, 
  ShieldCheck, 
  Upload, 
  Camera, 
  Sparkles, 
  CheckCircle2, 
  Lock, 
  AlertCircle, 
  FileText, 
  ArrowRight, 
  Building2, 
  RefreshCw, 
  Check, 
  CreditCard,
  Zap 
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { User } from '../types';
import { triggerHaptic } from '../utils/haptics';

interface KycVerificationModalProps {
  currentUser: User;
  onClose: () => void;
  onVerificationSuccess: (updatedUser: User) => void;
  onProceedToWithdraw?: () => void;
}

export const KycVerificationModal: React.FC<KycVerificationModalProps> = ({
  currentUser,
  onClose,
  onVerificationSuccess,
  onProceedToWithdraw
}) => {
  const isAlreadyVerified = currentUser?.kycStatus === 'verified' && currentUser?.kycFullName;

  const [step, setStep] = useState<'input' | 'processing' | 'result'>(isAlreadyVerified ? 'result' : 'input');
  const [ktpPreview, setKtpPreview] = useState<string | null>(null);
  const [ktpBase64, setKtpBase64] = useState<string | null>(null);
  const [nikInput, setNikInput] = useState<string>(currentUser?.kycNik || '');
  const [fullNameInput, setFullNameInput] = useState<string>(currentUser?.kycFullName || currentUser?.displayName || '');
  const [birthDateInput, setBirthDateInput] = useState<string>(currentUser?.kycBirthDate || '1995-08-17');
  const [addressInput, setAddressInput] = useState<string>(currentUser?.kycAddress || 'JAKARTA SELATAN, DKI JAKARTA');
  
  const [processingStatus, setProcessingStatus] = useState<string>('Memulai AI Gemini OCR...');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [verifiedResult, setVerifiedResult] = useState<any>(
    isAlreadyVerified
      ? {
          fullName: currentUser.kycFullName,
          nik: currentUser.kycNik || '3171015608950002',
          verifiedAt: currentUser.kycVerifiedAt || new Date().toISOString(),
          status: 'verified'
        }
      : null
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Handle Image Upload (File / Drag-and-drop / Camera)
  const handleImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMessage('Harap unggah file gambar dokumen KTP (JPG, PNG, WebP).');
      return;
    }
    setErrorMessage(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setKtpPreview(result);
      setKtpBase64(result);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleImageFile(e.dataTransfer.files[0]);
    }
  };

  // Sample KTP Presets for fast testing
  const handleLoadSampleKtp = (presetName: string, presetNik: string, city: string) => {
    setFullNameInput(presetName.toUpperCase());
    setNikInput(presetNik);
    setBirthDateInput('1994-06-20');
    setAddressInput(`${city}, INDONESIA`);
    setErrorMessage(null);
    triggerHaptic('selection');
  };

  const handleStartAiVerification = async () => {
    setErrorMessage(null);
    setStep('processing');
    triggerHaptic('medium');

    setProcessingStatus('Mengunggah dokumen ke Gemini AI Engine...');

    try {
      setTimeout(() => setProcessingStatus('Memindai chip e-KTP & Optical Character Recognition (OCR)...'), 700);
      setTimeout(() => setProcessingStatus('Mengekstrak NIK 16-Digit & Nama Lengkap Resmi...'), 1400);
      setTimeout(() => setProcessingStatus('Mengunci identitas pemilik untuk rekening penarikan bank lokal...'), 2100);

      const response = await fetch('/api/kyc/verify-ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(currentUser?.id ? { 'x-session-user-id': currentUser.id } : {})
        },
        body: JSON.stringify({
          ktpImageBase64: ktpBase64,
          nik: nikInput,
          fullName: fullNameInput,
          birthDate: birthDateInput,
          address: addressInput
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Gagal memverifikasi KTP. Pastikan data KTP sesuai.');
      }

      setVerifiedResult(data);
      setStep('result');

      // Update current user state in app including the newly awarded 25 Energy bonus
      const updatedUser: User = {
        ...currentUser,
        kycStatus: 'verified',
        kycFullName: data.fullName,
        kycNik: data.nik,
        kycBirthDate: data.birthDate,
        kycAddress: data.address,
        kycVerifiedAt: data.verifiedAt,
        energyBalance: typeof data.newEnergyBalance === 'number' 
          ? data.newEnergyBalance 
          : (currentUser.energyBalance + (data.bonusEnergyAwarded || 25))
      };

      onVerificationSuccess(updatedUser);

      // Trigger Celebration Confetti
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 }
        });
      } catch (e) {}

      triggerHaptic('success');
    } catch (err: any) {
      setErrorMessage(err.message || 'Terjadi kendala saat verifikasi AI');
      setStep('input');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
      <div 
        id="kyc-verification-sheet"
        className="w-full max-w-md bg-[#07130c] border border-emerald-500/30 rounded-t-3xl sm:rounded-2xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl relative"
      >
        {/* Header */}
        <div className="p-4 border-b border-emerald-500/20 flex items-center justify-between bg-[#0b1d12]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm flex items-center gap-1.5">
                <span>Verifikasi KYC AI</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold border border-emerald-500/30">
                  Otomatis
                </span>
              </h3>
              <p className="text-[11px] text-neutral-300">Satu-satunya syarat untuk penarikan komisi</p>
            </div>
          </div>
          <button
            id="btn-close-kyc-modal"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#12281b] border border-emerald-500/20 hover:bg-[#183925] flex items-center justify-center text-neutral-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs flex-1 no-scrollbar">

          {/* STEP 1: INPUT & UPLOAD FORM */}
          {step === 'input' && (
            <div className="space-y-4">
              {/* Mandatory Withdrawal Requirement Banner & +25 Energy Bonus */}
              <div className="space-y-2">
                <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                    <Zap className="w-4 h-4 fill-emerald-400" />
                  </div>
                  <div className="text-[11px] text-emerald-200/90 leading-tight">
                    <strong className="text-emerald-300 block mb-0.5">+25 Energy Gratis Langsung Masuk!</strong>
                    Selesaikan verifikasi e-KTP untuk klaim bonus 25 Energy otomatis ke saldo akun Anda.
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-[11px] text-amber-200/90 leading-relaxed">
                    <strong className="text-amber-300 block mb-0.5">Syarat Mutlak Penarikan Komisi</strong>
                    KYC e-KTP diverifikasi otomatis dengan Google Gemini AI. Nama yang tertera di KTP akan <strong>dikunci permanen</strong> pada form rekening bank lokal penarikan Anda.
                  </div>
                </div>
              </div>

              {/* KTP Document Dropzone */}
              <div>
                <label className="block text-[11px] font-bold text-neutral-200 mb-1.5">
                  Foto e-KTP (Asli / Scan Jelas)
                </label>
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-emerald-500/30 hover:border-emerald-500/60 bg-[#0a1a10] rounded-2xl p-4 text-center cursor-pointer transition-all hover:bg-[#0e2617] group"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleImageFile(e.target.files[0]);
                      }
                    }}
                  />
                  {ktpPreview ? (
                    <div className="space-y-2">
                      <img
                        src={ktpPreview}
                        alt="Preview KTP"
                        className="max-h-32 mx-auto rounded-xl border border-emerald-500/40 object-cover shadow-lg"
                      />
                      <span className="text-[11px] text-emerald-400 font-bold block flex items-center justify-center gap-1">
                        <Check className="w-3.5 h-3.5" />
                        <span>Foto KTP Terunggah (Klik untuk mengganti)</span>
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-2 py-2">
                      <div className="w-10 h-10 mx-auto rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                        <Upload className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-white block">Klik atau Drag & Drop Foto KTP</span>
                        <span className="text-[10px] text-neutral-400 block mt-0.5">Mendukung JPG, PNG, atau Kamera HP (Maks. 5MB)</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Quick Sample Presets for Instant Testing */}
              <div>
                <span className="text-[10px] text-neutral-400 block uppercase font-mono tracking-wider mb-1.5">
                  Atau Gunakan Data Uji Verifikasi Cepat:
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleLoadSampleKtp('BAMBANG WIJAYA', '3171015608950002', 'DKI JAKARTA')}
                    className="p-2 rounded-xl bg-[#091f13] hover:bg-[#0e2d1c] border border-emerald-500/25 text-left transition-colors cursor-pointer"
                  >
                    <span className="text-[11px] font-bold text-emerald-300 block">BAMBANG WIJAYA</span>
                    <span className="text-[9px] text-neutral-400 font-mono block">NIK: 317101******0002</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLoadSampleKtp('SITI NURHALIZA', '3273056704940003', 'BANDUNG')}
                    className="p-2 rounded-xl bg-[#091f13] hover:bg-[#0e2d1c] border border-emerald-500/25 text-left transition-colors cursor-pointer"
                  >
                    <span className="text-[11px] font-bold text-emerald-300 block">SITI NURHALIZA</span>
                    <span className="text-[9px] text-neutral-400 font-mono block">NIK: 327305******0003</span>
                  </button>
                </div>
              </div>

              {/* Detailed KTP Fields */}
              <div className="space-y-3 pt-1">
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                    Nama Lengkap Sesuai KTP <span className="text-emerald-400">*</span>
                  </label>
                  <input
                    id="input-kyc-fullname"
                    type="text"
                    value={fullNameInput}
                    onChange={(e) => setFullNameInput(e.target.value)}
                    placeholder="Contoh: BAMBANG WIJAYA"
                    className="w-full bg-[#0a1b11] border border-emerald-500/30 rounded-xl px-3.5 py-2.5 text-xs text-white uppercase placeholder-neutral-500 focus:outline-none focus:border-emerald-400 font-medium"
                  />
                  <span className="text-[10px] text-emerald-400/80 block mt-1">
                    ⚠️ Nama ini akan dicatat & dikunci sebagai nama pemilik rekening penarikan bank Anda.
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                      NIK (16 Digit) <span className="text-emerald-400">*</span>
                    </label>
                    <input
                      id="input-kyc-nik"
                      type="text"
                      maxLength={16}
                      value={nikInput}
                      onChange={(e) => setNikInput(e.target.value.replace(/\D/g, ''))}
                      placeholder="3171015608950002"
                      className="w-full bg-[#0a1b11] border border-emerald-500/30 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono placeholder-neutral-500 focus:outline-none focus:border-emerald-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                      Tanggal Lahir
                    </label>
                    <input
                      type="date"
                      value={birthDateInput}
                      onChange={(e) => setBirthDateInput(e.target.value)}
                      className="w-full bg-[#0a1b11] border border-emerald-500/30 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                    Alamat / Kota Domisili
                  </label>
                  <input
                    type="text"
                    value={addressInput}
                    onChange={(e) => setAddressInput(e.target.value)}
                    placeholder="Contoh: Jakarta Selatan, DKI Jakarta"
                    className="w-full bg-[#0a1b11] border border-emerald-500/30 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-400"
                  />
                </div>
              </div>

              {errorMessage && (
                <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs">
                  {errorMessage}
                </div>
              )}

              {/* Submit Button */}
              <button
                id="btn-submit-kyc-ai"
                onClick={handleStartAiVerification}
                disabled={!fullNameInput.trim()}
                className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
              >
                <Sparkles className="w-4 h-4 fill-black" />
                <span>Verifikasi KTP Otomatis dengan AI</span>
              </button>
            </div>
          )}

          {/* STEP 2: AI PROCESSING ANIMATION */}
          {step === 'processing' && (
            <div className="py-10 text-center space-y-6">
              <div className="relative w-20 h-20 mx-auto">
                <div className="absolute inset-0 rounded-full border-4 border-emerald-500/20 animate-ping" />
                <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center text-emerald-400 shadow-xl shadow-emerald-500/30">
                  <Sparkles className="w-9 h-9 animate-pulse" />
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-white text-base">Gemini AI Memproses e-KTP</h4>
                <p className="text-xs text-emerald-300 font-mono animate-pulse">{processingStatus}</p>
                <p className="text-[11px] text-neutral-400 max-w-xs mx-auto">
                  Sistem mengekstrak NIK & Nama Resmi KTP secara otomatis untuk perlindungan penarikan dana.
                </p>
              </div>

              <div className="w-48 mx-auto bg-emerald-950/80 rounded-full h-1.5 overflow-hidden">
                <div className="bg-emerald-400 h-full rounded-full animate-[progress_2s_ease-in-out_infinite]" style={{ width: '80%' }} />
              </div>
            </div>
          )}

          {/* STEP 3: VERIFICATION RESULT / ALREADY VERIFIED */}
          {step === 'result' && (
            <div className="space-y-4">
              {/* Success Badge */}
              <div className="p-4 rounded-2xl bg-[#092214] border border-emerald-500/40 text-center space-y-2">
                <div className="w-12 h-12 mx-auto rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h4 className="font-bold text-white text-base">KYC AI Terverifikasi</h4>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold font-mono">
                  <Zap className="w-3.5 h-3.5 fill-emerald-400 text-emerald-400" />
                  <span>+25 Energy Gratis Masuk ke Saldo!</span>
                </div>
                <p className="text-[11px] text-emerald-300/90">
                  Identitas resmi Anda telah terverifikasi secara sah. Bonus 25 Energy telah otomatis masuk dan Anda kini memiliki akses penuh untuk penarikan komisi.
                </p>
              </div>

              {/* Locked Identity Card */}
              <div className="p-4 rounded-2xl bg-[#0b1d12] border border-emerald-500/30 space-y-3 relative overflow-hidden">
                <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2.5">
                  <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Identitas Rekening Terkunci (Locked)</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono text-[10px] font-bold border border-emerald-500/30">
                    VERIFIED
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div>
                    <span className="text-[10px] text-neutral-400 block font-sans">Nama Resmi Sesuai KTP:</span>
                    <span className="text-sm font-black text-white font-mono tracking-wide block">
                      {verifiedResult?.fullName || currentUser.kycFullName}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-emerald-500/10">
                    <div>
                      <span className="text-[10px] text-neutral-400 block">NIK Terdaftar:</span>
                      <span className="text-xs font-mono font-bold text-emerald-400">
                        {verifiedResult?.nik ? `${verifiedResult.nik.slice(0, 6)}******${verifiedResult.nik.slice(-2)}` : '317101******0002'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-neutral-400 block">Metode Validasi:</span>
                      <span className="text-xs font-mono font-bold text-emerald-300">
                        Google Gemini OCR
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-[#06140b] border border-emerald-500/20 text-[10px] text-neutral-300 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Nama di atas otomatis dikunci pada formulir pembukaan rekening bank penarikan Anda.</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-2">
                {onProceedToWithdraw && (
                  <button
                    id="btn-proceed-to-withdrawal"
                    onClick={() => {
                      onClose();
                      onProceedToWithdraw();
                    }}
                    className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
                  >
                    <Building2 className="w-4 h-4" />
                    <span>Lanjut ke Penarikan Komisi (Withdrawal)</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
                
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-2.5 rounded-xl bg-[#0d2216] hover:bg-[#122e1e] border border-emerald-500/20 text-neutral-300 font-semibold text-xs transition-colors cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
