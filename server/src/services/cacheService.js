import crypto from 'crypto';

class CacheService {
  constructor() {
    this.cache = new Map();
    this.defaultTtlMs = 15 * 60 * 1000; // 15 minutes TTL
  }

  generateKey(toolId, prompt) {
    const raw = `${toolId || 'default'}:${(prompt || '').trim()}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  get(toolId, prompt) {
    const key = this.generateKey(toolId, prompt);
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return item.data;
  }

  set(toolId, prompt, data, customTtlMs) {
    const key = this.generateKey(toolId, prompt);
    const ttl = customTtlMs || this.defaultTtlMs;
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttl
    });
  }

  clear() {
    this.cache.clear();
  }
}

export const cacheService = new CacheService();
