import React from 'react';
import { ArrowLeft, ShieldCheck } from 'lucide-react';

type LegalPageKind = 'terms' | 'privacy';

interface LegalPageProps {
  kind: LegalPageKind;
  onBack: () => void;
}

const sections = {
  terms: [
    ['Tentang Scrolic', 'Scrolic adalah platform social trading dan edukasi finansial. Scrolic bukan broker, perusahaan sekuritas, penasihat investasi, atau pengelola dana pengguna. Data trading berasal dari akun trading pengguna yang dihubungkan melalui integrasi pihak ketiga seperti cTrader Open API.'],
    ['Akun User', 'Pengguna bertanggung jawab atas keamanan akunnya dan wajib memberikan data yang benar. Pengguna hanya boleh menghubungkan akun trading miliknya sendiri serta wajib menjaga kredensial dan akses integrasi.'],
    ['Konten Trader', 'Trader dapat membagikan aktivitas trading, strategi, performa, dan insight. Performa masa lalu tidak menjamin hasil masa depan. Setiap pengguna wajib melakukan analisis sendiri sebelum mengambil keputusan.'],
    ['Sistem Energy', 'Energy adalah kredit digital internal Scrolic untuk fitur premium seperti Unlock Trading Detail, Tanya AI, dan fitur premium lainnya. Energy bukan uang elektronik, bukan alat pembayaran umum, dan tidak dapat dianggap sebagai investasi.'],
    ['Monetisasi Platform', 'Pada fitur Unlock Trading Detail, sebagian revenue dapat diberikan kepada trader creator dan sebagian menjadi revenue platform. Tanya AI merupakan layanan premium Scrolic. Trade Now menggunakan mekanisme fee sesuai sistem yang berlaku dan ditampilkan pada proses penggunaan.'],
    ['Referral Program', 'Pengguna dapat memperoleh bonus melalui referral. Program referral dapat menggunakan sistem multi-level sesuai aturan platform. Scrolic dapat mengubah, menangguhkan, atau menghentikan program jika diperlukan.'],
    ['Risiko Trading', 'Trading memiliki risiko kehilangan sebagian atau seluruh modal. Scrolic tidak menjamin profit dan tidak memberikan jaminan atas hasil trading. Seluruh keputusan trading merupakan tanggung jawab pengguna.'],
    ['Perubahan Layanan', 'Scrolic dapat memperbarui fitur, harga, sistem reward, integrasi, dan kebijakan. Perubahan dapat berlaku setelah dipublikasikan melalui layanan atau kanal komunikasi yang tersedia.'],
    ['Penghentian Akun', 'Scrolic dapat membatasi, menangguhkan, atau menghentikan akun yang melakukan penyalahgunaan, pelanggaran hukum, manipulasi, penipuan, atau pelanggaran ketentuan ini.'],
    ['Kontak', 'Pertanyaan mengenai Syarat & Ketentuan dapat dikirim ke Support@scrolic.id.'],
  ],
  privacy: [
    ['Informasi yang Dikumpulkan', 'Kami dapat mengumpulkan nama, email, avatar, data profil, interaksi feed, transaksi Energy, penggunaan fitur, dan informasi akun trading yang diberikan melalui API resmi. Scrolic tidak meminta atau menyimpan password broker.'],
    ['Penggunaan Data', 'Data digunakan untuk menyediakan layanan Scrolic, menampilkan feed trading, menganalisis performa trader, meningkatkan keamanan, serta memberikan rekomendasi dan fitur AI.'],
    ['Integrasi Pihak Ketiga', 'Scrolic dapat menggunakan Google OAuth untuk autentikasi, cTrader Open API untuk koneksi data trading, payment gateway untuk transaksi Energy, dan AI Service untuk fitur analisis. Masing-masing pihak ketiga memiliki ketentuan dan kebijakan privasi sendiri.'],
    ['Data Trading', 'Scrolic hanya membaca data yang diberikan melalui izin pengguna. Scrolic tidak melakukan transaksi tanpa persetujuan pengguna. Pengguna dapat mencabut koneksi akun trading melalui fitur yang tersedia atau meminta bantuan dukungan.'],
    ['Fitur AI', 'Tanya AI menggunakan data yang tersedia untuk membantu analisis. AI bukan penasihat keuangan, tidak menggantikan analisis pengguna, dan hasilnya tidak menjamin profit.'],
    ['Keamanan Data', 'Scrolic menggunakan praktik keamanan standar yang wajar untuk melindungi data. Data tidak dijual kepada pihak ketiga. Akses dapat dibagikan secara terbatas kepada penyedia layanan yang diperlukan untuk menjalankan platform.'],
    ['Cookies dan Analytics', 'Scrolic dapat menggunakan cookies, local storage, session token, dan analytics untuk mempertahankan sesi, menyimpan preferensi, memahami penggunaan layanan, serta meningkatkan pengalaman pengguna.'],
    ['Hak User', 'Pengguna dapat mengubah data profil, meminta penghapusan akun, dan mencabut integrasi pihak ketiga sesuai proses verifikasi dan hukum yang berlaku. Permintaan dapat dikirim ke kontak Scrolic.'],
    ['Perubahan Privacy Policy', 'Scrolic dapat memperbarui kebijakan privasi untuk mencerminkan perubahan layanan, teknologi, atau hukum. Tanggal pembaruan akan ditampilkan pada halaman ini.'],
    ['Kontak', 'Permintaan terkait privasi dapat dikirim ke Support@scrolic.id.'],
  ],
} as const;

export const LegalPage: React.FC<LegalPageProps> = ({ kind, onBack }) => {
  const isTerms = kind === 'terms';
  const title = isTerms ? 'Terms & Conditions' : 'Privacy Policy';
  const intro = isTerms
    ? 'Ketentuan penggunaan platform social trading dan edukasi finansial Scrolic.'
    : 'Penjelasan mengenai pengumpulan, penggunaan, dan perlindungan data pengguna Scrolic.';

  return (
    <div className="min-h-screen w-full bg-[#050505] px-4 py-6 text-neutral-200 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 flex items-center justify-between border-b border-emerald-500/20 pb-5">
          <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-xs font-bold text-emerald-400 transition-colors hover:text-emerald-300">
            <ArrowLeft className="h-4 w-4" /> Kembali ke Scrolic
          </button>
          <div className="flex items-center gap-2 text-xs font-black tracking-wide text-emerald-300">
            <ShieldCheck className="h-4 w-4" /> SCROLIC
          </div>
        </header>

        <main>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">Dokumen Legal</p>
          <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">{title}</h1>
          <p className="mt-3 text-sm leading-6 text-neutral-400">{intro}</p>
          <p className="mt-2 text-xs text-neutral-500">Terakhir diperbarui: 26 Februari 2026</p>

          <div className="mt-8 space-y-7">
            {sections[kind].map(([heading, content], index) => (
              <section key={heading}>
                <h2 className="text-lg font-extrabold text-white">{index + 1}. {heading}</h2>
                <p className="mt-2 text-sm leading-7 text-neutral-300">{content}</p>
              </section>
            ))}
          </div>
        </main>

        <footer className="mt-10 flex flex-wrap gap-x-5 gap-y-2 border-t border-emerald-500/20 pt-5 text-xs text-neutral-500">
          <a href="/terms" className={isTerms ? 'text-emerald-400' : 'hover:text-emerald-300'}>Terms &amp; Conditions</a>
          <a href="/privacy-policy" className={!isTerms ? 'text-emerald-400' : 'hover:text-emerald-300'}>Privacy Policy</a>
          <a href="mailto:Support@scrolic.id" className="hover:text-emerald-300">Kontak</a>
        </footer>
      </div>
    </div>
  );
};
