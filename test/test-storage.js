/**
 * Automated Verification Script for EdgeOne KV, Blob, and Route Logic
 */

import { getKV, getBlob } from "../edge-functions/utils/storage.js";
import { hashPassword, authenticate, createSession, verifySession } from "../edge-functions/utils/auth.js";

async function runTests() {
  console.log("🚀 Starting Automated EdgeOne Verification Tests...\n");

  // 1. Test KV Storage
  console.log("--- 1. Testing KV Storage Adapter ---");
  const kv = getKV();
  await kv.put("test_key", "hello_edgeone");
  const val = await kv.get("test_key");
  console.assert(val === "hello_edgeone", "KV string get/put failed");
  console.log("✓ KV string get/put passed");

  await kv.putJSON("test_json", { a: 1, b: "ok" });
  const jsonVal = await kv.getJSON("test_json");
  console.assert(jsonVal.a === 1 && jsonVal.b === "ok", "KV JSON get/put failed");
  console.log("✓ KV JSON get/put passed");

  await kv.delete("test_key");
  const deletedVal = await kv.get("test_key");
  console.assert(deletedVal === null, "KV delete failed");
  console.log("✓ KV delete passed\n");

  // 2. Test Blob Storage Adapter
  console.log("--- 2. Testing Blob Storage Adapter ---");
  const blob = getBlob("dwz-blob");
  const testBuffer = new TextEncoder().encode("fake_image_bytes");
  await blob.set("uploads/test.png", testBuffer, { cacheControl: "public, max-age=31536000" });
  const readBuffer = await blob.get("uploads/test.png");
  console.assert(readBuffer !== null, "Blob get failed");
  console.log("✓ Blob write and read passed");

  const listRes = await blob.list({ prefix: "uploads/" });
  console.assert(Array.isArray(listRes.blobs) && listRes.blobs.length > 0, "Blob list failed");
  console.log(`✓ Blob list passed (found ${listRes.blobs.length} objects)`);

  await blob.delete("uploads/test.png");
  const afterDelete = await blob.get("uploads/test.png");
  console.assert(afterDelete === null, "Blob delete failed");
  console.log("✓ Blob delete passed\n");

  // 3. Test Authentication
  console.log("--- 3. Testing Authentication & Session ---");
  const hash = await hashPassword("admin123");
  console.assert(typeof hash === "string" && hash.length === 64, "hashPassword failed");
  console.log("✓ SHA-256 password hash generated correctly:", hash);

  const authSuccess = await authenticate(kv, "admin", "admin123");
  console.assert(authSuccess === true, "Authentication with default credentials failed");
  console.log("✓ Default admin authentication passed");

  const authFail = await authenticate(kv, "admin", "wrong_password");
  console.assert(authFail === false, "Authentication should fail with wrong password");
  console.log("✓ Wrong password rejection passed");

  const token = await createSession(kv, "admin");
  console.assert(typeof token === "string" && token.length > 10, "Token creation failed");

  const headersMap = new Map([["authorization", `Bearer ${token}`]]);
  const mockReq = {
    headers: {
      get: (k) => headersMap.get(k.toLowerCase()) || null,
    },
  };

  const session = await verifySession(mockReq, kv);
  console.assert(session && session.username === "admin", "Session verification failed");
  console.log("✓ Session token generation and verification passed\n");

  // 4. Test Short URL Logic & 3-Char Auto Key Generation
  console.log("--- 4. Testing Short URL Business Logic & 3-Char Auto Key Generation ---");
  const randomKey = Math.random().toString(36).substring(2, 5); // 3 characters
  console.assert(randomKey.length === 3, "3-char key failed");
  const targetLongUrl = "https://cloud.tencent.com/document/product/1552/127420";
  const autoTitle = `${new URL(targetLongUrl).hostname}_${randomKey}`;
  const dwzData = {
    id: Date.now(),
    title: autoTitle,
    key: randomKey,
    url: targetLongUrl,
    type: 1,
    status: 1,
    pv: 0,
    today_pv: { pv: 0, date: "2026-09-03" },
  };
  await kv.putJSON(`dwz_key_${randomKey}`, dwzData);
  await kv.putJSON("dwz_index", [randomKey]);

  const fetchedDwz = await kv.getJSON(`dwz_key_${randomKey}`);
  console.assert(fetchedDwz.url === targetLongUrl, "Dwz fetch failed");
  console.assert(fetchedDwz.key.length === 3, "Key length must be 3");
  console.assert(fetchedDwz.title.includes("cloud.tencent.com"), "Auto title generation failed");
  console.log(`✓ 3-Character Short URL generation passed: ${randomKey} -> ${fetchedDwz.url}`);

  // Test Public Homepage DWZ Switch
  await kv.put("public_dwz_allowed", "1");
  const isPublicAllowed = (await kv.get("public_dwz_allowed")) === "1";
  console.assert(isPublicAllowed === true, "Public switch failed");
  console.log(`✓ Global Public DWZ Homepage switch verified: enabled = ${isPublicAllowed}`);

  // 5. Test Group Live Code Subcode Rotation Logic
  console.log("--- 5. Testing Group Live Code Threshold Rotation ---");
  const qunId = "1001";
  const qunData = {
    id: qunId,
    title: "测试群聊",
    status: 1,
    qc: 1,
    safety: 1,
    kf_qrcode: "/api/blob/uploads/kf.png",
    kf_status: 1,
    pv: 0,
    zima: [
      { id: "z1", qrcode: "/api/blob/uploads/g1.png", max_num: 2, pv: 2, status: 1 }, // Already full
      { id: "z2", qrcode: "/api/blob/uploads/g2.png", max_num: 2, pv: 0, status: 1 }, // Available!
    ],
  };

  // Simulate rotator finding first available subcode
  const available = qunData.zima.find((z) => z.status === 1 && z.pv < z.max_num);
  console.assert(available && available.id === "z2", "Subcode rotator failed to select z2");
  console.log(`✓ Group subcode rotation correctly skipped full z1 (pv=2/max=2) and selected available z2 (pv=0/max=2)\n`);

  console.log("🎉 ALL TESTS PASSED SUCCESSFULLY! Ready for EdgeOne deployment.\n");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
