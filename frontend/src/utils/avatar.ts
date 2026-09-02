export const getDefaultAvatarUrl = (seed: string | null | undefined): string => {
  const normalizedSeed = String(seed || 'trader').trim() || 'trader';
  return `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(normalizedSeed)}`;
};

export const safeAvatarUrl = (avatar?: string | null, seed?: string | null): string => {
  const candidate = typeof avatar === 'string' ? avatar.trim() : '';
  if (candidate && /^(https?:\/\/|data:image\/|blob:)/i.test(candidate)) {
    return candidate;
  }
  return getDefaultAvatarUrl(seed || candidate || 'trader');
};

export const handleAvatarError = (
  event: { currentTarget: HTMLImageElement },
  seed?: string | null,
  fallback?: string | null
): void => {
  const target = event.currentTarget;
  const nextUrl = safeAvatarUrl(fallback || null, seed || target.alt || 'trader');
  if (target.src !== nextUrl) {
    target.src = nextUrl;
    target.onerror = null;
  }
};
