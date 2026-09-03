/**
 * Authentication and Session Management for EdgeOne Functions
 * Uses native Web Crypto API (SHA-256) compatible with Edge V8 runtime
 */

import { getKV } from "./storage.js";

const DEFAULT_ADMIN = {
  username: "admin",
  // SHA-256 hash for default password: "admin123"
  passHash: "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9",
};

/**
 * Compute SHA-256 hash string
 */
export async function hashPassword(plainText) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plainText);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Get or initialize admin credentials in KV
 */
export async function getAdminConfig(kv) {
  const settings = await kv.getJSON("app_admin_settings");
  if (settings && settings.username && settings.passHash) {
    return settings;
  }
  // Initialize default
  await kv.putJSON("app_admin_settings", DEFAULT_ADMIN);
  return DEFAULT_ADMIN;
}

/**
 * Authenticate username and password
 */
export async function authenticate(kv, username, password) {
  const admin = await getAdminConfig(kv);
  if (!username || !password) return false;
  if (username !== admin.username) return false;

  const inputHash = await hashPassword(password);
  return inputHash === admin.passHash;
}

/**
 * Generate a new session token
 */
export async function createSession(kv, username) {
  const token =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "")
      : Math.random().toString(36).substring(2) + Date.now().toString(36);

  const sessionData = {
    username,
    token,
    createdAt: Date.now(),
    expiresAt: Date.now() + 7 * 24 * 3600 * 1000, // 7 days
  };

  await kv.putJSON(`session_${token}`, sessionData);
  return token;
}

/**
 * Verify request session token from Authorization header or Cookie
 */
export async function verifySession(request, kv) {
  let token = null;

  // Check Authorization header
  const authHeader = request.headers.get("Authorization") || request.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7).trim();
  }

  // Check Cookie header if not found
  if (!token) {
    const cookieHeader = request.headers.get("Cookie") || request.headers.get("cookie");
    if (cookieHeader) {
      const match = cookieHeader.match(/(?:^|;\s*)dwz_token=([^;]+)/);
      if (match) {
        token = match[1].trim();
      }
    }
  }

  if (!token) return null;

  const session = await kv.getJSON(`session_${token}`);
  if (!session) return null;

  if (session.expiresAt && Date.now() > session.expiresAt) {
    await kv.delete(`session_${token}`);
    return null;
  }

  return session;
}

/**
 * Helper to build JSON responses
 */
export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, X-API-Key",
    },
  });
}

/**
 * Generate random key
 */
export function getRandomKey(length = 6) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let res = "";
  for (let i = 0; i < length; i++) {
    res += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return res;
}

/**
 * Get YYYY-MM-DD date string
 */
export function getTodayString() {
  return new Date().toISOString().split("T")[0];
}
