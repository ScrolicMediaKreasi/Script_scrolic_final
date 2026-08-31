import React, { useEffect } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CircleHelp,
  Coins,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Zap
} from 'lucide-react';
import { updatePageSEO } from '../utils/seo';

type PublicPageKind = 'about' | 'pricing' | 'faq';

interface PublicInfoPageProps {
  kind: PublicPageKind;
  onBack: () => void;
  onNavigate: (path: string) => void;
  onOpenLogin: () => void;
}

const faqItems = [
  ['Apa itu Scrolic?', 'Scrolic adalah platform social trading yang membantu user mempelajari insight trading dan performa trader.'],
  ['Apakah Scrolic adalah broker?', 'Tidak. Scrolic bukan broker dan tidak menyediakan layanan perdagangan langsung.'],
  ['Apakah Scrolic menyimpan dana user?', 'Tidak. Dana tetap berada pada akun broker atau platform masing-masing user.'],
  ['Bagaimana cara kerja Energy?', 'Energy digunakan untuk membuka fitur tertentu seperti detail trading dan analisis AI.'],
  ['Apa itu Tanya AI di Scrolic?', 'Tanya AI membantu menganalisis performa trader dan aktivitas trading berdasarkan data yang tersedia.'],
  ['Apakah Scrolic memberikan sinyal trading?', 'Scrolic menyediakan insight dan edukasi, bukan jaminan sinyal atau rekomendasi investasi.'],
  ['Bagaimana cara mengikuti trader?', 'User dapat mengikuti trader untuk mempelajari aktivitas dan performa mereka.'],
  ['Apakah trading memiliki risiko?', 'Ya. Semua aktivitas trading memiliki risiko kehilangan modal.'],
  ['Apa itu social trading Indonesia?', 'Social trading Indonesia adalah pendekatan belajar melalui insight dan pengalaman trader lain dengan tetap melakukan analisis mandiri.'],
  ['Bagaimana cara belajar trading online?', 'Mulai dari memahami risiko, membaca insight trader, mempelajari strategi, dan menguji pemahaman secara bertanggung jawab.'],
  ['Bagaimana analisis performa trader dilakukan?', 'Scrolic menyajikan data aktivitas dan performa yang tersedia dari akun atau konten trader yang dibagikan.'],
  ['Apakah Scrolic platform edukasi trading?', 'Ya. Scrolic membantu komunitas belajar dari aktivitas trading, strategi, dan diskusi yang tersedia.'],
];

const pageMeta = {
  about: {
    title: 'About Scrolic | Social trading Platform',
    description: 'Kenali Scrolic, platform social trading dan edukasi trading untuk belajar dari insight serta performa trader.',
    eyebrow: 'Tentang Scrolic',
    heading: 'Platform edukasi trading yang menyatukan insight, performa trader, dan komunitas belajar.'
  },
  pricing: {
    title: 'Harga dan Paket Scrolic | Energy & Premium',
    description: 'Pelajari paket Energy dan membership premium Scrolic untuk mengakses insight trading dan analisis AI.',
    eyebrow: 'Harga & Paket',
    heading: 'Mulai belajar dengan akses yang jelas, terukur, dan sesuai kebutuhan.'
  },
  faq: {
    title: 'FAQ Scrolic | Pertanyaan Social Trading & Trading',
    description: 'Temukan jawaban tentang Scrolic, social trading, Energy, Tanya AI, risiko trading, dan edukasi trading online.',
    eyebrow: 'Pusat Bantuan',
    heading: 'Semua yang perlu Anda tahu sebelum masuk ke komunitas Scrolic.'
  },
};

export const PublicInfoPage: React.FC<PublicInfoPageProps> = ({ kind, onBack, onNavigate, onOpenLogin }) => {
  const meta = pageMeta[kind];

  useEffect(() => {
    const jsonLd = kind === 'faq'
      ? {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: faqItems.map(([name, text]) => ({
            '@type': 'Question',
            name,
            acceptedAnswer: { '@type': 'Answer', text }
          }))
        }
      : kind === 'pricing'
        ? {
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: 'Scrolic Energy',
            description: meta.description,
            brand: { '@type': 'Brand', name: 'Scrolic' },
            offers: { '@type': 'Offer', price: '1000', priceCurrency: 'IDR', url: `${window.location.origin}/pricing` }
          }
        : {
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: 'Scrolic',
            url: window.location.origin,
            description: meta.description
          };

    updatePageSEO({
      title: meta.title,
      description: meta.description,
      url: `${window.location.origin}/${kind}`,
      jsonLd
    });
  }, [kind, meta.description, meta.title]);

  return (
    <div className="min-h-screen w-full bg-[#050505] px-4 py-5 text-neutral-200 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <header className="flex items-center justify-between border-b border-emerald-500/20 pb-4">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 text-xs font-bold text-emerald-400 transition hover:text-emerald-300"
          >
            <ArrowLeft className="h-4 w-4" />
            Kembali ke Scrolic
          </button>

          <div className="flex items-center gap-2 text-[11px] font-black tracking-[0.18em] text-emerald-300 uppercase">
            <ShieldCheck className="h-4 w-4" />
            Scrolic
          </div>
        </header>

        <main className="py-8 sm:py-10">
          <div className="mb-8 rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-[#07130c] via-[#0b1710] to-[#050505] p-5 shadow-2xl shadow-emerald-950/20 sm:p-8">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300">
                {meta.eyebrow}
              </span>
              <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold text-neutral-300">
                Scroll • Trade • Earn
              </span>
            </div>

            <h1 className="mt-4 max-w-3xl text-3xl font-black leading-tight text-white sm:text-5xl">
              {meta.heading}
            </h1>

            <p className="mt-4 max-w-2xl text-sm leading-7 text-neutral-400 sm:text-base">
              {meta.description}
            </p>
          </div>

          {kind === 'about' && <AboutContent onNavigate={onNavigate} onOpenLogin={onOpenLogin} />}
          {kind === 'pricing' && <PricingContent onNavigate={onNavigate} onOpenLogin={onOpenLogin} />}
          {kind === 'faq' && <FaqContent />}
        </main>

        <footer className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-emerald-500/20 py-6 text-xs text-neutral-500">
          <button type="button" onClick={() => onNavigate('/about')} className="transition hover:text-emerald-300">About</button>
          <button type="button" onClick={() => onNavigate('/pricing')} className="transition hover:text-emerald-300">Pricing</button>
          <button type="button" onClick={() => onNavigate('/faq')} className="transition hover:text-emerald-300">FAQ</button>
          <a href="/terms" className="transition hover:text-emerald-300">Terms &amp; Conditions</a>
          <a href="/privacy-policy" className="transition hover:text-emerald-300">Privacy Policy</a>
        </footer>
      </div>
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="mt-8 rounded-3xl border border-white/10 bg-[#0a1410]/90 p-5 shadow-xl shadow-black/10 sm:p-6">
    <h2 className="text-xl font-black text-white sm:text-2xl">{title}</h2>
    <div className="mt-4 text-sm leading-7 text-neutral-300">{children}</div>
  </section>
);

const LinkButton: React.FC<{ children: React.ReactNode; onClick: () => void }> = ({ children, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-extrabold text-black transition hover:bg-emerald-400"
  >
    {children}
    <ArrowRight className="h-4 w-4" />
  </button>
);

const Feature: React.FC<{ icon: React.ReactNode; text: string }> = ({ icon, text }) => (
  <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-[#0d2017] p-4 text-sm font-bold text-neutral-200">
    <span className="text-emerald-400">{icon}</span>
    {text}
  </div>
);

const AboutContent: React.FC<{ onNavigate: (path: string) => void; onOpenLogin: () => void }> = ({ onNavigate, onOpenLogin }) => (
  <>
    <Section title="Apa itu Scrolic?">
      <p>
        Scrolic adalah platform social trading dan edukasi trading yang membantu user belajar dari insight,
        aktivitas, dan performa trader lain tanpa mengubah fokus utama pada analisis mandiri.
      </p>
      <p className="mt-3 font-bold text-emerald-300">Scroll • Discover • Learn • Improve</p>
      <p className="mt-3">
        Scrolic bukan broker, bukan exchange, dan bukan penyedia layanan trading langsung. Platform ini berperan sebagai
        ruang belajar, insight, dan komunitas untuk memahami strategi dan performa trader secara lebih transparan.
      </p>
    </Section>

    <Section title="Cara kerja platform">
      <ol className="list-decimal space-y-2 pl-5 text-neutral-300">
        <li>Temukan trader dan setup trading yang relevan dari feed Scrolic.</li>
        <li>Buka detail performa, setup, dan aktivitas melalui Energy atau akses yang sesuai.</li>
        <li>Gunakan insight untuk belajar pola, manajemen risiko, dan keputusan trading.</li>
        <li>Evaluasi dan tingkatkan pemahaman trading Anda secara konsisten.</li>
      </ol>
    </Section>

    <Section title="Keunggulan Scrolic">
      <div className="grid gap-3 sm:grid-cols-2">
        <Feature icon={<TrendingUp className="h-4 w-4" />} text="Social trading insight" />
        <Feature icon={<ShieldCheck className="h-4 w-4" />} text="Performance trader transparan" />
        <Feature icon={<CircleHelp className="h-4 w-4" />} text="AI analisis untuk belajar" />
        <Feature icon={<Zap className="h-4 w-4" />} text="Realtime market learning" />
      </div>
    </Section>

    <div className="mt-8 flex flex-wrap gap-3">
      <LinkButton onClick={() => onNavigate('/explore')}>Jelajahi insight trader</LinkButton>
      <button
        type="button"
        onClick={onOpenLogin}
        className="rounded-xl border border-emerald-500/40 bg-[#0b1d15] px-4 py-3 text-sm font-bold text-emerald-300 transition hover:bg-emerald-500/10"
      >
        Masuk / Daftar
      </button>
    </div>
  </>
);

const PricingContent: React.FC<{ onNavigate: (path: string) => void; onOpenLogin: () => void }> = ({ onNavigate, onOpenLogin }) => (
  <>
    <div className="mt-8 grid gap-4 lg:grid-cols-3">
      <div className="rounded-3xl border border-white/10 bg-[#0d1712] p-5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">Free</p>
        <div className="mt-4 text-3xl font-black text-white">Rp 0</div>
        <p className="mt-3 text-sm text-neutral-400">Akses dasar untuk mulai belajar dari feed dan komunitas trading.</p>
        <ul className="mt-4 space-y-2 text-sm text-neutral-300">
          <li className="flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-emerald-400" /> Feed publik</li>
          <li className="flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-emerald-400" /> Insight dasar</li>
          <li className="flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-emerald-400" /> Komunitas belajar</li>
        </ul>
      </div>

      <div className="rounded-3xl border border-emerald-500/40 bg-gradient-to-br from-emerald-500/15 to-[#0b1710] p-5 shadow-xl shadow-emerald-950/30">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">Energy</p>
        <div className="mt-4 flex items-end gap-2">
          <span className="text-3xl font-black text-white">Rp 1.000</span>
          <span className="pb-1 text-xs text-neutral-400">/ 1 Energy</span>
        </div>
        <p className="mt-3 text-sm text-neutral-300">
          Energy digunakan untuk membuka fitur lanjutan seperti detail trading dan analisis AI sesuai kebijakan platform.
        </p>
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          <Coins className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <span>Energy adalah kredit internal untuk akses fitur tertentu, bukan dana investasi atau uang elektronik.</span>
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-[#0d1712] p-5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">Premium</p>
        <div className="mt-4 text-3xl font-black text-white">Custom</div>
        <p className="mt-3 text-sm text-neutral-400">Akses pengalaman lebih lengkap untuk pengguna yang ingin belajar lebih dalam.</p>
        <ul className="mt-4 space-y-2 text-sm text-neutral-300">
          <li className="flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-emerald-400" /> Analisis lebih dalam</li>
          <li className="flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-emerald-400" /> Premium support</li>
          <li className="flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-emerald-400" /> Akses fitur tertentu</li>
        </ul>
      </div>
    </div>

    <div className="mt-8 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm leading-6 text-amber-200">
      Scrolic menyediakan informasi dan edukasi. Trading memiliki risiko dan tidak menjamin keuntungan.
    </div>

    <div className="mt-8 flex flex-wrap gap-3">
      <LinkButton onClick={onOpenLogin}>Mulai dengan Scrolic</LinkButton>
      <button
        type="button"
        onClick={() => onNavigate('/faq')}
        className="rounded-xl border border-emerald-500/40 bg-[#0b1d15] px-4 py-3 text-sm font-bold text-emerald-300 transition hover:bg-emerald-500/10"
      >
        Baca FAQ
      </button>
    </div>
  </>
);

const FaqContent: React.FC = () => (
  <div className="mt-8 space-y-3">
    {faqItems.map(([question, answer]) => (
      <details key={question} className="group rounded-2xl border border-white/10 bg-[#0a1410] p-5">
        <summary className="cursor-pointer list-none pr-6 text-base font-bold text-white transition group-open:text-emerald-300">
          {question}
        </summary>
        <p className="mt-3 text-sm leading-7 text-neutral-300">{answer}</p>
      </details>
    ))}
  </div>
);
