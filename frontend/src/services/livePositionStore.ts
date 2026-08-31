import { LivePositionUpdate, CTraderPositionUpdatePayload } from './socketClient';

export type PositionUpdateListener = (update: LivePositionUpdate) => void;

class LivePositionStore {
  private latestUpdates: Map<string, LivePositionUpdate> = new Map();
  private keyListeners: Map<string, Set<PositionUpdateListener>> = new Map();

  /**
   * Dispatches a new position tick update to listeners registered for this specific key
   */
  public dispatchUpdate(update: LivePositionUpdate | CTraderPositionUpdatePayload): void {
    const postId = (update as any).postId || (update as any).tradeId || (update as any).positionId;
    const tradeId = (update as any).tradeId || (update as any).positionId || (update as any).postId;
    const positionId = (update as any).positionId || (update as any).tradeId;

    const normalized: LivePositionUpdate = {
      postId: String(postId || ''),
      tradeId: String(tradeId || ''),
      positionId: String(positionId || ''),
      symbol: update.symbol || 'XAUUSD',
      currentPrice: (update as any).currentPrice ?? (update as any).current ?? (update as any).bid ?? 0,
      progress: update.progress ?? 50,
      profit: (update as any).profitUsd ?? (update as any).profit ?? 0,
      profitPercent: update.profitPercent ?? 0,
      pips: update.pips ?? 0,
      volumeLot: (update as any).volumeLot,
      status: (update.status as any) || 'OPEN'
    };

    // Store latest snapshot in memory for fast catch-up when scrolling into viewport
    if (postId) this.latestUpdates.set(String(postId), normalized);
    if (tradeId) this.latestUpdates.set(String(tradeId), normalized);
    if (positionId) this.latestUpdates.set(String(positionId), normalized);

    // Notify registered item listeners for postId, tradeId, or positionId
    const keys = [String(postId), String(tradeId), String(positionId)].filter(Boolean);
    const notified = new Set<PositionUpdateListener>();

    for (const key of keys) {
      const listeners = this.keyListeners.get(key);
      if (listeners) {
        listeners.forEach((cb) => {
          if (!notified.has(cb)) {
            notified.add(cb);
            try {
              cb(normalized);
            } catch (err) {
              console.error('[LivePositionStore] Listener error:', err);
            }
          }
        });
      }
    }
  }

  /**
   * Subscribe to live position updates for a specific post/trade/position key
   */
  public subscribe(key: string, callback: PositionUpdateListener): () => void {
    if (!key) return () => {};
    const strKey = String(key);
    if (!this.keyListeners.has(strKey)) {
      this.keyListeners.set(strKey, new Set());
    }
    const set = this.keyListeners.get(strKey)!;
    set.add(callback);

    // Return current cached state if available
    const existing = this.latestUpdates.get(strKey);
    if (existing) {
      try {
        callback(existing);
      } catch (err) {
        console.error('[LivePositionStore] Initial subscription callback error:', err);
      }
    }

    return () => {
      set.delete(callback);
      if (set.size === 0) {
        this.keyListeners.delete(strKey);
      }
    };
  }

  /**
   * Get latest snapshot for a post/trade key
   */
  public getLatest(key: string): LivePositionUpdate | undefined {
    return this.latestUpdates.get(String(key));
  }
}

export const livePositionStore = new LivePositionStore();
