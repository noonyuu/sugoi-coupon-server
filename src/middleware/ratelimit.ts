import { Context, Next } from "hono";

// メモリキャッシュ
const memoryCache = new Map<string, { data: number[]; timestamp: number }>();

// 定数
const CACHE_TTL = 30000; // 30秒
const WRITE_THRESHOLD = 0.8;

// 段階的制限設定
const RATE_LIMITS = [
  { limit: 5, window: 60000 }, // 1分に5回
  { limit: 20, window: 300000 }, // 5分に20回
  { limit: 100, window: 3600000 }, // 1時間に100回
];

// KVバインディング
function getKVBinding(context: Context): any | null {
  try {
    const kv = (context.env as any)?.ratelimit;
    return kv && typeof kv.get === "function" && typeof kv.put === "function" ? kv : null;
  } catch (error) {
    console.warn("Failed to get ratelimit KV binding:", error);
    return null;
  }
}

// レートリミットクラス（状態管理を明確化）
class RateLimitChecker {
  private context: Context;
  private ip: string;
  private now: number;
  private kv: any | null;

  constructor(context: Context, ip: string, now: number) {
    this.context = context;
    this.ip = ip;
    this.now = now;
    this.kv = getKVBinding(context);
  }

  async checkAllLimits(): Promise<{ blocked: boolean; stage?: any }> {
    for (const stage of RATE_LIMITS) {
      const isBlocked = await this.checkSingleLimit(stage.limit, stage.window);
      if (isBlocked) {
        return { blocked: true, stage };
      }
    }
    return { blocked: false };
  }

  private async checkSingleLimit(limit: number, window: number): Promise<boolean> {
    const key = `rate_limit:${this.ip}:${window}`;
    const batchKey = `batch:${this.ip}:${Math.floor(this.now / 60000)}:${window}`;

    // メモリキャッシュをチェック
    const cached = memoryCache.get(key);
    if (cached && this.now - cached.timestamp < CACHE_TTL) {
      return this.updateCacheAndCheck(key, cached.data, window, limit);
    }

    // KVから履歴を取得
    const timestamps = await this.getTimestampsFromKV(key);

    // 古いタイムスタンプを除去して新しいものを追加
    const recentTimestamps = timestamps.filter((ts: number) => this.now - ts < window);
    recentTimestamps.push(this.now);

    // メモリキャッシュに保存
    memoryCache.set(key, { data: recentTimestamps, timestamp: this.now });

    // KVに書き込み（KVが利用可能な場合のみ）
    if (this.kv) {
      await this.conditionalWrite(key, batchKey, recentTimestamps, limit, window);
    }

    return recentTimestamps.length > limit;
  }

  private updateCacheAndCheck(key: string, cachedData: number[], window: number, limit: number): boolean {
    const recentTimestamps = cachedData.filter((ts: number) => this.now - ts < window);
    recentTimestamps.push(this.now);

    memoryCache.set(key, { data: recentTimestamps, timestamp: this.now });

    return recentTimestamps.length > limit;
  }

  private async getTimestampsFromKV(key: string): Promise<number[]> {
    if (!this.kv) {
      return []; // KVが利用できない場合は空配列
    }

    try {
      const historyData = await this.kv.get(key);
      return historyData ? JSON.parse(historyData) : [];
    } catch (error) {
      console.error("ratelimit get error:", error);
      return [];
    }
  }

  private async conditionalWrite(key: string, batchKey: string, timestamps: number[], limit: number, window: number): Promise<void> {
    if (!this.kv) {
      return; // KVが利用できない場合は何もしない
    }

    try {
      const shouldWrite = timestamps.length > limit * WRITE_THRESHOLD || !(await this.isBatchKeyExists(batchKey));

      if (shouldWrite) {
        this.context.executionCtx.waitUntil(
          Promise.all([
            this.kv.put(key, JSON.stringify(timestamps), {
              expirationTtl: Math.ceil(window / 1000),
            }),
            this.kv.put(batchKey, "1", {
              expirationTtl: 60,
            }),
          ]).catch((error) => {
            console.error("ratelimit put error:", error);
          })
        );
      }
    } catch (error) {
      console.error("conditionalWrite error:", error);
    }
  }

  private async isBatchKeyExists(batchKey: string): Promise<boolean> {
    if (!this.kv) {
      return false; // KVが利用できない場合は常に新規として扱う
    }

    try {
      const exists = await this.kv.get(batchKey);
      return exists !== null;
    } catch (error) {
      console.error("Batch key check error:", error);
      return false;
    }
  }
}

export const rateLimitMiddleware = async (c: Context, next: Next) => {
  try {
    const ip = c.req.header("x-forwarded-for") || c.req.header("CF-Connecting-IP") || c.req.header("X-Real-IP") || "unknown";

    const now = Date.now();

    // 自動クリーンアップ（確率的）
    const shouldCleanup = now % 100 < 5; // 5%の確率
    if (shouldCleanup) {
      cleanupMemoryCache();
    }

    // レートリミットチェック
    const checker = new RateLimitChecker(c, ip, now);
    const result = await checker.checkAllLimits();

    if (result.blocked && result.stage) {
      return c.json(
        {
          error: "Too Many Requests",
          message: `Rate limit exceeded: ${result.stage.limit} requests per ${result.stage.window / 1000} seconds`,
          retryAfter: Math.ceil(result.stage.window / 1000),
          timestamp: new Date().toISOString(),
        },
        429
      );
    }

    await next();
  } catch (error) {
    console.error("Rate limit middleware error:", error);
    // エラーが発生してもアプリケーションを停止させない
    await next();
  }
};

// メモリキャッシュのクリーンアップ
export function cleanupMemoryCache(): void {
  const now = Date.now();
  let cleanedCount = 0;

  for (const [key, value] of memoryCache.entries()) {
    if (now - value.timestamp > CACHE_TTL * 2) {
      memoryCache.delete(key);
      cleanedCount++;
    }
  }

  if (cleanedCount > 0) {
    console.log(`Cleaned up ${cleanedCount} cache entries. Current cache size: ${memoryCache.size}`);
  }
}

// キャッシュ統計取得
export function getCacheStats() {
  const now = Date.now();
  const timestamps = Array.from(memoryCache.values()).map((v) => v.timestamp);

  return {
    size: memoryCache.size,
    keys: Array.from(memoryCache.keys()),
    oldestEntry: timestamps.length > 0 ? Math.min(...timestamps) : null,
    newestEntry: timestamps.length > 0 ? Math.max(...timestamps) : null,
    currentTime: now,
  };
}

// // デバッグ用：レートリミット状況確認
// export function getRateLimitStatus(context: Context, ip: string) {
//   const kv = getKVBinding(context);
//   const now = Date.now();

//   return {
//     ip: ip.substring(0, 8) + "***", // セキュリティのため一部マスク
//     kvAvailable: !!kv,
//     cacheStats: getCacheStats(),
//     limits: RATE_LIMITS,
//     timestamp: new Date().toISOString(),
//   };
// }
