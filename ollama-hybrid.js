// ollama-hybrid.js
// ===================================================================
// Hybrid server: serves your model-pool HTML + proxies all Ollama API
// ===================================================================

import express from "express";
import fetch from "node-fetch";
import { createServer } from "http";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 11435;                 // where your hybrid app runs
const OLLAMA_API = "http://127.0.0.1:11434";  // Ollama daemon
const INDEX_FILE = path.join(__dirname, "index.html");

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

// Serve your local index.html
app.get("/", (req, res) => {
  try {
    const html = fs.readFileSync(INDEX_FILE, "utf8");
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  } catch (e) {
    res.status(500).send(`<pre>index.html not found:\n${e}</pre>`);
  }
});

// Utility for streaming upstream responses
function streamProxy(res, upstreamResponse) {
  res.setHeader(
    "Content-Type",
    upstreamResponse.headers.get("content-type") || "application/json"
  );
  res.setHeader("Transfer-Encoding", "chunked");
  upstreamResponse.body.pipe(res);
}

// Proxy helpers
async function forward(req, res, endpoint) {
  try {
    const body = req.method === "POST" ? JSON.stringify(req.body) : undefined;
    const response = await fetch(`${OLLAMA_API}${endpoint}`, {
      method: req.method,
      headers: { "Content-Type": "application/json" },
      body,
    });
    streamProxy(res, response);
  } catch (err) {
    res.status(502).json({ error: "Bridge failed", details: err.message });
  }
}

// API endpoints
app.post("/api/generate", (req, res) => forward(req, res, "/api/generate"));
app.post("/api/chat", (req, res) => forward(req, res, "/api/chat"));
app.post("/api/pull", (req, res) => forward(req, res, "/api/pull"));
app.post("/api/create", (req, res) => forward(req, res, "/api/create"));
app.get("/api/tags", (req, res) => forward(req, res, "/api/tags"));
app.get("/health", (_, res) =>
  res.json({ bridge: true, target: OLLAMA_API, status: "ok" })
);

// Catch-all
app.use((req, res) => {
  res.status(404).json({ error: "Not Found", route: req.originalUrl });
});

// Start server
createServer(app).listen(PORT, () => {
  console.log(`
🧠  OLLAMA HYBRID SERVER READY
📄  Serving: ${INDEX_FILE}
🌐  Web UI: http://localhost:${PORT}
🔗  Proxy → ${OLLAMA_API}
`);
});
