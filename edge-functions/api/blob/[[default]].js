/**
 * Edge Function to serve files from EdgeOne Blob Storage
 * Route: /api/blob/*
 */

import { getBlobData } from "../../utils/storage.js";

const MIME_TYPES = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  ico: "image/x-icon",
  txt: "text/plain; charset=utf-8",
  json: "application/json; charset=utf-8",
  pdf: "application/pdf",
};

export default async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const rawKey = url.pathname.replace(/^\/api\/blob\//, "");
  const blobKey = decodeURIComponent(rawKey);

  if (!blobKey) {
    return new Response("Missing file key", { status: 400 });
  }

  try {
    const data = await getBlobData(blobKey);
    if (!data) {
      return new Response("File not found in Blob storage", { status: 404 });
    }

    const dotIdx = blobKey.lastIndexOf(".");
    const ext = dotIdx !== -1 ? blobKey.substring(dotIdx + 1).toLowerCase() : "";
    const contentType = MIME_TYPES[ext] || "image/jpeg";

    return new Response(data, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    return new Response("Blob Read Error: " + err.message, { status: 500 });
  }
}
