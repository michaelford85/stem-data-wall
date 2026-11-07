// Loads and validates the editable game content (questions + team) from YAML.
// Re-reads the files on demand so staff can edit content between games without
// restarting the server (the board re-loads content every time it is shown).
"use strict";

const fs = require("fs");
const yaml = require("js-yaml");
const config = require("./config");

// Simple cache keyed by file mtime so we only re-parse when a file changes.
const cache = new Map();

function loadYaml(file) {
  const stat = fs.statSync(file);
  const key = `${file}:${stat.mtimeMs}`;
  if (cache.has(key)) return cache.get(key);
  const data = yaml.load(fs.readFileSync(file, "utf8"));
  cache.set(key, data);
  return data;
}

/**
 * Returns the full question set as loaded from content/questions.yaml,
 * with a couple of convenience lookups built on top.
 */
function getContent() {
  const q = loadYaml(config.paths.questions);

  // Flat map of questionId -> question object (with its category key attached).
  const byId = {};
  // Ordered list of tiles for the board: 4 columns x 3 rows.
  const columns = q.categories.map((cat) => {
    const qs = (q.questions[cat.key] || []).map((question) => {
      byId[question.id] = { ...question, category: cat.key, categoryName: cat.name };
      return question;
    });
    return { ...cat, questions: qs };
  });

  return {
    categories: q.categories,
    columns,
    byId,
    mystery: q.mystery,
  };
}

/** Returns the team list from content/team.yaml. */
function getTeam() {
  const t = loadYaml(config.paths.team);
  return (t && t.team) || [];
}

module.exports = { getContent, getTeam };
