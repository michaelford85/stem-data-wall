// Content, input, and PIN-protected admin endpoints.
"use strict";

const fs = require("fs");
const path = require("path");
const express = require("express");
const config = require("../config");
const { getContent, getTeam } = require("../content");
const { events } = require("../db");
const stats = require("../stats");

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp"]);
const VIDEO_EXT = new Set([".mp4", ".webm"]);

function createApiRouter({ game }) {
  const router = express.Router();

  // ---- PIN check ----------------------------------------------------------
  // Accept the PIN from a header, JSON body, or query string so it works from
  // fetch(), forms, and the reset scripts alike.
  function pinOk(req) {
    const given = req.get("x-admin-pin") || (req.body && req.body.pin) || req.query.pin;
    return String(given || "") === config.adminPin;
  }
  function requirePin(req, res, next) {
    if (pinOk(req)) return next();
    return res.status(401).json({ error: "Bad or missing PIN" });
  }

  // ---- Content ------------------------------------------------------------
  router.get("/content", (_req, res) => {
    const c = getContent();
    res.json({ categories: c.categories, columns: c.columns, mystery: c.mystery });
  });

  router.get("/team", (_req, res) => {
    res.json({ team: getTeam() });
  });

  router.get("/config", (_req, res) => {
    // Non-secret bits the front-end may want (never the PIN).
    res.json({ station: config.station });
  });

  // List any images/videos dropped into media/attract/ for the attract loop.
  router.get("/attract", (_req, res) => {
    const dir = path.join(config.paths.media, "attract");
    let files = [];
    try {
      files = fs.readdirSync(dir);
    } catch (_e) {
      return res.json({ media: [] });
    }
    const media = files
      .filter((f) => !f.startsWith("."))
      .map((f) => {
        const ext = path.extname(f).toLowerCase();
        if (IMAGE_EXT.has(ext)) return { url: `/media/attract/${encodeURIComponent(f)}`, type: "image" };
        if (VIDEO_EXT.has(ext)) return { url: `/media/attract/${encodeURIComponent(f)}`, type: "video" };
        return null;
      })
      .filter(Boolean);
    res.json({ media });
  });

  // ---- Input (USB number pad routed by the page, or GPIO buttons) ---------
  // Body: { number: 1..5 }. Drives the SAME game logic as the iPad.
  router.post("/input", (req, res) => {
    const n = parseInt(req.body && req.body.number, 10);
    if (!Number.isInteger(n) || n < 1 || n > 9) {
      return res.status(400).json({ error: "number must be 1-9" });
    }
    const ok = game.handleNumber(n);
    res.json({ ok });
  });

  // ---- Admin --------------------------------------------------------------
  router.post("/admin/verify", (req, res) => {
    res.json({ ok: pinOk(req) });
  });

  router.post("/admin/reset-board", requirePin, (_req, res) => {
    game.resetBoard();
    res.json({ ok: true });
  });

  // Wipe all events from the app itself, keeping the collection/schema/indexes,
  // then clear every screen live.
  router.post("/admin/reset-data", requirePin, async (_req, res) => {
    try {
      const before = await events().countDocuments({});
      await events().deleteMany({});
      game.resetAfterDataWipe();
      res.json({ ok: true, deleted: before });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Called by scripts/reset_db.py AFTER it has already wiped/recreated the DB.
  // Just tells the running app to clear the board and push empty charts live.
  router.post("/admin/reset-notify", requirePin, (_req, res) => {
    game.resetAfterDataWipe();
    res.json({ ok: true });
  });

  router.get("/admin/totals", requirePin, async (_req, res) => {
    try {
      res.json(await stats.totals());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Export aggregate answer counts as CSV (no personal data — just counts).
  router.get("/admin/export.csv", requirePin, async (_req, res) => {
    try {
      const rows = await stats.byQuestion();
      const lines = [
        "category,question_id,question_text,answer_id,answer_label,is_correct,count",
      ];
      const esc = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
      for (const q of rows) {
        for (const a of q.answers) {
          lines.push(
            [
              esc(q.categoryName),
              esc(q.questionId),
              esc(q.text),
              esc(a.answerId),
              esc(a.label),
              a.isCorrect ? "yes" : "no",
              a.count,
            ].join(",")
          );
        }
      }
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="stem-data-wall-counts-${new Date().toISOString().slice(0, 10)}.csv"`
      );
      res.send(lines.join("\n") + "\n");
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = { createApiRouter };
