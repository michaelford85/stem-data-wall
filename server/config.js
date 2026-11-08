// Central place for all configuration read from the environment.
// Loading .env is harmless in Docker (vars already set) and handy for local runs.
"use strict";

const path = require("path");
require("dotenv").config();

const ROOT = path.resolve(__dirname, "..");

const config = {
  root: ROOT,
  port: parseInt(process.env.PORT || "3000", 10),

  // MongoDB — the app always talks to the "mongo" service on the compose network.
  mongoUri:
    process.env.MONGO_URI ||
    "mongodb://datawall_app:change-me-app-password@mongo:27017/datawall?authSource=datawall",
  mongoDb: process.env.MONGO_DB || "datawall",

  // Which table this Pi represents. No personal data — just a label.
  station: process.env.STATION || "table-1",

  // Public host name advertised on the /staff page + QR code (e.g.
  // "datawall.local" or the Pi's <hostname>.local). Written by Ansible from
  // the datawall_host variable. Empty => fall back to the request's Host header.
  datawallHost: process.env.DATAWALL_HOST || "",

  // PIN that unlocks /admin and authorizes the reset-notify call.
  adminPin: String(process.env.ADMIN_PIN || "1234"),

  // Paths to the editable content and the shared DB schema/indexes.
  paths: {
    questions: path.join(ROOT, "content", "questions.yaml"),
    team: path.join(ROOT, "content", "team.yaml"),
    schema: path.join(ROOT, "db", "events.schema.json"),
    indexes: path.join(ROOT, "db", "indexes.json"),
    public: path.join(ROOT, "public"),
    media: path.join(ROOT, "media"),
  },

  // Timing (milliseconds) for the monitor's reveal choreography. The SERVER
  // owns these so the game keeps moving even if a screen disconnects.
  timing: {
    // Reveal card (correct answer + fun fact + a cheer) then the per-question
    // chart for ~5s, then back to the board.
    revealMs: 9000,
    // AMA "great question!" moment before returning to the board.
    mysteryRevealMs: 6000,
  },
};

module.exports = config;
