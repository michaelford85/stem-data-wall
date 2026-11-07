// ===========================================================================
// The game "brain". The SERVER owns all game state so that every input source
// — the iPad, a USB number pad, or GPIO arcade buttons — drives the exact same
// logic. Screens (monitor/controller/results) are just views of this state.
//
// Phases:
//   board          the Jeopardy board (pick a tile)
//   question       a question is up; waiting for an answer
//   reveal         showing the correct answer + fun fact, then the chart
//   mystery        a "?" tile is up; staff pick a topic
//   mystery_reveal "great question!" moment before returning to the board
// ===========================================================================
"use strict";

const config = require("./config");
const { getContent } = require("./content");

const MYSTERY_TILES = ["mystery-1", "mystery-2"];

function createGame({ recordEvent, broadcastState, broadcastStats, broadcastReset }) {
  const state = {
    phase: "board",
    usedTiles: [], // questionIds + mystery tile ids that are "used" (dimmed)
    current: null,
    rev: 1, // bumped whenever the board resets, so clients can refresh content
  };

  let revealTimer = null;

  function totalTileCount() {
    const content = getContent();
    const questionTiles = content.columns.reduce((n, c) => n + c.questions.length, 0);
    return questionTiles + MYSTERY_TILES.length;
  }

  function snapshot() {
    return {
      phase: state.phase,
      usedTiles: state.usedTiles.slice(),
      current: state.current,
      rev: state.rev,
      station: config.station,
    };
  }

  function emit() {
    broadcastState(snapshot());
  }

  function clearTimer() {
    if (revealTimer) {
      clearTimeout(revealTimer);
      revealTimer = null;
    }
  }

  // ---- returning to the board --------------------------------------------
  function toBoard() {
    clearTimer();
    state.current = null;
    state.phase = "board";
    // "Board resets automatically when complete."
    if (state.usedTiles.length >= totalTileCount()) {
      state.usedTiles = [];
      state.rev += 1;
    }
    emit();
  }

  // ---- picking a question tile -------------------------------------------
  function pickTile(questionId) {
    if (state.phase !== "board") return false;
    const content = getContent();
    const question = content.byId[questionId];
    if (!question) return false;
    if (state.usedTiles.includes(questionId)) return false;

    state.usedTiles.push(questionId);
    state.phase = "question";
    state.current = {
      kind: "question",
      category: question.category,
      categoryName: question.categoryName,
      questionId: question.id,
      text: question.text,
      answers: question.answers,
      correctAnswerId: question.correct,
      fact: question.fact,
      chosenAnswerId: null,
      correct: null,
      revealAt: null,
    };

    recordEvent({
      type: "tile_pick",
      category: question.category,
      questionId: question.id,
      answerId: null,
      correct: null,
    });

    emit();
    broadcastStats();
    return true;
  }

  // ---- answering a question ----------------------------------------------
  function answer(answerId) {
    if (state.phase !== "question" || !state.current) return false;
    const valid = state.current.answers.some((a) => a.id === answerId);
    if (!valid) return false;

    const correct = answerId === state.current.correctAnswerId;
    state.current.chosenAnswerId = answerId;
    state.current.correct = correct;
    state.current.revealAt = Date.now();
    state.phase = "reveal";

    recordEvent({
      type: "answer",
      category: state.current.category,
      questionId: state.current.questionId,
      answerId,
      correct,
    });

    emit();
    broadcastStats();

    clearTimer();
    revealTimer = setTimeout(toBoard, config.timing.revealMs);
    return true;
  }

  // ---- mystery tile ------------------------------------------------------
  function pickMysteryTile(tileId) {
    if (state.phase !== "board") return false;
    if (!MYSTERY_TILES.includes(tileId)) return false;
    if (state.usedTiles.includes(tileId)) return false;

    state.usedTiles.push(tileId);
    state.phase = "mystery";
    const content = getContent();
    state.current = {
      kind: "mystery",
      tileId,
      prompt: content.mystery.monitor_prompt,
      topics: content.mystery.topics,
      chosenTopicId: null,
      revealAt: null,
    };
    // No event recorded until a topic is chosen (we store ONLY the topic).
    emit();
    return true;
  }

  function chooseTopic(topicId) {
    if (state.phase !== "mystery" || !state.current) return false;
    const valid = state.current.topics.some((t) => t.id === topicId);
    if (!valid) return false;

    state.current.chosenTopicId = topicId;
    state.current.revealAt = Date.now();
    state.phase = "mystery_reveal";

    recordEvent({
      type: "mystery_topic",
      category: "mystery",
      questionId: null,
      answerId: topicId,
      correct: null,
    });

    emit();
    broadcastStats();

    clearTimer();
    revealTimer = setTimeout(toBoard, config.timing.mysteryRevealMs);
    return true;
  }

  // ---- number-pad / arcade-button input (1-based numbers) ----------------
  // Keys/buttons 1-4 = board columns or answers A-D; 5 = mystery/topic 5.
  function handleNumber(n) {
    const content = getContent();
    if (state.phase === "board") {
      if (n >= 1 && n <= content.columns.length) {
        const col = content.columns[n - 1];
        const next = col.questions.find((q) => !state.usedTiles.includes(q.id));
        if (next) return pickTile(next.id);
        return false;
      }
      if (n === 5) {
        const tile = MYSTERY_TILES.find((t) => !state.usedTiles.includes(t));
        if (tile) return pickMysteryTile(tile);
      }
      return false;
    }
    if (state.phase === "question" && state.current) {
      const a = state.current.answers[n - 1];
      if (a) return answer(a.id);
      return false;
    }
    if (state.phase === "mystery" && state.current) {
      const t = state.current.topics[n - 1];
      if (t) return chooseTopic(t.id);
      return false;
    }
    // Ignore input during reveal animations.
    return false;
  }

  // ---- resets ------------------------------------------------------------
  // Reset only the board (used tiles). Does NOT touch stored events.
  function resetBoard() {
    clearTimer();
    state.usedTiles = [];
    state.current = null;
    state.phase = "board";
    state.rev += 1;
    emit();
  }

  // Called after data is wiped (admin or reset script): clear the board AND
  // tell every screen to clear its charts live.
  function resetAfterDataWipe() {
    resetBoard();
    if (broadcastReset) broadcastReset();
    broadcastStats();
  }

  return {
    snapshot,
    pickTile,
    answer,
    pickMysteryTile,
    chooseTopic,
    handleNumber,
    resetBoard,
    resetAfterDataWipe,
  };
}

module.exports = { createGame, MYSTERY_TILES };
