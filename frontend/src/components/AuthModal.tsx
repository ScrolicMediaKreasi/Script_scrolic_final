import React, { useState, useEffect } from 'react';
import { 
  X, 
  Sparkles, 
  CheckCircle2, 
  Lock,
  ArrowRight,
  ShieldCheck,
  Mail
} from 'lucide-react';
import { User } from '../types';
import { ScrolicLogo } from './ScrolicLogo';
import { triggerHaptic } from '../utils/haptics';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: User) => void;
  promptReason?: string | null;
  initialReferralCode?: string | null;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  promptReason,
  initialReferralCode
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [referralCode, setReferralCode] = useState(initialReferralCode || '');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [legalConsent, setLegalConsent] = useState(false);

  useEffect(() => {
    const savedRef = localStorage.getItem('scrolic_ref_code');
    if (initialReferralCode) {
      setReferralCode(initialReferralCode);
    } else if (savedRef) {
      setReferralCode(savedRef);
    }
  }, [initialReferralCode, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setLegalConsent(false);
      setError(null);
    }
  }, [isOpen]);

  const hasLegalConsent = () => {
    if (legalConsent) return true;
    setError('Centang persetujuan Terms & Conditions dan Privacy Policy untuk melanjutkan');
    return false;
  };

  const completeAuth = (user: User) => {
    const uid = user.id || user.username;
    localStorage.setItem('scrolic_user_id', uid);
    document.cookie = `scrolic_uid=${encodeURIComponent(uid)}; path=/; max-age=31536000; SameSite=Lax`;
    triggerHaptic('success');
    onLoginSuccess(user);
    onClose();
  };

  const resetAuthState = () => {
    setError(null);
    setSuccessMessage(null);
  };

  if (!isOpen) return null;

  const handleCustomEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim()) {
      setError('Masukkan alamat email Anda');
      return;
    }
    await handlePasswordAuth();
  };

  const handlePasswordAuth = async () => {
    if (!hasLegalConsent()) return;
    if (!emailInput.trim() || !passwordInput) {
      setError('Masukkan email dan password untuk melanjutkan');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: emailInput.trim(),
          password: passwordInput,
          termsAccepted: true,
          privacyAccepted: true,
          legalVersion: '2026-02-26'
        })
      });
      const data = await response.json();
      if (!response.ok || !data.user) {
        throw new Error(data.error?.message || 'Email atau password salah');
      }
      completeAuth(data.user);
    } catch (err: any) {
      setError(err.message || 'Autentikasi email gagal');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    const trimmed = forgotEmail.trim();
    if (!trimmed) {
      setError('Masukkan email akun Anda untuk reset password');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch('/api/auth/password-reset/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || 'Gagal mengirim instruksi reset password');
      }
      setSuccessMessage('Jika email terdaftar, instruksi reset password telah dikirim.');
      setForgotEmail('');
    } catch (err: any) {
      setError(err.message || 'Gagal mengirim instruksi reset password');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-[#07130c] border border-[#18633c]/40 rounded-3xl p-6 shadow-2xl shadow-black/90 overflow-hidden text-neutral-200 max-h-[90vh] overflow-y-auto">
        
        {/* Glow backdrop accent */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-[#18633c]/30 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-[#0d2216] border border-emerald-500/20 text-neutral-400 hover:text-white hover:bg-[#143322] transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header Branding */}
        <div className="text-center mb-5">
          <div className="inline-flex items-center justify-center mb-3">
            <ScrolicLogo size={56} />
          </div>
          <h2 className="text-xl font-black text-white tracking-tight flex items-center justify-center gap-2">
            Masuk ke Scrolic
            <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              cTrader
            </span>
          </h2>
          <p className="text-xs text-emerald-400/80 mt-1 font-medium">
            Scroll • Trade • Earn
          </p>

          {promptReason && (
            <div className="mt-3 p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 text-left">
              <Lock className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{promptReason}</span>
            </div>
          )}

          {referralCode && (
            <div className="mt-2.5 p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-semibold">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>Undangan Referral:</span>
              </div>
              <span className="font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-200">
                {referralCode}
              </span>
            </div>
          )}
        </div>

        <label className="mb-4 flex items-start gap-2 text-[11px] text-neutral-400 cursor-pointer">
          <input
            id="input-legal-consent"
            type="checkbox"
            checked={legalConsent}
            onChange={(e) => {
              setLegalConsent(e.target.checked);
              if (e.target.checked) setError(null);
            }}
            className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-500 cursor-pointer"
          />
          <span>
            Saya menyetujui{' '}
            <a className="text-emerald-400 hover:text-emerald-300 underline" href="/terms" target="_blank" rel="noreferrer">Terms &amp; Conditions</a>
            {' '}dan{' '}
            <a className="text-emerald-400 hover:text-emerald-300 underline" href="/privacy-policy" target="_blank" rel="noreferrer">Privacy Policy</a> Scrolic.
          </span>
        </label>

        {/* Error notification */}
        {error && (
          <div className="mb-4 p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <X className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {successMessage && (
          <div className="mb-4 p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successMessage}</span>
          </div>
        )}

        {!isForgotPassword ? (
          <form onSubmit={handleCustomEmailSubmit} className="space-y-3">
          <div>
            <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
              Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-neutral-400 absolute left-3 top-3" />
              <input
                id="input-email"
                data-testid="input-auth-email"
                type="email"
                required
                value={emailInput}
                onChange={(e) => {
                  setEmailInput(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="namaanda@gmail.com"
                className="w-full pl-9 pr-3 py-2.5 bg-[#0a1b11] border border-[#18633c]/50 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
              Password
            </label>
            <input
              id="input-password"
              data-testid="input-auth-password"
              type="password"
              required
              minLength={8}
              value={passwordInput}
              onChange={(e) => {
                setPasswordInput(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Minimal 8 karakter"
              className="w-full px-3 py-2.5 bg-[#0a1b11] border border-[#18633c]/50 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>

          <button
            id="btn-submit-email-login"
            data-testid="btn-auth-submit"
            type="submit"
            disabled={isSubmitting || !legalConsent}
            className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
          >
            <span>{isSubmitting ? 'Memproses Akun...' : 'Masuk / Daftar dengan Email'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => {
              resetAuthState();
              setIsForgotPassword(true);
            }}
            className="w-full text-center text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 underline"
          >
            Lupa Password?
          </button>
        </form>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                Email akun
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-neutral-400 absolute left-3 top-3" />
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => {
                    setForgotEmail(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="namaanda@gmail.com"
                  className="w-full pl-9 pr-3 py-2.5 bg-[#0a1b11] border border-[#18633c]/50 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={isSubmitting || !legalConsent}
              className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? 'Mengirim...' : 'Kirim Link Reset Password'}
            </button>

            <button
              type="button"
              onClick={() => {
                resetAuthState();
                setIsForgotPassword(false);
              }}
              className="w-full text-center text-[11px] font-semibold text-neutral-300 hover:text-white underline"
            >
              Kembali ke login
            </button>
          </div>
        )}

        {/* Post-Login Feature Highlights */}
        <div className="mt-5 pt-4 border-t border-[#18633c]/30 space-y-2 text-[11px] text-neutral-400">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Akun cTrader dapat ditambahkan langsung setelah masuk</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>1 Open Position di cTrader = 1 Feed Post Otomatis</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Bonus 25 Energy Gratis (KYC) & Komisi Afiliasi hingga 5 Generasi</span>
          </div>
          <div className="flex items-center gap-2 pt-1 text-[10px] text-emerald-500/70">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            <span>Enkripsi 256-bit & Data Tersimpan Persisten di Database Cloud</span>
          </div>
        </div>
      </div>
    </div>
  );
};
