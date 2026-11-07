// Read-only JSON stats endpoints. Consumed by the ECharts pages AND by Grafana
// (Infinity data source). No authentication — these contain only anonymous,
// aggregate counts.
"use strict";

const express = require("express");
const stats = require("../stats");

function createStatsRouter() {
  const router = express.Router();

  // Small helper so each route reports errors cleanly instead of hanging.
  const wrap = (fn) => async (req, res) => {
    try {
      res.json(await fn(req));
    } catch (err) {
      console.error(`[stats] ${req.path} failed:`, err.message);
      res.status(500).json({ error: err.message });
    }
  };

  router.get("/totals", wrap(() => stats.totals()));
  router.get("/by-question", wrap((req) => stats.byQuestion(req.query.questionId || null)));
  router.get("/by-category", wrap(() => stats.byCategory()));
  router.get(
    "/time-series",
    wrap((req) =>
      stats.timeSeries({
        type: req.query.type || null,
        minutes: req.query.minutes ? parseInt(req.query.minutes, 10) : 180,
      })
    )
  );
  router.get("/by-station", wrap(() => stats.byStation()));
  router.get("/latest", wrap((req) => stats.latest(req.query.limit ? parseInt(req.query.limit, 10) : 10)));

  return router;
}

module.exports = { createStatsRouter };
