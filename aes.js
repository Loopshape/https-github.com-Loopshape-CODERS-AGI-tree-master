#!/usr/bin/env node
// === Nemodian AES Bridge v3 ===
// AES-secured JSON command bridge with aural-logs

import express from "express";
import CryptoJS from "crypto-js";
import { exec } from "child_process";
import fs from "fs";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// AES key: env var, else derived from ~/.ssh/nemodian.pub
let AES_KEY = process.env.AES_KEY;
if (!AES_KEY) {
  try {
    const pub = fs.readFileSync(`${process.env.HOME}/.ssh/nemodian.pub`, "utf8");
    AES_KEY = CryptoJS.SHA256(pub.trim()).toString().substring(0, 32);
    console.log("🔑 AES key derived from ~/.ssh/nemodian.pub");
  } catch {
    AES_KEY = "nemodian-default-key";
    console.log("⚠️ Fallback AES key used");
  }
}

// === AES helpers ===
function encrypt(data) {
  return CryptoJS.AES.encrypt(JSON.stringify(data), AES_KEY).toString();
}
function decrypt(cipher) {
  const bytes = CryptoJS.AES.decrypt(cipher, AES_KEY);
  return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
}

// === Command endpoint ===
app.post("/ai", async (req, res) => {
  try {
    const { data } = req.body;
    const payload = decrypt(data);
    const cmd = payload.prompt;

    console.log("[Bridge] Executing:", cmd);

    exec(cmd, { shell: "/bin/bash" }, (err, stdout, stderr) => {
      const result = {
        cmd,
        stdout: stdout.toString().trim(),
        stderr: stderr.toString().trim(),
        error: err ? err.message : null,
      };
      const encrypted = encrypt(result);
      res.send(encrypted);
    });
  } catch (e) {
    console.error("❌ Bridge Error:", e.message);
    res.status(500).send(encrypt({ error: e.message }));
  }
});

// === Aural logs: fetch last 200 PM2 lines ===
async function auralLogs() {
  exec("pm2 logs --lines 200 --nostream", (err, stdout, stderr) => {
    if (err) console.error("❌ Aural logs error:", err.message);
    else console.log(`\n--- [AURAL-LOGS ${new Date().toISOString()}] ---\n${stdout}`);
  });
}

// Auto-run aural logs every 24h
setInterval(auralLogs, 24 * 60 * 60 * 1000);

// === Start server ===
const PORT = 8080;
app.listen(PORT, () => {
  console.log(`🚀 Nemodian AES Bridge running at http://localhost:${PORT}/ai`);
  console.log(`🔒 AES key: ${AES_KEY.substring(0, 8)}...`);
  auralLogs(); // initial fetch
});
# PATCH applied directly to file
# PATCH applied directly to file
