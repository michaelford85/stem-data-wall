// MongoDB connection + one-time setup of the events collection.
//
// The collection, its $jsonSchema validator, and its indexes are defined ONCE
// in db/events.schema.json and db/indexes.json and applied here at startup.
// scripts/reset_db.py --all re-applies the exact same definitions, so the app
// and the scripts can never drift apart.
"use strict";

const fs = require("fs");
const { MongoClient } = require("mongodb");
const config = require("./config");

let client;
let db;

const schemaDef = JSON.parse(fs.readFileSync(config.paths.schema, "utf8"));
const indexDefs = JSON.parse(fs.readFileSync(config.paths.indexes, "utf8"));

// The validator MongoDB wants is just the { $jsonSchema: {...} } object.
const validator = { $jsonSchema: schemaDef.$jsonSchema };

/**
 * Connect to MongoDB (retrying a few times while the container starts) and
 * make sure the events collection, validator, and indexes exist.
 */
async function connect({ retries = 15, delayMs = 2000 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      client = new MongoClient(config.mongoUri, { serverSelectionTimeoutMS: 3000 });
      await client.connect();
      db = client.db(config.mongoDb);
      await ensureCollection();
      console.log(`[db] connected to MongoDB (db=${config.mongoDb})`);
      return db;
    } catch (err) {
      lastErr = err;
      console.warn(`[db] connect attempt ${attempt}/${retries} failed: ${err.message}`);
      if (client) await client.close().catch(() => {});
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error(`Could not connect to MongoDB after ${retries} attempts: ${lastErr}`);
}

/**
 * Create the events collection with its validator if missing, or make sure an
 * existing collection has the validator applied. Then ensure indexes. Safe to
 * call repeatedly (idempotent).
 */
async function ensureCollection() {
  const existing = await db.listCollections({ name: "events" }).toArray();
  if (existing.length === 0) {
    await db.createCollection("events", {
      validator,
      validationLevel: "strict",
      validationAction: "error",
    });
    console.log("[db] created 'events' collection with schema validation");
  } else {
    // Keep the validator in sync with the file (e.g. after an edit). This is
    // best-effort: if the app user is not allowed to run collMod, log it and
    // carry on rather than crash-looping — the validator from create-time still
    // applies.
    try {
      await db.command({
        collMod: "events",
        validator,
        validationLevel: "strict",
        validationAction: "error",
      });
    } catch (err) {
      console.warn(`[db] could not update validator (keeping existing): ${err.message}`);
    }
  }

  const events = db.collection("events");
  for (const idx of indexDefs) {
    const { _comment, key, name, ...opts } = idx;
    await events.createIndex(key, { name, ...opts });
  }
}

function getDb() {
  if (!db) throw new Error("Database not connected yet");
  return db;
}

function events() {
  return getDb().collection("events");
}

async function close() {
  if (client) await client.close();
}

module.exports = { connect, getDb, events, close };
