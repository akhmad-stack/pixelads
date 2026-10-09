import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import midtransClient from "midtrans-client";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(__dirname, "public")));

const {
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
  MIDTRANS_SERVER_KEY, MIDTRANS_CLIENT_KEY = "", MIDTRANS_PRODUCTION = "false",
  STORAGE_BUCKET = "ad.images", PORT = 3000, SLOT_PRICE = "10000",
  TOTAL_SLOTS = "48", PUBLIC_BASE_URL = "http://localhost:3000"
} = process.env;

const db = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }) : null;
const snap = MIDTRANS_SERVER_KEY ? new midtransClient.Snap({
  isProduction: MIDTRANS_PRODUCTION === "true", serverKey: MIDTRANS_SERVER_KEY, clientKey: MIDTRANS_CLIENT_KEY
}) : null;

app.get("/api/config", (_req, res) => res.json({
  slotPrice: Number(SLOT_PRICE), totalSlots: Number(TOTAL_SLOTS),
  midtransReady: Boolean(snap && MIDTRANS_CLIENT_KEY), midtransClientKey: MIDTRANS_CLIENT_KEY,
  midtransProduction: MIDTRANS_PRODUCTION === "true"
}));

app.get("/api/ads", async (_req, res) => {
  if (!db) return res.status(503).json({ error: "Supabase belum dikonfigurasi di server." });
  const { data, error } = await db.from("ads")
    .select("slot_id,name,image_url,target_url,tagline")
    .eq("status", "paid");
  if (error) return res.status(500).json({ error: "Gagal mengambil data iklan." });
  res.json(data || []);
});

// Image upload is handled on the server so the secret service-role key never reaches the browser.
app.post("/api/upload", async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: "Supabase belum dikonfigurasi di server." });
    const { fileName, mimeType, fileBase64 } = req.body || {};
    const allowed = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
    if (!allowed.has(mimeType) || typeof fileBase64 !== "string")
      return res.status(400).json({ error: "Gunakan gambar JPG, PNG, WEBP, atau GIF." });
    const data = Buffer.from(fileBase64, "base64");
    if (!data.length || data.length > 3 * 1024 * 1024)
      return res.status(400).json({ error: "Ukuran gambar maksimal 3 MB." });
    const ext = ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" })[mimeType];
    const safeName = String(fileName || "ad").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
    const objectPath = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}-${safeName || `ad.${ext}`}`;
    const { error } = await db.storage.from(STORAGE_BUCKET).upload(objectPath, data, {
      contentType: mimeType, upsert: false, cacheControl: "3600"
    });
    if (error) {
      console.error("Storage upload error:", error.message);
      return res.status(500).json({ error: "Upload gagal. Pastikan nama bucket di konfigurasi sama persis." });
    }
    const { data: publicData } = db.storage.from(STORAGE_BUCKET).getPublicUrl(objectPath);
    res.json({ imageUrl: publicData.publicUrl });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Terjadi masalah saat upload gambar." });
  }
});

app.post("/api/orders", async (req, res) => {
  let createdAdId = null;
  try {
    if (!db || !snap || !MIDTRANS_CLIENT_KEY)
      return res.status(503).json({ error: "Pembayaran belum dikonfigurasi. Admin perlu mengisi kunci Midtrans di server." });
    const { slotId, name, targetUrl, tagline, email, imageUrl } = req.body || {};
    const slot = Number(slotId);
    if (!Number.isInteger(slot) || slot < 1 || slot > Number(TOTAL_SLOTS)) return res.status(400).json({ error: "Slot tidak valid." });
    if (!name || !targetUrl || !email || !imageUrl) return res.status(400).json({ error: "Data iklan belum lengkap." });
    let parsedUrl;
    try { parsedUrl = new URL(targetUrl); } catch { return res.status(400).json({ error: "Link tujuan tidak valid." }); }
    if (!["http:", "https:"].includes(parsedUrl.protocol)) return res.status(400).json({ error: "Link harus diawali http:// atau https://." });
    if (!String(imageUrl).startsWith(`${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/`))
      return res.status(400).json({ error: "Gambar harus di-upload melalui formulir ini." });

    const orderId = `PIXELADS-${Date.now()}-${slot}-${crypto.randomBytes(3).toString("hex")}`;
    const { data: ad, error: insertError } = await db.from("ads").insert({
      slot_id: slot, name: String(name).slice(0, 60), target_url: parsedUrl.href.slice(0, 500),
      tagline: String(tagline || "").slice(0, 120), email: String(email).slice(0, 200),
      image_url: String(imageUrl).slice(0, 1000), status: "pending", order_id: orderId,
      price: Number(SLOT_PRICE), title: String(name).slice(0, 60), destination_url: parsedUrl.href.slice(0, 500),
      buyer_name: String(name).slice(0, 60)
    }).select("id").single();
    if (insertError) {
      if (insertError.code === "23505") return res.status(409).json({ error: "Slot itu sudah dipesan. Silakan pilih slot lain." });
      console.error("Insert order error:", insertError.message);
      return res.status(500).json({ error: "Gagal menyimpan pesanan. Pastikan SQL penyesuaian sudah dijalankan." });
    }
    createdAdId = ad.id;
    const transaction = await snap.createTransaction({
      transaction_details: { order_id: orderId, gross_amount: Number(SLOT_PRICE) },
      customer_details: { email: String(email).slice(0, 200) },
      item_details: [{ id: `SLOT-${slot}`, price: Number(SLOT_PRICE), quantity: 1, name: `PixelAds Slot ${slot}` }],
      callbacks: { finish: `${PUBLIC_BASE_URL}/?payment=done` }
    });
    await db.from("ads").update({ payment_token: transaction.token }).eq("id", ad.id);
    res.json({ token: transaction.token, orderId });
  } catch (e) {
    console.error(e);
    if (createdAdId && db) await db.from("ads").update({ status: "cancelled" }).eq("id", createdAdId);
    res.status(500).json({ error: "Gagal membuat pesanan. Periksa konfigurasi Supabase dan Midtrans." });
  }
});

app.post("/api/midtrans/notification", async (req, res) => {
  try {
    if (!db || !MIDTRANS_SERVER_KEY) return res.status(503).end();
    const n = req.body || {};
    if (!n.order_id || !n.gross_amount || !n.status_code || !n.signature_key) return res.status(400).end();
    const expected = crypto.createHash("sha512").update(n.order_id + n.status_code + n.gross_amount + MIDTRANS_SERVER_KEY).digest("hex");
    const a = Buffer.from(expected), b = Buffer.from(String(n.signature_key));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(403).end();
    const status = String(n.transaction_status || "").toLowerCase();
    let next = "pending";
    if (status === "settlement" || (status === "capture" && n.fraud_status === "accept")) next = "paid";
    else if (["deny", "cancel", "expire", "failure"].includes(status)) next = "cancelled";
    const { error } = await db.from("ads").update({ status: next, payment_status: status, payment_reference: n.transaction_id || null }).eq("order_id", n.order_id);
    if (error) return res.status(500).end();
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).end(); }
});

app.use((_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
