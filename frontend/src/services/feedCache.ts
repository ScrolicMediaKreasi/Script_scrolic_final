import { FeedPost } from '../types';

const DB_NAME = 'scrolic_db_v4';
const DB_VERSION = 1;
const STORE_FEED = 'feed_cache';
const STORE_META = 'metadata_cache';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_FEED)) {
        db.createObjectStore(STORE_FEED, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const feedCache = {
  /**
   * Get cached feed posts immediately for instant initial rendering
   */
  async getCachedFeed(): Promise<FeedPost[]> {
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_FEED, 'readonly');
        const store = tx.objectStore(STORE_FEED);
        const req = store.getAll();

        req.onsuccess = () => {
          const rawPosts = (req.result || []) as FeedPost[];
          // Filter out legacy mock seed posts
          const posts = rawPosts.filter(
            (p) =>
              p.id &&
              !p.id.includes('881290') &&
              !p.id.includes('-hist1') &&
              !p.id.includes('-hist2') &&
              !p.id.includes('-hist3') &&
              !p.id.includes('-hist4')
          );
          // Sort by creation date descending
          posts.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
          resolve(posts);
        };
        req.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  },

  /**
   * Save fresh feed items to IndexedDB
   */
  async setCachedFeed(posts: FeedPost[]): Promise<void> {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_FEED, 'readwrite');
      const store = tx.objectStore(STORE_FEED);

      for (const post of posts) {
        store.put(post);
      }
    } catch (err) {
      console.warn('[FeedCache] Failed to save posts to IndexedDB:', err);
    }
  },

  /**
   * Update a single cached post (e.g. on live price tick or unlock)
   */
  async updateCachedPost(post: FeedPost): Promise<void> {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_FEED, 'readwrite');
      const store = tx.objectStore(STORE_FEED);
      store.put(post);
    } catch {
      // Non-blocking
    }
  },

  /**
   * Clear cache if needed
   */
  async clear(): Promise<void> {
    try {
      const db = await openDB();
      const tx = db.transaction([STORE_FEED, STORE_META], 'readwrite');
      tx.objectStore(STORE_FEED).clear();
      tx.objectStore(STORE_META).clear();
    } catch {
      // Non-blocking
    }
  }
};
