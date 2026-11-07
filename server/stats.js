// ===========================================================================
// Aggregation queries over the (anonymous) events collection. These power BOTH
// the ECharts pages (via Socket.IO + /api/stats) AND Grafana (via the Infinity
// data source reading the same /api/stats endpoints). One set of queries, two
// front-ends.
// ===========================================================================
"use strict";

const { events } = require("./db");
const { getContent } = require("./content");

/** Overall totals, including the big "data points collected today" number. */
async function totals() {
  const coll = events();
  const byType = await coll
    .aggregate([{ $group: { _id: "$type", n: { $sum: 1 } } }])
    .toArray();
  const map = Object.fromEntries(byType.map((r) => [r._id, r.n]));

  const answered = await coll.countDocuments({ type: "answer" });
  const correct = await coll.countDocuments({ type: "answer", correct: true });
  const total = await coll.countDocuments({});

  return {
    dataPoints: total, // the headline counter on the monitor
    total,
    tilePicks: map.tile_pick || 0,
    answers: map.answer || 0,
    mysteryTopics: map.mystery_topic || 0,
    correct,
    incorrect: answered - correct,
    percentCorrect: answered ? Math.round((correct / answered) * 100) : 0,
  };
}

/**
 * Answer distribution for every question (or one question if questionId given).
 * Returns the question text/answers joined with live counts so charts are
 * self-describing.
 */
async function byQuestion(questionId = null) {
  const coll = events();
  const content = getContent();

  const match = { type: "answer" };
  if (questionId) match.questionId = questionId;

  const counts = await coll
    .aggregate([
      { $match: match },
      { $group: { _id: { questionId: "$questionId", answerId: "$answerId" }, n: { $sum: 1 } } },
    ])
    .toArray();

  // index counts by questionId -> answerId -> n
  const idx = {};
  for (const r of counts) {
    const q = r._id.questionId;
    const a = r._id.answerId;
    (idx[q] = idx[q] || {})[a] = r.n;
  }

  const ids = questionId ? [questionId] : Object.keys(content.byId);
  return ids
    .filter((id) => content.byId[id])
    .map((id) => {
      const q = content.byId[id];
      const perAnswer = idx[id] || {};
      return {
        questionId: id,
        text: q.text,
        category: q.category,
        categoryName: q.categoryName,
        correct: q.correct,
        total: Object.values(perAnswer).reduce((s, n) => s + n, 0),
        answers: q.answers.map((a) => ({
          answerId: a.id,
          label: a.label,
          emoji: a.emoji,
          color: a.color,
          isCorrect: a.id === q.correct,
          count: perAnswer[a.id] || 0,
        })),
      };
    });
}

/** Category popularity (picks + answers) and percent correct per category. */
async function byCategory() {
  const coll = events();
  const content = getContent();

  const picks = await coll
    .aggregate([
      { $match: { type: { $in: ["tile_pick", "answer"] } } },
      {
        $group: {
          _id: "$category",
          picks: { $sum: { $cond: [{ $eq: ["$type", "tile_pick"] }, 1, 0] } },
          answers: { $sum: { $cond: [{ $eq: ["$type", "answer"] }, 1, 0] } },
          correct: { $sum: { $cond: [{ $eq: ["$correct", true] }, 1, 0] } },
        },
      },
    ])
    .toArray();
  const idx = Object.fromEntries(picks.map((r) => [r._id, r]));

  return content.categories.map((cat) => {
    const r = idx[cat.key] || { picks: 0, answers: 0, correct: 0 };
    return {
      category: cat.key,
      name: cat.name,
      color: cat.color,
      picks: r.picks,
      answers: r.answers,
      correct: r.correct,
      percentCorrect: r.answers ? Math.round((r.correct / r.answers) * 100) : 0,
    };
  });
}

/**
 * Per-minute time series of events. Optional ?type= filter (e.g. "answer").
 * Returns [{ t: ISO-minute, count }] sorted ascending.
 */
async function timeSeries({ type = null, minutes = 180 } = {}) {
  const coll = events();
  const since = new Date(Date.now() - minutes * 60 * 1000);
  const match = { ts: { $gte: since } };
  if (type) match.type = type;

  const rows = await coll
    .aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            $dateTrunc: { date: "$ts", unit: "minute" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ])
    .toArray();

  return rows.map((r) => ({ t: r._id.toISOString(), count: r.count }));
}

/** Event counts grouped by station. */
async function byStation() {
  const coll = events();
  const rows = await coll
    .aggregate([{ $group: { _id: "$station", count: { $sum: 1 } } }, { $sort: { count: -1 } }])
    .toArray();
  return rows.map((r) => ({ station: r._id, count: r.count }));
}

/** The latest N events, newest first (used by the Grafana table panel). */
async function latest(limit = 10) {
  const coll = events();
  const rows = await coll
    .find({}, { projection: { _id: 0 } })
    .sort({ ts: -1 })
    .limit(limit)
    .toArray();
  return rows.map((r) => ({
    ts: r.ts instanceof Date ? r.ts.toISOString() : r.ts,
    type: r.type,
    category: r.category,
    questionId: r.questionId,
    answerId: r.answerId,
    correct: r.correct,
    station: r.station,
  }));
}

/** One bundle with everything the live ECharts pages need (pushed over Socket.IO). */
async function bundle() {
  const [t, q, c, ts, st] = await Promise.all([
    totals(),
    byQuestion(),
    byCategory(),
    timeSeries({ type: "answer" }),
    byStation(),
  ]);
  return { totals: t, byQuestion: q, byCategory: c, timeSeries: ts, byStation: st };
}

module.exports = { totals, byQuestion, byCategory, timeSeries, byStation, latest, bundle };
