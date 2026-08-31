import { FeedPost } from '../types';

/**
 * Utility functions for Dynamic SEO & Schema.org JSON-LD Microdata Management
 * Updates browser DOM head tags dynamically without altering visual UI layout.
 */

export function updatePageSEO(options: {
  title: string;
  description: string;
  url?: string;
  imageUrl?: string;
  jsonLd?: Record<string, any>;
}) {
  if (typeof document === 'undefined') return;

  const { title, description, url, imageUrl, jsonLd } = options;

  // 1. Update Title
  document.title = title;

  // Helper to set or create meta tag
  const setMetaTag = (selector: string, attrName: string, attrVal: string, contentVal: string) => {
    let el = document.querySelector(selector);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attrName, attrVal);
      document.head.appendChild(el);
    }
    el.setAttribute('content', contentVal);
  };

  // 2. Standard Description
  setMetaTag('meta[name="description"]', 'name', 'description', description);

  if (url) {
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', url);
  }

  // 3. OpenGraph Tags
  setMetaTag('meta[property="og:title"]', 'property', 'og:title', title);
  setMetaTag('meta[property="og:description"]', 'property', 'og:description', description);
  setMetaTag('meta[property="og:type"]', 'property', 'og:type', 'article');
  if (url) {
    setMetaTag('meta[property="og:url"]', 'property', 'og:url', url);
  }
  if (imageUrl) {
    setMetaTag('meta[property="og:image"]', 'property', 'og:image', imageUrl);
  }

  // 4. Twitter Card Tags
  setMetaTag('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary_large_image');
  setMetaTag('meta[name="twitter:title"]', 'name', 'twitter:title', title);
  setMetaTag('meta[name="twitter:description"]', 'name', 'twitter:description', description);
  if (imageUrl) {
    setMetaTag('meta[name="twitter:image"]', 'name', 'twitter:image', imageUrl);
  }

  // 5. Schema.org JSON-LD Injection
  if (jsonLd) {
    let scriptEl = document.getElementById('scrolic-jsonld-schema') as HTMLScriptElement | null;
    if (!scriptEl) {
      scriptEl = document.createElement('script');
      scriptEl.id = 'scrolic-jsonld-schema';
      scriptEl.type = 'application/ld+json';
      document.head.appendChild(scriptEl);
    }
    scriptEl.textContent = JSON.stringify(jsonLd);
  }
}

/**
 * Dynamically updates SEO head tags for a specific Feed Post
 */
export function updateSEOForFeedPost(post: FeedPost) {
  if (!post) return;

  const symbol = post.trade?.symbol && post.trade.symbol !== 'Unknown' ? post.trade.symbol : 'XAUUSD';
  const direction = post.trade?.direction || 'BUY';
  const username = post.user?.username || 'trader';
  const displayName = post.user?.displayName || username;
  const strategyName = post.strategy?.name || 'Breakout Hunter';
  const pips = (post.trade?.pips ?? 0).toFixed(1);
  const profitUSD = (post.trade?.profitUSD ?? 0).toFixed(2);
  const isProfit = (post.trade?.profitUSD ?? 0) >= 0;

  const title = `${symbol} ${direction} oleh @${username} (${strategyName}) | Scrolic Social Trade Platform`;
  const description = `Lihat sinyal live trade ${symbol} ${direction} (${strategyName}) dari ${displayName} (@${username}). Pips: ${isProfit ? '+' : ''}${pips} pips ($${profitUSD}). Win Rate: ${post.user?.winRate || 80}%.`;
  const shareUrl = `${window.location.origin}/post/${post.id}`;
  const imageUrl = post.user?.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${username}`;

  // Schema.org SocialMediaPosting & FinancialProduct JSON-LD
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SocialMediaPosting',
    'headline': `${symbol} ${direction} Trade Signal by @${username}`,
    'description': description,
    'url': shareUrl,
    'datePublished': post.createdAt,
    'author': {
      '@type': 'Person',
      'name': displayName,
      'alternateName': `@${username}`,
      'image': imageUrl
    },
    'publisher': {
      '@type': 'Organization',
      'name': 'Scrolic Social Trading Platform',
      'url': window.location.origin,
      'logo': `${window.location.origin}/logo.svg`
    },
    'about': {
      '@type': 'FinancialProduct',
      'name': `${symbol} Trading Signal`,
      'category': post.strategy?.id || 'Trading Signal',
      'offers': {
        '@type': 'Offer',
        'price': post.unlockFee || 1,
        'priceCurrency': 'ENERGY'
      }
    }
  };

  updatePageSEO({
    title,
    description,
    url: shareUrl,
    imageUrl,
    jsonLd
  });
}
