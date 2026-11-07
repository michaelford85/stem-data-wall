// ===========================================================================
// Entry point: Express (static pages + JSON API) + Socket.IO (live updates)
// + the game brain + MongoDB. Serves the monitor, controller, results, admin,
// and staff screens, all from the Pi, all offline.
// ===========================================================================
"use strict";

const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");

const config = require("./config");
const db = require("./db");
const stats = require("./stats");
const { createGame } = require("./game");
const { createStatsRouter } = require("./routes/stats");
const { createApiRouter } = require("./routes/api");

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
  app.use("/api", createApiRouter({ game }));

  // Serve vendored assets and page assets.
  app.use(express.static(config.paths.public));
  // Expose media (team photos + attract drop-ins) read-only.
  app.use("/media", express.static(config.paths.media));

  // Pages (each is a small static HTML file in public/).
  const page = (file) => (_req, res) => res.sendFile(path.join(config.paths.public, file));
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
