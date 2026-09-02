import { Strategy } from '../types';

export const STRATEGIES: Record<string, Strategy> = {
  breakout: {
    id: 'breakout',
    name: 'Breakout',
    tagline: 'Explosive Momentum upon Key Level Penetration',
    description: 'Menangkap pergerakan kuat saat harga menembus level resisten/support krusial dengan konfirmasi volume tinggi.',
    defaultNote: 'Breakout strategy trading real-time untuk trader forex, crypto, dan komoditas yang mencari momentum pasar saat harga menembus support resistance utama. Strategi breakout ini fokus pada eksekusi cTrader cepat, entry yang terukur, dan manajemen risiko yang disiplin untuk hasil trading yang lebih konsisten.',
    accentColor: '#F59E0B', // Amber
    accentBg: 'bg-amber-500/15',
    accentBorder: 'border-amber-500/30',
    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    gradient: 'from-amber-500/25 via-amber-600/10 to-transparent',
    positionBarGradient: 'from-amber-600 via-amber-400 to-emerald-400',
    fontVibe: 'font-display tracking-tight font-extrabold',
    icon: 'Zap',
    popularPairs: ['XAUUSD', 'BTCUSD', 'GBPUSD'],
    riskStyle: 'High Reward (1:2 - 1:4)'
  },
  scalping: {
    id: 'scalping',
    name: 'Scalping',
    tagline: 'Micro Pips Extraction in Sub-Minute Timeframes',
    description: 'Eksekusi presisi tinggi berkecepatan kilat untuk mengambil 5-15 pips memanfaatkan volatilitas likuiditas instan.',
    defaultNote: 'Scalping strategy forex dan crypto yang fokus pada eksekusi cepat, pergerakan harga jangka pendek, serta manajemen risiko ketat. Strategi scalping ini cocok untuk trader yang ingin memanfaatkan volatilitas pasar real-time di sesi aktif dengan target profit kecil namun konsisten.',
    accentColor: '#06B6D4', // Cyan
    accentBg: 'bg-cyan-500/15',
    accentBorder: 'border-cyan-500/30',
    badgeClass: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
    gradient: 'from-cyan-500/25 via-cyan-600/10 to-transparent',
    positionBarGradient: 'from-cyan-600 via-cyan-400 to-teal-300',
    fontVibe: 'font-mono tracking-wider font-bold',
    icon: 'Activity',
    popularPairs: ['EURUSD', 'USDJPY', 'NAS100'],
    riskStyle: 'Tight SL (1:1 - 1:1.5)'
  },
  swing: {
    id: 'swing',
    name: 'Swing Trading',
    tagline: 'Riding Multi-Day Market Swings & Macro Waves',
    description: 'Menangkap gelombang ayunan harga selama beberapa hari dengan analisis multi-timeframe dan disiplin kesabaran.',
    defaultNote: 'Swing trading strategy jangka menengah untuk trader forex, gold, dan indeks yang ingin menangkap pergerakan harga besar di pasar live. Strategi swing ini menggabungkan analisis trend, struktur pasar, serta risk management agar entry dan exit tetap terukur dan konsisten.',
    accentColor: '#8B5CF6', // Purple
    accentBg: 'bg-purple-500/15',
    accentBorder: 'border-purple-500/30',
    badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
    gradient: 'from-purple-500/25 via-purple-600/10 to-transparent',
    positionBarGradient: 'from-purple-600 via-indigo-400 to-emerald-400',
    fontVibe: 'font-display font-semibold',
    icon: 'TrendingUp',
    popularPairs: ['GBPJPY', 'AUDUSD', 'USOIL'],
    riskStyle: 'Medium-High Reward (1:2 - 1:5)'
  },
  trend_following: {
    id: 'trend_following',
    name: 'Trend Following',
    tagline: 'Trend is your Friend - Surfing Continuous Momentum',
    description: 'Mengikuti struktur market bullish atau bearish yang terkonfirmasi oleh moving averages & higher highs / lower lows.',
    defaultNote: 'Trend following strategy untuk trader forex dan komoditas yang ingin mengikuti arah pasar yang kuat dan terkonfirmasi secara real-time. Strategi ini fokus pada momentum, breakout valid, dan risk management yang disciplined untuk memaksimalkan profit saat tren kuat berlangsung.',
    accentColor: '#10B981', // Emerald
    accentBg: 'bg-emerald-500/15',
    accentBorder: 'border-emerald-500/30',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    gradient: 'from-emerald-500/25 via-emerald-600/10 to-transparent',
    positionBarGradient: 'from-emerald-600 via-emerald-400 to-cyan-400',
    fontVibe: 'font-sans font-bold tracking-tight',
    icon: 'Compass',
    popularPairs: ['EURUSD', 'XAUUSD', 'ETHUSD'],
    riskStyle: 'Trailing Stop Strategy'
  },
  reversal: {
    id: 'reversal',
    name: 'Reversal',
    tagline: 'Sniping Exhaustion Points & Trend Turning Zones',
    description: 'Mendeteksi titik jenuh market (exhaustion) dan divergensi indikator untuk masuk di awal pembalikan arah harga.',
    defaultNote: 'Reversal strategy trading yang memanfaatkan pembalikan arah pasar, area exhaustion, dan konfirmasi price action untuk menangkap peluang saat tren mulai berubah. Strategi reversal ini sangat cocok untuk trader yang mencari setup entry di titik balik market dengan potensi reward tinggi.',
    accentColor: '#EC4899', // Pink
    accentBg: 'bg-pink-500/15',
    accentBorder: 'border-pink-500/30',
    badgeClass: 'bg-pink-500/20 text-pink-300 border-pink-500/40',
    gradient: 'from-pink-500/25 via-pink-600/10 to-transparent',
    positionBarGradient: 'from-pink-600 via-rose-400 to-amber-300',
    fontVibe: 'font-display font-extrabold italic',
    icon: 'Repeat',
    popularPairs: ['USDCAD', 'NZDUSD', 'XAUUSD'],
    riskStyle: 'High Risk / Super High Reward (1:3 - 1:6)'
  },
  momentum: {
    id: 'momentum',
    name: 'Momentum',
    tagline: 'Aggressive Velocity & High Volume Injection',
    description: 'Memanfaatkan ledakan volume instan akibat order flow institusi untuk entry searah dorongan daya beli/jual kuat.',
    defaultNote: 'Momentum trading strategy yang memanfaatkan dorongan harga, volume pasar, dan pergerakan real-time untuk masuk pada fase ekspansi market yang kuat. Strategi momentum ini populer di trader forex, crypto, dan indeks yang ingin menangkap tren cepat dengan eksekusi yang tajam.',
    accentColor: '#EF4444', // Red
    accentBg: 'bg-red-500/15',
    accentBorder: 'border-red-500/30',
    badgeClass: 'bg-red-500/20 text-red-300 border-red-500/40',
    gradient: 'from-red-500/25 via-red-600/10 to-transparent',
    positionBarGradient: 'from-red-600 via-orange-500 to-amber-300',
    fontVibe: 'font-display uppercase tracking-widest font-black',
    icon: 'Flame',
    popularPairs: ['NAS100', 'US30', 'BTCUSD'],
    riskStyle: 'Dynamic Volatility (1:2)'
  },
  snr: {
    id: 'snr',
    name: 'Support & Resistance',
    tagline: 'Pure Structural Horizontal Bounce & Zone Rejection',
    description: 'Trading klasik berdasarkan zona supply & demand serta batas horizontal psikologis yang diuji berulang kali.',
    defaultNote: 'Support and resistance strategy berbasis zona harga kunci, rejection level, dan struktur pasar untuk menemukan peluang entry dan exit yang terukur. Strategi SR ini membantu trader forex, gold, dan saham membaca level penting agar keputusan trading lebih konsisten dan mudah dioptimalkan secara SEO-friendly.',
    accentColor: '#3B82F6', // Blue
    accentBg: 'bg-blue-500/15',
    accentBorder: 'border-blue-500/30',
    badgeClass: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
    gradient: 'from-blue-500/25 via-blue-600/10 to-transparent',
    positionBarGradient: 'from-blue-600 via-sky-400 to-emerald-400',
    fontVibe: 'font-sans font-medium tracking-normal',
    icon: 'Shield',
    popularPairs: ['XAUUSD', 'EURJPY', 'GBPUSD'],
    riskStyle: 'Standard Structured (1:2 - 1:3)'
  },
  price_action: {
    id: 'price_action',
    name: 'Price Action',
    tagline: 'Naked Chartist Reading Candlestick Psychology',
    description: 'Membaca bahasa murni candlestick: pin bar, engulfing, fakey, order block tanpa ketergantungan indikator lag.',
    defaultNote: 'Price action strategy berbasis candlestick, struktur pasar, dan psikologi trader untuk membaca pergerakan harga secara real-time tanpa terlalu bergantung pada indikator lag. Strategi ini sangat relevan untuk trader forex dan crypto yang ingin memahami pola pasar secara alami dan efektif.',
    accentColor: '#14B8A6', // Teal
    accentBg: 'bg-teal-500/15',
    accentBorder: 'border-teal-500/30',
    badgeClass: 'bg-teal-500/20 text-teal-300 border-teal-500/40',
    gradient: 'from-teal-500/25 via-teal-600/10 to-transparent',
    positionBarGradient: 'from-teal-600 via-emerald-400 to-cyan-300',
    fontVibe: 'font-mono font-semibold',
    icon: 'BarChart2',
    popularPairs: ['EURUSD', 'XAUUSD', 'USDCHF'],
    riskStyle: 'Pin-Point Precision (1:2.5)'
  },
  news_trading: {
    id: 'news_trading',
    name: 'News Trading',
    tagline: 'Fundamental Volatility & Economic Data Releases',
    description: 'Trading berbasis rilis data makro ekonomi berdampak tinggi seperti NFP, CPI, suku bunga FOMC, dan GDP.',
    defaultNote: 'News trading strategy berbasis rilis data ekonomi dan event fundamental tinggi untuk menangkap volatilitas pasar secara cepat di kondisi live market. Strategi ini cocok untuk trader forex dan gold yang memanfaatkan NFP, CPI, suku bunga, dan data makro untuk entry yang cepat dan terukur.',
    accentColor: '#EAB308', // Yellow
    accentBg: 'bg-yellow-500/15',
    accentBorder: 'border-yellow-500/30',
    badgeClass: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
    gradient: 'from-yellow-500/25 via-yellow-600/10 to-transparent',
    positionBarGradient: 'from-yellow-600 via-amber-400 to-emerald-300',
    fontVibe: 'font-display uppercase font-bold tracking-tight',
    icon: 'Radio',
    popularPairs: ['XAUUSD', 'USDJPY', 'GBPUSD'],
    riskStyle: 'Ultra Fast Volatility Spike'
  },
  position_trading: {
    id: 'position_trading',
    name: 'Position Trading',
    tagline: 'Macro Thematic & Long-Horizon Value Investing',
    description: 'Strategi holding jangka panjang berminggu-minggu hingga berbulan-bulan berdasarkan fundamental global dan siklus moneter.',
    defaultNote: 'Position trading strategy jangka menengah hingga panjang yang fokus pada tren makro, analisis fundamental, dan pengelolaan risiko yang luas di pasar global. Strategi ini cocok untuk trader forex, indeks, dan komoditas yang mencari pendekatan trading lebih tenang namun tetap kuat secara SEO dan strategi pasar.',
    accentColor: '#6366F1', // Indigo
    accentBg: 'bg-indigo-500/15',
    accentBorder: 'border-indigo-500/30',
    badgeClass: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
    gradient: 'from-indigo-500/25 via-indigo-600/10 to-transparent',
    positionBarGradient: 'from-indigo-600 via-purple-400 to-emerald-400',
    fontVibe: 'font-display font-medium tracking-wide',
    icon: 'Anchor',
    popularPairs: ['XAUUSD', 'SPX500', 'EURUSD'],
    riskStyle: 'Wide Stop Loss / Macro Targets'
  },
  smc: {
    id: 'smc',
    name: 'Smart Money Concept (SMC)',
    tagline: 'Institutional Liquidity Sweeps & Orderflow Imbalances',
    description: 'Mengikuti jejak institusi bank besar memanfaatkan Fair Value Gap (FVG), Change of Character (CHoCH), dan Liquidity Pools.',
    defaultNote: 'Smart Money Concept strategy berbasis liquidity sweep, order block, dan struktur institusional untuk membaca pergerakan pasar seperti trader profesional. Strategi SMC ini memadukan price action, market structure, dan eksekusi yang lebih terarah untuk trader forex dan crypto yang serius.',
    accentColor: '#38BDF8', // Sky Blue / Cyan Gold
    accentBg: 'bg-sky-500/15',
    accentBorder: 'border-sky-500/30',
    badgeClass: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
    gradient: 'from-sky-500/25 via-sky-600/10 to-transparent',
    positionBarGradient: 'from-sky-600 via-cyan-400 to-emerald-400',
    fontVibe: 'font-mono uppercase font-bold tracking-tight',
    icon: 'Layers',
    popularPairs: ['XAUUSD', 'BTCUSD', 'EURUSD'],
    riskStyle: 'Sniper RR (1:3 - 1:8)'
  }
};

export const STRATEGY_LIST = Object.values(STRATEGIES);

export function getStrategy(id?: string): Strategy {
  if (!id || !STRATEGIES[id]) {
    return STRATEGIES['breakout'];
  }
  return STRATEGIES[id];
}
