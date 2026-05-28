/* eslint-disable no-console */
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const { z } = require("zod");
const dotenv = require("dotenv");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { createClient } = require("@supabase/supabase-js");

const { spawn } = require("child_process");

dotenv.config();

const NODE_ENV = process.env.NODE_ENV || "development";
const isProd = NODE_ENV === "production";

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
const JWT_SECRET =
  process.env.JWT_SECRET || (isProd ? "" : "dev-only-change-me-not-for-production");
const ADMIN_SECRET = process.env.ADMIN_SECRET || "";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET || "";
const SUPABASE_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

const supabase = SUPABASE_ENABLED
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

if (isProd) {
  if (!JWT_SECRET || JWT_SECRET.length < 32) {
    console.error(
      "[RetainIQ API] FATAL: Set JWT_SECRET in production (min 32 random characters)."
    );
    process.exit(1);
  }
}

const app = express();
if (process.env.TRUST_PROXY === "1") {
  app.set("trust proxy", 1);
}

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

const corsOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
app.use(
  cors(
    corsOrigins.length
      ? { origin: corsOrigins, credentials: true }
      : { origin: true, credentials: true }
  )
);

app.use(express.json({ limit: "2mb" }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 40),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Try again later." },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.API_RATE_LIMIT_MAX || 200),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Slow down." },
});

app.use("/api/auth", authLimiter);
app.use("/api", apiLimiter);

const PYTHON_BIN = process.env.PYTHON_BIN || "python";
const PYTHON_PREDICT_CLI =
  process.env.PYTHON_PREDICT_CLI ||
  path.join(__dirname, "..", "python", "predict_churn_cli.py");

// ---- Model input schema (from churn_model_metrics.json) ----
const RAW_COLUMNS = [
  "InternetService",
  "OnlineSecurity",
  "OnlineBackup",
  "DeviceProtection",
  "TechSupport",
  "StreamingTV",
  "StreamingMovies",
  "Contract",
  "PaymentMethod",
  "PaperlessBilling",
  "tenure",
  "MonthlyCharges",
];

// ---- Credit system ----
const PRICE_CONFIG = {
  // Base plan
  startingCredits: 200,
  referralCreditsToReferrerOnly: 30,
  // Tool prices for base plan users
  tools: {
    churn_predict_single: { credits: 20 },
    churn_analyze_csv: { baseCredits: 80, creditsPerRow: 5, maxRows: 500 },
    // PDF: no paid API required; we parse text + heuristics (optional OpenAI merge if key set).
    churn_predict_from_extracted_fields: { credits: 20 }, // charged only when PDF yields a full row and we predict
    chat_text_only: { credits: 5 }, // lightweight "ask" without file
  },
};

const DB_DIR = path.join(__dirname, "..", "data");
const DB_PATH = path.join(DB_DIR, "app.db");
fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    referral_code TEXT UNIQUE NOT NULL,
    is_premium INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS credits_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    delta INTEGER NOT NULL,
    reason TEXT NOT NULL,
    meta_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS subscriptions (
    user_id TEXT PRIMARY KEY,
    plan TEXT NOT NULL,
    status TEXT NOT NULL,
    paypal_subscription_id TEXT,
    current_period_end TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

function uuid() {
  return crypto.randomUUID();
}

function getBalance(userId) {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(delta), 0) AS balance FROM credits_ledger WHERE user_id = ?`
    )
    .get(userId);
  return Number(row.balance || 0);
}

function addLedgerEntry(userId, delta, reason, meta) {
  db.prepare(
    `INSERT INTO credits_ledger (user_id, delta, reason, meta_json) VALUES (?, ?, ?, ?)`
  ).run(userId, delta, reason, meta ? JSON.stringify(meta) : null);
}

function computeCreditsCost(toolKey, dynamic) {
  const cfg = PRICE_CONFIG.tools[toolKey];
  if (!cfg) throw new Error(`Unknown toolKey: ${toolKey}`);
  if (toolKey === "churn_analyze_csv") {
    const rows = Number(dynamic?.rows || 0);
    const baseCredits = cfg.baseCredits;
    const creditsPerRow = cfg.creditsPerRow;
    return baseCredits + creditsPerRow * rows;
  }
  return cfg.credits || cfg.baseCredits || 0;
}

function ensureEnoughCredits(user, toolKey, cost, meta) {
  if (user.is_premium) return; // Premium: access to all tools (no credit deduction)
  const balance = getBalance(user.id);
  if (balance < cost) {
    const err = new Error("Not enough credits");
    err.status = 402;
    err.details = {
      balance,
      required: cost,
      toolKey,
    };
    throw err;
  }
  addLedgerEntry(user.id, -Math.trunc(cost), `tool:${toolKey}`, meta || null);
}

function extractBearerToken(req) {
  const h = req.headers.authorization;
  if (!h) return null;
  const parts = h.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return null;
  return parts[1];
}

function verifyLocalJwt(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function verifySupabaseJwt(token) {
  if (!token) return null;
  try {
    if (SUPABASE_JWT_SECRET) {
      return jwt.verify(token, SUPABASE_JWT_SECRET, { algorithms: ["HS256"] });
    }
    return jwt.decode(token);
  } catch {
    return null;
  }
}

function ensureLocalUserForSupabase(supabasePayload) {
  const email = String(supabasePayload?.email || "").trim().toLowerCase();
  if (!email) return null;
  const sub = String(supabasePayload?.sub || "").trim();
  if (!sub) return null;

  const existingByEmail = db.prepare(`SELECT * FROM users WHERE email = ?`).get(email);
  if (existingByEmail) return existingByEmail;

  const id = sub;
  let referral = "";
  for (let i = 0; i < 5; i++) {
    referral = `REF-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
    const exists = db.prepare(`SELECT id FROM users WHERE referral_code = ?`).get(referral);
    if (!exists) break;
  }
  const password_hash = bcrypt.hashSync(`supabase:${sub}`, 10);
  db.prepare(
    `INSERT INTO users (id, email, password_hash, referral_code, is_premium) VALUES (?, ?, ?, ?, 0)`
  ).run(id, email, password_hash, referral);
  addLedgerEntry(id, PRICE_CONFIG.startingCredits, "signup_supabase", { startingCredits: PRICE_CONFIG.startingCredits });
  return db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
}

function requireAuth(req, res, next) {
  const token = extractBearerToken(req);
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const localPayload = verifyLocalJwt(token);
  if (localPayload) {
    const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(localPayload.sub);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    req.user = user;
    return next();
  }

  const supabasePayload = verifySupabaseJwt(token);
  if (!supabasePayload) return res.status(401).json({ error: "Unauthorized" });
  const user = ensureLocalUserForSupabase(supabasePayload);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  req.user = user;
  next();
}

// ---- Auth endpoints ----
const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
  referralCode: z.string().optional(),
});
app.post("/api/auth/signup", (req, res) => {
  const parsed = signupSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const { email, password, referralCode } = parsed.data;

  if (SUPABASE_ENABLED) {
    supabase.auth
      .signUp({
        email,
        password,
        options: {
          data: {
            referral_code: referralCode || null,
            trial_no_card: true,
          },
        },
      })
      .then(({ data, error }) => {
        if (error) return res.status(400).json({ error: error.message });
        return res.json({
          token: data.session?.access_token || null,
          user: {
            id: data.user?.id || null,
            email: data.user?.email || email,
            is_premium: false,
            trial_no_card: true,
            source: "supabase",
          },
        });
      })
      .catch((e) => res.status(500).json({ error: e.message || "Signup failed" }));
    return;
  }

  const existing = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email);
  if (existing) return res.status(409).json({ error: "Email already in use" });

  const id = uuid();
  let referral = "";
  for (let i = 0; i < 5; i++) {
    referral = `REF-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
    const exists = db.prepare(`SELECT id FROM users WHERE referral_code = ?`).get(referral);
    if (!exists) break;
  }

  const password_hash = bcrypt.hashSync(password, 10);
  db.prepare(
    `INSERT INTO users (id, email, password_hash, referral_code, is_premium) VALUES (?, ?, ?, ?, 0)`
  ).run(id, email, password_hash, referral);

  addLedgerEntry(id, PRICE_CONFIG.startingCredits, "signup", {
    startingCredits: PRICE_CONFIG.startingCredits,
  });

  if (referralCode) {
    const refUser = db
      .prepare(`SELECT id FROM users WHERE referral_code = ?`)
      .get(String(referralCode).trim());
    if (refUser && refUser.id !== id) {
      addLedgerEntry(refUser.id, PRICE_CONFIG.referralCreditsToReferrerOnly, "referral", {
        referredUserId: id,
      });
    }
  }

  const token = jwt.sign({ sub: id }, JWT_SECRET, { expiresIn: "30d" });
  res.json({
    token,
    user: {
      id,
      email,
      referralCode: referral,
      is_premium: false,
      creditsBalance: getBalance(id),
    },
  });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
});
app.post("/api/auth/login", (req, res) => {
  const parsed = loginSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const { email, password } = parsed.data;

  if (SUPABASE_ENABLED) {
    supabase.auth
      .signInWithPassword({ email, password })
      .then(({ data, error }) => {
        if (error) return res.status(401).json({ error: error.message });
        if (!data.user) return res.status(401).json({ error: "Invalid credentials" });
        return res.json({
          token: data.session?.access_token || null,
          user: {
            id: data.user.id,
            email: data.user.email,
            is_premium: false,
            source: "supabase",
          },
        });
      })
      .catch((e) => res.status(500).json({ error: e.message || "Login failed" }));
    return;
  }

  const user = db.prepare(`SELECT * FROM users WHERE email = ?`).get(email);
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: "30d" });
  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      referralCode: user.referral_code,
      is_premium: Boolean(user.is_premium),
      creditsBalance: getBalance(user.id),
    },
  });
});

app.get("/api/me", requireAuth, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      is_premium: Boolean(req.user.is_premium),
      referralCode: req.user.referral_code,
      creditsBalance: getBalance(req.user.id),
    },
  });
});

app.post("/api/admin/set-premium", (req, res) => {
  const secret = req.headers["x-admin-secret"];
  if (!ADMIN_SECRET || secret !== ADMIN_SECRET) return res.status(403).json({ error: "Forbidden" });
  const schema = z.object({
    userId: z.string(),
    premium: z.boolean(),
  });
  const parsed = schema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  db.prepare(`UPDATE users SET is_premium = ? WHERE id = ?`).run(parsed.data.premium ? 1 : 0, parsed.data.userId);
  res.json({ ok: true });
});

// ---- Python bridge ----
function runPredictCli(payload) {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_BIN, [PYTHON_PREDICT_CLI], {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        const err = new Error(`Python predict failed (${code})`);
        err.stderr = stderr;
        return reject(err);
      }
      try {
        const json = JSON.parse(stdout.trim() || "{}");
        resolve(json);
      } catch (e) {
        const err = new Error("Failed to parse Python output JSON");
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
      }
    });
    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

function recommendationsFromRow(values, prediction) {
  const actions = [];
  const churnProb = prediction.probability_churn;

  if (prediction.predicted_churn) {
    actions.push("High risk detected: prioritize retention actions immediately.");
  } else {
    actions.push("Lower churn risk: focus on prevention and upsell to keep churn low.");
  }

  const servicePairs = [
    { key: "OnlineSecurity", noVals: ["No", "No internet service"], label: "OnlineSecurity" },
    { key: "OnlineBackup", noVals: ["No", "No internet service"], label: "OnlineBackup" },
    { key: "DeviceProtection", noVals: ["No", "No internet service"], label: "DeviceProtection" },
    { key: "TechSupport", noVals: ["No", "No internet service"], label: "TechSupport" },
    { key: "StreamingTV", noVals: ["No", "No internet service"], label: "StreamingTV" },
    { key: "StreamingMovies", noVals: ["No", "No internet service"], label: "StreamingMovies" },
  ];

  for (const p of servicePairs) {
    const v = String(values[p.key] ?? "").trim();
    if (p.noVals.includes(v)) {
      actions.push(`Offer/enable ${p.label} add-on to improve retention (reduce churn risk).`);
    }
  }

  const contract = String(values.Contract ?? "").trim();
  if (contract === "Month-to-month") {
    actions.push("Consider incentives to move customers from month-to-month to 1-year or 2-year contracts.");
  }

  if (String(values.PaperlessBilling ?? "").trim() === "No") {
    actions.push("Offer paperless billing to reduce administrative churn drivers and improve customer experience.");
  }

  // Always provide a generic "next actions" list
  actions.push("Run a targeted offer campaign for customers similar to this profile.");
  actions.push("Review customer support tickets and proactively resolve issues before the next billing cycle.");

  return {
    churnProbability: churnProb,
    recommendedActions: actions.slice(0, 8),
  };
}

// ---- Tools: churn predict ----
const predictSchema = z.object({
  values: z.record(z.any()).refine(
    (obj) => RAW_COLUMNS.every((k) => Object.prototype.hasOwnProperty.call(obj, k)),
    "Missing required fields"
  ),
});

app.post("/api/tools/churn/predict", requireAuth, async (req, res) => {
  const parsed = predictSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  const user = req.user;
  const cost = PRICE_CONFIG.tools.churn_predict_single.credits;
  try {
    ensureEnoughCredits(user, "churn_predict_single", cost, null);
  } catch (e) {
    return res.status(e.status || 400).json({ error: e.message, details: e.details });
  }

  const result = await runPredictCli({ type: "single", values: parsed.data.values });
  const rec = recommendationsFromRow(parsed.data.values, result);
  res.json({ ...result, recommendations: rec });
});

// ---- Tools: analyze uploaded file (CSV/PDF) ----
const upload = multer({
  dest: path.join(__dirname, "..", "uploads"),
  limits: {
    fileSize: Number(process.env.UPLOAD_MAX_BYTES || 12 * 1024 * 1024),
  },
});

app.post(
  "/api/tools/churn/analyze-file",
  requireAuth,
  upload.single("file"),
  async (req, res) => {
    const user = req.user;
    if (!req.file) return res.status(400).json({ error: "Missing file field" });
    const filename = req.file.originalname || req.file.filename;
    const lower = String(filename).toLowerCase();

    try {
      if (lower.endsWith(".csv")) {
        // We'll let Python handle CSV parsing + batch prediction.
        // Cost depends on number of rows; python returns that count.
        const pythonPayload = { type: "csv", filePath: req.file.path };
        // Price check must know rows; we'll do a cheap python "count" mode.
        const countResult = await runPredictCli({ type: "csv_count", filePath: req.file.path });
        const rows = Number(countResult.rows || 0);
        if (rows > PRICE_CONFIG.tools.churn_analyze_csv.maxRows) {
          return res.status(400).json({
            error: "Too many rows for free MVP limits",
            details: { rows, maxRows: PRICE_CONFIG.tools.churn_analyze_csv.maxRows },
          });
        }

        const cost = computeCreditsCost("churn_analyze_csv", { rows });
        ensureEnoughCredits(user, "churn_analyze_csv", cost, { filename, rows });

        const result = await runPredictCli(pythonPayload);
        res.json({
          filename,
          ...result,
        });
        return;
      }

      if (lower.endsWith(".pdf")) {
        // Free path: pdf-parse text + heuristic patterns (no OpenAI required).
        const pdfParse = require("pdf-parse");
        const pdfBuffer = fs.readFileSync(req.file.path);
        const data = await pdfParse(pdfBuffer);
        let extracted = extractFieldsFromPdfTextHeuristic(data.text || "");

        // Optional: if OPENAI_API_KEY is set, fill gaps (paid); otherwise skip entirely.
        if (process.env.OPENAI_API_KEY) {
          const llm = await extractFieldsWithLLM(data.text || "");
          for (const k of RAW_COLUMNS) {
            if (extracted[k] === undefined && llm[k] !== undefined && llm[k] !== null && llm[k] !== "")
              extracted[k] = llm[k];
          }
        }

        if (!extracted || Object.keys(extracted).length === 0) {
          return res.json({
            filename,
            extracted: {},
            message:
              "Could not read churn fields from this PDF. Export a CSV with the required columns, or use the manual form. Tip: put one line per field, e.g. InternetService: Fiber optic",
          });
        }

        const missing = RAW_COLUMNS.filter((k) => !(k in extracted));
        if (missing.length) {
          return res.json({
            filename,
            extracted,
            missingKeys: missing,
            message:
              "Partial match from PDF. Add the missing fields (CSV or manual form), or put labeled lines in the PDF text.",
          });
        }

        // Full row: same credit as a single prediction (no separate PDF fee).
        const predictCost = PRICE_CONFIG.tools.churn_predict_from_extracted_fields.credits;
        try {
          ensureEnoughCredits(user, "churn_predict_from_extracted_fields", predictCost, {
            filename,
            extractedKeys: Object.keys(extracted),
          });
        } catch (e) {
          return res.status(e.status || 400).json({ error: e.message, details: e.details });
        }

        const result = await runPredictCli({ type: "single", values: extracted });
        const rec = recommendationsFromRow(extracted, result);
        return res.json({
          filename,
          extracted,
          ...result,
          recommendations: rec,
        });
      }

      return res.status(400).json({ error: "Unsupported file type. Upload CSV or PDF." });
    } catch (e) {
      console.error(e);
      const status = e.status || 500;
      res.status(status).json({ error: e.message || "Server error" });
    }
  }
);

/**
 * Extract churn model fields from plain PDF text without any paid API.
 * Works when the PDF contains lines like "InternetService: Fiber optic" or JSON with those keys.
 */
function extractFieldsFromPdfTextHeuristic(text) {
  const out = {};
  if (!text || typeof text !== "string") return out;

  const tryJson = () => {
    const idx = text.indexOf("{");
    if (idx === -1) return null;
    const tail = text.slice(idx);
    for (let end = tail.length; end > 0; end--) {
      try {
        const parsed = JSON.parse(tail.slice(0, end));
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
      } catch {
        // continue
      }
    }
    return null;
  };

  const fromJson = tryJson();
  if (fromJson) {
    for (const k of RAW_COLUMNS) {
      const v = fromJson[k];
      if (v === undefined || v === null || v === "") continue;
      if (k === "tenure" || k === "MonthlyCharges") {
        const n = Number(v);
        if (!Number.isNaN(n)) out[k] = k === "tenure" ? Math.round(n) : n;
      } else {
        out[k] = String(v).trim();
      }
    }
    return out;
  }

  const normalized = text.replace(/\r\n/g, "\n");
  for (const key of RAW_COLUMNS) {
    const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?:^|\\n)\\s*${esc}\\s*[:=]\\s*([^\\n\\r]+)`, "im");
    const m = normalized.match(re);
    if (!m) continue;
    let val = m[1].trim().replace(/\s+/g, " ");
    if (key === "tenure" || key === "MonthlyCharges") {
      const n = parseFloat(String(val).replace(/[^0-9.+-]/g, ""));
      if (!Number.isNaN(n)) out[key] = key === "tenure" ? Math.round(n) : n;
    } else {
      out[key] = val;
    }
  }
  return out;
}

async function extractFieldsWithLLM(text) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {};
  }

  const OpenAI = require("openai").OpenAI;
  const client = new OpenAI({ apiKey });

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {},
    required: RAW_COLUMNS,
  };
  for (const k of RAW_COLUMNS) schema.properties[k] = { type: ["string", "number"] };

  const prompt = [
    "You are extracting structured telecom-churn inputs from a business user's PDF text.",
    "Return ONLY valid JSON matching the required schema.",
    "Use the following keys exactly:",
    RAW_COLUMNS.join(", "),
    "",
    "Constraints:",
    "- If a value is not present, still return a JSON object but omit missing keys (we will detect missing).",
    "- tenure should be a number if possible.",
    "- MonthlyCharges should be a number if possible.",
    "",
    "Text to extract from:",
    text.slice(0, 12000),
  ].join("\n");

  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    messages: [
      { role: "system", content: "JSON extractor. No commentary." },
      { role: "user", content: prompt },
    ],
    temperature: 0.1,
    response_format: { type: "json_object" },
  });

  const content = completion.choices?.[0]?.message?.content;
  if (!content) return {};
  try {
    return JSON.parse(content);
  } catch {
    return {};
  }
}

// ---- Tools: text-only "chat like" helper ----
app.post("/api/chat", requireAuth, async (req, res) => {
  const user = req.user;
  const schema = z.object({
    message: z.string().min(1).max(20000),
    // Optional: keep the chat request compatible with future file uploads
  });
  const parsed = schema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  const cost = PRICE_CONFIG.tools.chat_text_only.credits;
  try {
    ensureEnoughCredits(user, "chat_text_only", cost, { kind: "text-only" });
  } catch (e) {
    return res.status(e.status || 400).json({ error: e.message, details: e.details });
  }

  const missingHint = `To predict churn, we need these fields: ${RAW_COLUMNS.join(", ")}. You can either paste them (matching the keys) or upload a CSV/PDF.`;

  res.json({
    reply: "I can help you run churn analysis. " + missingHint,
    next: {
      recommendedAction: "Upload a CSV with required columns or use the churn prediction form.",
    },
  });
});

let apiVersion = "1.0.0";
try {
  apiVersion = require(path.join(__dirname, "..", "package.json")).version || apiVersion;
} catch {
  /* ignore */
}

app.get("/api/health", (req, res) =>
  res.json({ ok: true, service: "retainiq-api", version: apiVersion, env: NODE_ENV })
);

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  const status = Number(err.status || err.statusCode || 500);
  const safe =
    isProd && status >= 500
      ? { error: "Internal server error" }
      : { error: err.message || "Internal server error", details: err.details };
  res.status(status >= 400 && status < 600 ? status : 500).json(safe);
});

app.listen(PORT, () => {
  console.log(`[RetainIQ API] ${apiVersion} listening on port ${PORT} (${NODE_ENV})`);
});

