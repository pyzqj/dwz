/**
 * Tencent Cloud EdgeOne KV and Blob Storage Adapter
 * Docs:
 * KV: https://cloud.tencent.com/document/product/1552/127420
 * Blob: https://cloud.tencent.com/document/product/1552/131425
 */

import { getStore } from "@edgeone/pages-blob";

// In-memory fallback for local dev / testing before EdgeOne KV binding is configured
const memoryStore = new Map();

/**
 * Obtain EdgeOne KV instance
 * Checks direct lexical global, globalThis bindings, or context.env
 */
export function getKV(context) {
  let kvCandidate = null;

  // 1. Direct lexical global checks (EdgeOne runtime global variable injection)
  try {
    if (typeof DWZ_KV !== "undefined" && DWZ_KV) kvCandidate = DWZ_KV;
  } catch (e) {}

  try {
    if (!kvCandidate && typeof MY_KV !== "undefined" && MY_KV) kvCandidate = MY_KV;
  } catch (e) {}

  try {
    if (!kvCandidate && typeof KV !== "undefined" && KV) kvCandidate = KV;
  } catch (e) {}

  try {
    if (!kvCandidate && typeof DB_KV !== "undefined" && DB_KV) kvCandidate = DB_KV;
  } catch (e) {}

  // 2. globalThis checks
  if (!kvCandidate && typeof globalThis !== "undefined") {
    kvCandidate =
      globalThis.DWZ_KV ||
      globalThis.MY_KV ||
      globalThis.KV ||
      globalThis.DB_KV;
  }

  // 3. context.env checks (fallback)
  if (!kvCandidate && context && context.env) {
    kvCandidate =
      context.env.DWZ_KV ||
      context.env.MY_KV ||
      context.env.KV ||
      context.env.DB_KV;
  }

  if (kvCandidate && typeof kvCandidate.get === "function" && typeof kvCandidate.put === "function") {
    return {
      isMock: false,
      raw: kvCandidate,
      async get(key) {
        try {
          return await kvCandidate.get(key);
        } catch (err) {
          console.error(`[KV Error] get("${key}"):`, err);
          return null;
        }
      },
      async getJSON(key) {
        const val = await this.get(key);
        if (!val) return null;
        try {
          return typeof val === "string" ? JSON.parse(val) : val;
        } catch {
          return null;
        }
      },
      async put(key, value) {
        try {
          const str = typeof value === "string" ? value : JSON.stringify(value);
          await kvCandidate.put(key, str);
          return true;
        } catch (err) {
          console.error(`[KV Error] put("${key}"):`, err);
          return false;
        }
      },
      async putJSON(key, value) {
        return await this.put(key, JSON.stringify(value));
      },
      async delete(key) {
        try {
          await kvCandidate.delete(key);
          return true;
        } catch (err) {
          console.error(`[KV Error] delete("${key}"):`, err);
          return false;
        }
      },
    };
  }

  // Fallback to in-memory store for local testing
  return {
    isMock: true,
    async get(key) {
      return memoryStore.has(key) ? memoryStore.get(key) : null;
    },
    async getJSON(key) {
      const val = await this.get(key);
      if (!val) return null;
      try {
        return typeof val === "string" ? JSON.parse(val) : val;
      } catch {
        return null;
      }
    },
    async put(key, value) {
      const str = typeof value === "string" ? value : JSON.stringify(value);
      memoryStore.set(key, str);
      return true;
    },
    async putJSON(key, value) {
      return await this.put(key, JSON.stringify(value));
    },
    async delete(key) {
      memoryStore.delete(key);
      return true;
    },
  };
}

// In-memory fallback for Blob store during local dev
const memoryBlobStore = new Map();

/**
 * Obtain EdgeOne Blob Store instance
 * Store Name: dwz-blob (Auto-created on first call by EdgeOne SDK, zero-config)
 */
export function getBlob(storeName = "dwz-blob") {
  try {
    const store = getStore(storeName);
    return {
      isMock: false,
      async set(key, buffer, options = {}) {
        return await store.set(key, buffer, options);
      },
      async get(key, options = {}) {
        return await store.get(key, options);
      },
      async delete(key) {
        return await store.delete(key);
      },
      async list(options = {}) {
        return await store.list(options);
      },
    };
  } catch (err) {
    // Local dev or credentials not initialized yet
    return {
      isMock: true,
      async set(key, buffer, options = {}) {
        memoryBlobStore.set(key, { data: buffer, options, time: Date.now() });
        return true;
      },
      async get(key, options = {}) {
        const item = memoryBlobStore.get(key);
        if (!item) return null;
        if (options.type === "text") {
          return typeof item.data === "string" ? item.data : new TextDecoder().decode(item.data);
        }
        if (options.type === "json") {
          const txt = typeof item.data === "string" ? item.data : new TextDecoder().decode(item.data);
          return JSON.parse(txt);
        }
        return item.data;
      },
      async delete(key) {
        memoryBlobStore.delete(key);
        return true;
      },
      async list(options = {}) {
        const prefix = options.prefix || "";
        const blobs = [];
        for (const [key, val] of memoryBlobStore.entries()) {
          if (key.startsWith(prefix)) {
            blobs.push({ key, size: val.data?.byteLength || val.data?.length || 0 });
          }
        }
        return { blobs };
      },
    };
  }
}
