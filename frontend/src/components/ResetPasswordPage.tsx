import React, { useState } from 'react';
import { ArrowLeft, Lock, ShieldCheck } from 'lucide-react';

interface ResetPasswordPageProps {
  token: string;
  onBack: () => void;
}

export const ResetPasswordPage: React.FC<ResetPasswordPageProps> = ({ token, onBack }) => {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 8) return setError('Password minimal 8 karakter');
    if (password !== confirmation) return setError('Konfirmasi password tidak sama');
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'Token reset tidak valid');
      setMessage('Password berhasil diperbarui. Silakan kembali untuk login.');
    } catch (err: any) {
      setError(err.message || 'Reset password gagal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#050505] px-4 py-6 text-neutral-200 sm:px-6">
      <div className="mx-auto max-w-md">
        <button type="button" onClick={onBack} className="mb-8 inline-flex items-center gap-2 text-xs font-bold text-emerald-400 hover:text-emerald-300">
          <ArrowLeft className="h-4 w-4" /> Kembali ke Scrolic
        </button>
        <div className="rounded-3xl border border-emerald-500/30 bg-[#07130c] p-6 shadow-2xl">
          <ShieldCheck className="mb-4 h-8 w-8 text-emerald-400" />
          <h1 className="text-2xl font-black text-white">Reset Password</h1>
          <p className="mt-2 text-sm text-neutral-400">Buat password baru untuk akun Scrolic Anda.</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block text-xs font-semibold text-neutral-300">
              Password baru
              <div className="relative mt-1">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-neutral-500" />
                <input type="password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-xl border border-emerald-500/40 bg-[#0a1b11] py-2.5 pl-9 pr-3 text-sm text-white outline-none focus:border-emerald-400" />
              </div>
            </label>
            <label className="block text-xs font-semibold text-neutral-300">
              Konfirmasi password
              <input type="password" minLength={8} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-1 w-full rounded-xl border border-emerald-500/40 bg-[#0a1b11] px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-400" />
            </label>
            {error && <p className="rounded-xl border border-rose-500/30 bg-rose-500/15 p-3 text-xs text-rose-300">{error}</p>}
            {message && <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/15 p-3 text-xs text-emerald-300">{message}</p>}
            <button type="submit" disabled={loading || Boolean(message)} className="w-full rounded-xl bg-emerald-500 py-3 text-sm font-extrabold text-black disabled:opacity-50">{loading ? 'Memproses...' : 'Simpan Password Baru'}</button>
          </form>
        </div>
      </div>
    </div>
  );
};