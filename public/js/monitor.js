/* ==========================================================================
   Monitor screen controller. Views: board, play (question/reveal/mystery),
   and attract (idle loop). The server drives phase changes over Socket.IO;
   this file just renders them and runs the 45s-idle attract loop.
   ========================================================================== */
/* global echarts, createSocket, answerBarOption */

const IDLE_MS = 45000; // show attract after 45s with no activity
const REVEAL_CARD_MS = 4000; // reveal card, then the per-question chart for ~5s
const ATTRACT_SLIDE_MS = 8000;

// Short, varied encouragement shown on the reveal card. No prizes — just cheer.
const CHEER_CORRECT = ["You got it! 🎉", "Nailed it! 🙌", "Data genius! 🧠", "Boom! Correct! 💥"];
const CHEER_INCORRECT = [
  "Great guess! Now you know! 💡",
  "So close! Check out the fun fact! 👀",
  "Nice try — you just learned something! 🌟",
];
const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];

const els = {
  board: document.getElementById("board"),
  play: document.getElementById("play"),
  attract: document.getElementById("attract"),
  boardGrid: document.getElementById("board-grid"),
  boardCount: document.getElementById("board-count"),
  playInner: document.getElementById("play-inner"),
  attractInner: document.getElementById("attract-inner"),
};

let content = null;
let team = [];
let attractMedia = [];
let lastStats = null;
let lastRev = 0;
let attractTimer = null; // idle -> attract
let slideTimer = null; // attract rotation
let revealChartTimer = null;
let chart = null; // active echarts instance (reveal or attract)

// ---- helpers --------------------------------------------------------------
async function getJSON(url) {
  const r = await fetch(url);
  return r.json();
}
function catColor(key) {
  const c = content && content.categories.find((x) => x.key === key);
  return c ? c.color : "#2563eb";
}
function disposeChart() {
  if (revealChartTimer) {
    clearTimeout(revealChartTimer);
    revealChartTimer = null;
  }
  if (chart) {
    chart.dispose();
    chart = null;
  }
}
function showView(name) {
  for (const v of ["board", "play", "attract"]) {
    els[v].hidden = v !== name;
  }
}

// ---- BOARD ----------------------------------------------------------------
function renderBoard(state) {
  const grid = els.boardGrid;
  grid.innerHTML = "";
  // Row 1: category headers
  content.columns.forEach((col) => {
    const h = document.createElement("div");
    h.className = "col-head";
    h.style.background = col.color;
    h.textContent = col.name;
    grid.appendChild(h);
  });
  // Rows 2-4: question tiles
  for (let row = 0; row < 3; row++) {
    content.columns.forEach((col) => {
      const q = col.questions[row];
      const t = document.createElement("div");
      t.className = "tile";
      if (!q) {
        t.style.visibility = "hidden";
      } else {
        t.style.background = col.color;
        // Jeopardy-style point LABEL (100/200/300). Cosmetic only — no scoring.
        t.textContent = String((row + 1) * 100);
        if (state.usedTiles.includes(q.id)) t.classList.add("used");
      }
      grid.appendChild(t);
    });
  }
  // Mystery row: two "?" tiles spanning the width
  const mrow = document.createElement("div");
  mrow.className = "mystery-row";
  ["mystery-1", "mystery-2"].forEach((id) => {
    const t = document.createElement("div");
    t.className = "tile mystery";
    t.innerHTML = '<span class="ama-big">AMA</span><span class="ama-sub">Ask Us Anything!</span>';
    if (state.usedTiles.includes(id)) t.classList.add("used");
    mrow.appendChild(t);
  });
  grid.appendChild(mrow);

  els.boardCount.textContent = lastStats ? lastStats.totals.dataPoints : 0;
}

// ---- PLAY: question -------------------------------------------------------
function renderQuestion(cur, { reveal = false } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "q-wrap";
  const color = catColor(cur.category);

  const cat = document.createElement("div");
  cat.className = "q-cat";
  cat.style.background = color;
  cat.textContent = cur.categoryName;

  const text = document.createElement("div");
  text.className = "q-text";
  text.textContent = cur.text;

  const answers = document.createElement("div");
  answers.className = "answers";
  cur.answers.forEach((a) => {
    const d = document.createElement("div");
    d.className = "answer";
    d.style.background = a.color;
    if (reveal) {
      if (a.id === cur.correctAnswerId) d.classList.add("correct");
      else d.classList.add("dim");
    }
    d.innerHTML = `<span class="a-emoji emoji">${a.emoji}</span><span>${a.label}</span>`;
    answers.appendChild(d);
  });

  wrap.append(cat, text, answers);
  els.playInner.innerHTML = "";
  els.playInner.appendChild(wrap);
}

// ---- PLAY: reveal ---------------------------------------------------------
function renderRevealCard(cur) {
  disposeChart();
  const correct = cur.answers.find((a) => a.id === cur.correctAnswerId);
  const wrap = document.createElement("div");
  wrap.className = "reveal-wrap";
  const cheer = pickOne(cur.correct ? CHEER_CORRECT : CHEER_INCORRECT);
  wrap.innerHTML = `
    <div class="reveal-big">The answer is…</div>
    <div class="reveal-answer"><span class="emoji">${correct.emoji}</span> ${correct.label}</div>
    <div class="reveal-fact">💡 ${cur.fact}</div>
    <div class="reveal-cheer">${cheer}</div>`;
  els.playInner.innerHTML = "";
  els.playInner.appendChild(wrap);
}

function renderRevealChart(cur) {
  disposeChart();
  const panel = document.createElement("div");
  panel.className = "chart-panel";
  panel.innerHTML = '<div class="chart" id="reveal-chart"></div>';
  els.playInner.innerHTML = "";
  els.playInner.appendChild(panel);

  const q = findQuestionStats(cur.questionId);
  chart = echarts.init(document.getElementById("reveal-chart"));
  if (q) chart.setOption(answerBarOption(q, true));
}

function findQuestionStats(qid) {
  if (lastStats && lastStats.byQuestion) {
    return lastStats.byQuestion.find((q) => q.questionId === qid) || null;
  }
  return null;
}

function renderReveal(cur) {
  const elapsed = Date.now() - (cur.revealAt || Date.now());
  if (elapsed < REVEAL_CARD_MS) {
    renderRevealCard(cur);
    revealChartTimer = setTimeout(() => renderRevealChart(cur), REVEAL_CARD_MS - elapsed);
  } else {
    renderRevealChart(cur);
  }
}

// ---- PLAY: mystery --------------------------------------------------------
function renderMystery(cur) {
  disposeChart();
  const wrap = document.createElement("div");
  wrap.className = "mystery-wrap";
  wrap.innerHTML = `
    <div class="mystery-q emoji">🙋</div>
    <div class="mystery-prompt">${cur.prompt}</div>`;
  els.playInner.innerHTML = "";
  els.playInner.appendChild(wrap);
}
function renderMysteryReveal(cur) {
  disposeChart();
  const wrap = document.createElement("div");
  wrap.className = "mystery-wrap";
  wrap.innerHTML = `
    <div class="mystery-q emoji">🙌</div>
    <div class="mystery-prompt">Great question!<br/>The team will tell you all about it.</div>`;
  els.playInner.innerHTML = "";
  els.playInner.appendChild(wrap);
}

function showPlay(state) {
  showView("play");
  const cur = state.current;
  if (!cur) return;
  if (cur.kind === "question") {
    if (state.phase === "reveal") renderReveal(cur);
    else renderQuestion(cur);
  } else if (cur.kind === "mystery") {
    if (state.phase === "mystery_reveal") renderMysteryReveal(cur);
    else renderMystery(cur);
  }
}

// ---- ATTRACT LOOP ---------------------------------------------------------
function buildSlides() {
  const slides = [];
  // 1) Tap to play
  slides.push(() => {
    const d = document.createElement("div");
    d.className = "attract-slide";
    d.innerHTML = `<div class="attract-hand emoji">👉</div><div class="attract-tap">Tap the iPad to play!</div>`;
    return d;
  });
  // 2) Meet the team (4 quadrants)
  if (team.length) {
    slides.push(() => {
      const d = document.createElement("div");
      d.className = "attract-slide";
      const grid = document.createElement("div");
      grid.className = "team-grid";
      team.slice(0, 4).forEach((m) => {
        const card = document.createElement("div");
        card.className = "team-card";
        card.innerHTML = `
          <img src="/media/team/${m.photo}" alt="" onerror="this.style.visibility='hidden'"/>
          <div class="team-info">
            <div class="t-name">${m.name}</div>
            <div class="t-role">${m.role}</div>
            <div class="t-meta">${m.company} · ${m.years} yrs</div>
            <div class="t-meta">✨ ${m.fun_fact}</div>
          </div>`;
        grid.appendChild(card);
      });
      d.appendChild(grid);
      return d;
    });
  }
  // 3) Any attract media drop-ins
  attractMedia.forEach((m) => {
    slides.push(() => {
      const d = document.createElement("div");
      d.className = "attract-slide";
      if (m.type === "image") {
        d.innerHTML = `<img class="attract-media" src="${m.url}" alt=""/>`;
      } else {
        d.innerHTML = `<video class="attract-media" src="${m.url}" autoplay muted playsinline></video>`;
      }
      return d;
    });
  });
  // 4) Live results chart (category popularity)
  slides.push(() => {
    const d = document.createElement("div");
    d.className = "attract-slide";
    d.innerHTML = `<div class="chart-title">What kids are playing</div>
      <div class="chart-panel" style="width:90vw"><div class="chart" id="attract-chart"></div></div>`;
    setTimeout(() => {
      disposeChart();
      chart = echarts.init(document.getElementById("attract-chart"));
      if (lastStats) chart.setOption(categoryBarOption(lastStats.byCategory, true));
    }, 30);
    return d;
  });
  // 5) Big counter
  slides.push(() => {
    const d = document.createElement("div");
    d.className = "attract-slide";
    const n = lastStats ? lastStats.totals.dataPoints : 0;
    d.innerHTML = `<div class="attract-count">Data points collected today:<b>${n}</b></div>`;
    return d;
  });
  return slides;
}

function enterAttract() {
  showView("attract");
  const slides = buildSlides();
  let i = 0;
  const render = () => {
    disposeChart();
    els.attractInner.innerHTML = "";
    els.attractInner.appendChild(slides[i % slides.length]());
    i++;
  };
  render();
  clearInterval(slideTimer);
  slideTimer = setInterval(render, ATTRACT_SLIDE_MS);
}
function exitAttract() {
  clearInterval(slideTimer);
  slideTimer = null;
  disposeChart();
}
function scheduleAttract() {
  clearTimeout(attractTimer);
  attractTimer = setTimeout(enterAttract, IDLE_MS);
}
function cancelAttract() {
  clearTimeout(attractTimer);
  attractTimer = null;
  if (!els.attract.hidden) exitAttract();
}

// ---- state handling -------------------------------------------------------
function onState(state) {
  if (state.rev !== lastRev) {
    lastRev = state.rev;
    // Board was reset / content may have changed — refresh the layout + media.
    loadContent();
  }
  if (state.phase === "board") {
    // Keep attract running if we are already idling; otherwise show the board.
    if (els.attract.hidden) {
      showView("board");
      renderBoard(state);
    }
    scheduleAttract();
    window._lastBoardState = state;
  } else {
    cancelAttract();
    showPlay(state);
  }
}

function onStats(bundle) {
  lastStats = bundle;
  els.boardCount.textContent = bundle.totals.dataPoints;
  // Live-refresh whichever chart is currently on screen.
  if (chart) {
    const id = chart.getDom().id;
    if (id === "attract-chart") chart.setOption(categoryBarOption(bundle.byCategory, true));
    if (id === "reveal-chart" && window._lastBoardState) {
      /* reveal chart updates itself when rendered */
    }
  }
}

async function loadContent() {
  content = await getJSON("/api/content");
  team = (await getJSON("/api/team")).team || [];
  attractMedia = (await getJSON("/api/attract")).media || [];
}

// ---- boot -----------------------------------------------------------------
(async function () {
  await loadContent();
  const socket = createSocket({ onReconnect: () => {} });
  socket.on("state", onState);
  socket.on("stats", onStats);
  socket.on("reset", () => {
    lastStats = null;
  });
  window.addEventListener("resize", () => chart && chart.resize());
})();
