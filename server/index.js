// ===========================================================================
// Entry point: Express (static pages + JSON API) + Socket.IO (live updates)
// + the game brain + MongoDB. Serves the monitor, controller, results, admin,
// and staff screens, all from the Pi, all offline.
// ===========================================================================
"use strict";

const path = require("path");
const http = require("http");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const { Server } = require("socket.io");

const config = require("./config");
const db = require("./db");
const stats = require("./stats");
const { createGame } = require("./game");
const { createStatsRouter } = require("./routes/stats");
const { createApiRouter } = require("./routes/api");

// ---- cache-busting --------------------------------------------------------
// Browsers (especially the iPad Home Screen web app and the Pi kiosk) were
// serving STALE JavaScript after a deploy. Two fixes work together:
//   1) HTML pages are sent with Cache-Control: no-cache (always revalidate).
//   2) Every local .js/.css URL in those pages gets a ?v=<version> stamp, so a
//      new deploy changes the URLs and the browser is forced to fetch fresh.
// The version is a short hash of the current JS/CSS contents (so it changes
// exactly when an asset changes), or ASSET_VERSION from the environment (e.g.
// a git SHA passed by Ansible). It is computed once, at startup.
function computeAssetVersion(dir) {
  const hash = crypto.createHash("sha256");
  const walk = (d) => {
    for (const name of fs.readdirSync(d).sort()) {
      const p = path.join(d, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else if (/\.(js|css)$/.test(name)) {
        hash.update(name);
        hash.update(fs.readFileSync(p));
      }
    }
  };
  try {
    walk(dir);
  } catch (err) {
    return "dev";
  }
  return hash.digest("hex").slice(0, 10);
}

const ASSET_VERSION = process.env.ASSET_VERSION || computeAssetVersion(config.paths.public);

// Read an HTML page and stamp ?v=<version> onto its local .js/.css references.
function renderPage(file) {
  const html = fs.readFileSync(path.join(config.paths.public, file), "utf8");
  return html.replace(/(\s(?:src|href)=")(\/[^"?#]+\.(?:js|css))"/g, `$1$2?v=${ASSET_VERSION}"`);
}

async function main() {
  await db.connect();

  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { serveClient: true });

  app.use(express.json());

  // ---- live broadcasting --------------------------------------------------
  function broadcastState(snapshot) {
    io.emit("state", snapshot);
  }
  function broadcastReset() {
    io.emit("reset", { at: Date.now() });
  }
  // Recompute and push the stats bundle, but no more than ~4x/second even if a
  // burst of taps comes in.
  let statsTimer = null;
  function broadcastStats() {
    if (statsTimer) return;
    statsTimer = setTimeout(async () => {
      statsTimer = null;
      try {
        io.emit("stats", await stats.bundle());
      } catch (err) {
        console.error("[stats] broadcast failed:", err.message);
      }
    }, 250);
  }

  // ---- record an (anonymous) event ---------------------------------------
  // The server always stamps station + ts; nothing else is ever added, and the
  // DB's $jsonSchema rejects any stray field anyway.
  async function recordEvent(evt) {
    const doc = {
      type: evt.type,
      category: evt.category ?? null,
      questionId: evt.questionId ?? null,
      answerId: evt.answerId ?? null,
      correct: evt.correct ?? null,
      station: config.station,
      ts: new Date(),
    };
    try {
      await db.events().insertOne(doc);
    } catch (err) {
      console.error("[event] insert rejected:", err.message);
    }
  }

  const game = createGame({ recordEvent, broadcastState, broadcastStats, broadcastReset });

  // ---- routes -------------------------------------------------------------
  app.use("/api/stats", createStatsRouter());
  app.use("/api", createApiRouter({ game, broadcastStats }));

  // Serve vendored assets and page assets.
  app.use(express.static(config.paths.public));
  // Expose media (team photos + attract drop-ins) read-only.
  app.use("/media", express.static(config.paths.media));

  // Pages (each is a small HTML file in public/). Rendered once at startup with
  // ?v=<version> stamped onto its assets, and served with Cache-Control:
  // no-cache so browsers always revalidate the HTML and see the new asset URLs.
  const page = (file) => {
    const html = renderPage(file);
    return (_req, res) => {
      res.set("Cache-Control", "no-cache");
      res.type("html").send(html);
    };
  };
  app.get("/", page("monitor.html"));
  app.get("/controller", page("controller.html"));
  app.get("/results", page("results.html"));
  app.get("/admin", page("admin.html"));
  app.get("/staff", page("staff.html"));

  app.get("/healthz", (_req, res) => res.json({ ok: true }));

  // ---- socket.io ----------------------------------------------------------
  io.on("connection", async (socket) => {
    // Send current state immediately so a freshly-opened screen is correct.
    socket.emit("state", game.snapshot());
    try {
      socket.emit("stats", await stats.bundle());
    } catch (_e) {
      /* ignore on first connect */
    }

    socket.on("pickTile", ({ questionId } = {}) => game.pickTile(questionId));
    socket.on("pickMystery", ({ tileId } = {}) => game.pickMysteryTile(tileId));
    socket.on("answer", ({ answerId } = {}) => game.answer(answerId));
    socket.on("topic", ({ topicId } = {}) => game.chooseTopic(topicId));
    socket.on("number", ({ n } = {}) => game.handleNumber(parseInt(n, 10)));
  });

  server.listen(config.port, () => {
    console.log(`[app] stem-data-wall listening on :${config.port} (station=${config.station})`);
  });

  // Graceful shutdown.
  const shutdown = async () => {
    console.log("[app] shutting down…");
    io.close();
    server.close();
    await db.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[app] fatal:", err);
  process.exit(1);
});
