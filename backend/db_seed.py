"""
Seed data for Scrolic (Users, Strategies, Posts, Comments, Notifications)
Production-ready: Removed mock cTrader accounts so real user cTrader accounts are populated upon connecting.
"""
from datetime import datetime, timezone

SEED_STRATEGIES = [
    {
        "id": "breakout",
        "name": "Breakout Hunter",
        "slug": "breakout-hunter",
        "description": "Menangkap ekspansi volatilitas dan momentum saat harga menembus level supply/demand kunci.",
        "template_id": "breakout",
        "tagline": "High Probability Momentum",
        "win_rate_avg": 78.5,
        "premium": False,
        "active": True,
        "accentColor": "#F59E0B",
        "accentBg": "bg-amber-500/10",
        "accentBorder": "border-amber-500/30",
        "badgeClass": "bg-amber-500/20 text-amber-400 border-amber-500/30",
        "gradient": "from-amber-500 to-orange-600",
        "positionBarGradient": "from-amber-500 via-orange-500 to-amber-400",
        "fontVibe": "font-mono tracking-tight",
        "icon": "Zap",
        "popularPairs": ["XAUUSD", "BTCUSD", "GBPUSD"],
        "riskStyle": "Aggressive Momentum",
        "created_at": datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc),
        "updated_at": datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    },
    {
        "id": "scalping",
        "name": "Precision Scalper",
        "slug": "precision-scalper",
        "description": "Eksekusi mikro-struktur orderflow dengan Risk-to-Reward terukur pada timeframe 1M-5M.",
        "template_id": "scalping",
        "tagline": "High Frequency Flow",
        "win_rate_avg": 81.2,
        "premium": False,
        "active": True,
        "accentColor": "#10B981",
        "accentBg": "bg-emerald-500/10",
        "accentBorder": "border-emerald-500/30",
        "badgeClass": "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
        "gradient": "from-emerald-500 to-teal-600",
        "positionBarGradient": "from-emerald-500 via-teal-500 to-emerald-400",
        "fontVibe": "font-sans font-bold",
        "icon": "Activity",
        "popularPairs": ["EURUSD", "GBPUSD", "USDJPY"],
        "riskStyle": "Tight Stop Loss",
        "created_at": datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc),
        "updated_at": datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    },
    {
        "id": "smc",
        "name": "Smart Money Concept (SMC)",
        "slug": "smart-money-concept",
        "description": "Trading searah akumulasi dan distribusi institusi melalui Order Block, FVG, dan Liquidity Sweep.",
        "template_id": "smc",
        "tagline": "Institutional Liquidity",
        "win_rate_avg": 84.0,
        "premium": True,
        "active": True,
        "accentColor": "#8B5CF6",
        "accentBg": "bg-purple-500/10",
        "accentBorder": "border-purple-500/30",
        "badgeClass": "bg-purple-500/20 text-purple-400 border-purple-500/30",
        "gradient": "from-purple-500 to-indigo-600",
        "positionBarGradient": "from-purple-500 via-indigo-500 to-purple-400",
        "fontVibe": "font-serif italic",
        "icon": "TrendingUp",
        "popularPairs": ["EURUSD", "XAUUSD", "GBPUSD"],
        "riskStyle": "High R:R Ratio",
        "created_at": datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc),
        "updated_at": datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    },
    {
        "id": "swing",
        "name": "Macro Swing Master",
        "slug": "macro-swing-master",
        "description": "Mengikuti gelombang trend fundamental dan kebijakan bank sentral untuk horizon multi-hari.",
        "template_id": "swing",
        "tagline": "Multi-Day Trend Riding",
        "win_rate_avg": 76.8,
        "premium": False,
        "active": True,
        "accentColor": "#3B82F6",
        "accentBg": "bg-blue-500/10",
        "accentBorder": "border-blue-500/30",
        "badgeClass": "bg-blue-500/20 text-blue-400 border-blue-500/30",
        "gradient": "from-blue-500 to-cyan-600",
        "positionBarGradient": "from-blue-500 via-cyan-500 to-blue-400",
        "fontVibe": "font-sans uppercase tracking-widest",
        "icon": "Globe",
        "popularPairs": ["GBPUSD", "AUDUSD", "EURJPY"],
        "riskStyle": "Wide Horizon Swing",
        "created_at": datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc),
        "updated_at": datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    }
]

SEED_USERS = []

SEED_POSTS = []

SEED_COMMENTS = []

SEED_NOTIFICATIONS = []
