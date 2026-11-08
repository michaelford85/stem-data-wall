/* ==========================================================================
   Controller (iPad) logic. Renders the board / answers / topics from the
   server's game state and sends taps back. Debounces taps (1 per 400ms),
   ignores input during reveal animations, and supports a USB number pad
   (keys 1-5) as a backup input.
   ========================================================================== */
/* global createSocket, makeDebouncer */

const app = document.getElementById("app");
let content = null;
let state = null;
let socket = null;

const allowTap = makeDebouncer(400);

// Only these phases accept input. During reveal/mystery_reveal we ignore taps.
function inputAllowed() {
  return state && (state.phase === "board" || state.phase === "question" || state.phase === "mystery");
}

// ---- render ---------------------------------------------------------------
function render() {
  if (!content || !state) {
    app.innerHTML = `<div class="screen"><div class="c-wait"><div class="big emoji">⏳</div><div class="msg">Loading…</div></div></div>`;
    return;
  }
  switch (state.phase) {
    case "board":
      renderBoard();
      break;
    case "question":
      renderAnswers();
      break;
    case "mystery":
      renderTopics();
      break;
    default:
      renderWait(); // reveal / mystery_reveal
  }
}

function renderBoard() {
  const used = state.usedTiles;
  const parts = [`<div class="screen"><h2>Pick a tile! 🎲</h2><div class="c-board">`];
  // headers
  content.columns.forEach((col) => {
    parts.push(`<div class="c-col-head" style="background:${col.color}">${col.name}</div>`);
  });
  // 3 rows of question tiles
  for (let row = 0; row < 3; row++) {
    content.columns.forEach((col) => {
      const q = col.questions[row];
      if (!q) {
        parts.push(`<div style="visibility:hidden"></div>`);
        return;
      }
      const u = used.includes(q.id) ? " used" : "";
      // Jeopardy-style point LABEL (100/200/300 as difficulty rises). Points
      // are cosmetic only — there is no scoring and nothing extra is stored.
      const points = (row + 1) * 100;
      parts.push(
        `<button class="c-tile${u}" style="background:${col.color}" data-tile="${q.id}">${points}</button>`
      );
    });
  }
  // mystery row
  parts.push(`<div class="c-mystery-row">`);
  ["mystery-1", "mystery-2"].forEach((id) => {
    const u = used.includes(id) ? " used" : "";
    parts.push(
      `<button class="c-tile mystery${u}" data-mystery="${id}">
         <span class="ama-big">AMA</span><span class="ama-sub">Ask Us Anything!</span>
       </button>`
    );
  });
  parts.push(`</div></div><div class="hint">Number pad: 1–4 pick a column · 5 picks an AMA tile</div></div>`);
  app.innerHTML = parts.join("");

  app.querySelectorAll("[data-tile]").forEach((b) =>
    b.addEventListener("click", () => {
      if (allowTap()) socket.emit("pickTile", { questionId: b.dataset.tile });
    })
  );
  app.querySelectorAll("[data-mystery]").forEach((b) =>
    b.addEventListener("click", () => {
      if (allowTap()) socket.emit("pickMystery", { tileId: b.dataset.mystery });
    })
  );
}

function renderAnswers() {
  const cur = state.current;
  const parts = [`<div class="screen"><h2>${cur.text}</h2><div class="c-grid answers">`];
  cur.answers.forEach((a, i) => {
    parts.push(
      `<button class="c-btn" style="background:${a.color}" data-answer="${a.id}">
         <span class="b-emoji emoji">${a.emoji}</span><span>${a.label}</span>
         <span class="b-num">${i + 1}</span>
       </button>`
    );
  });
  parts.push(`</div><div class="hint">Tap your answer — then look at the big screen!</div></div>`);
  app.innerHTML = parts.join("");

  app.querySelectorAll("[data-answer]").forEach((b) =>
    b.addEventListener("click", () => {
      if (allowTap()) socket.emit("answer", { answerId: b.dataset.answer });
    })
  );
}

function renderTopics() {
  const cur = state.current;
  const parts = [`<div class="screen"><h2>Pick a topic to talk about 💬</h2><div class="c-grid topics">`];
  cur.topics.forEach((t, i) => {
    parts.push(
      `<button class="c-btn" style="background:var(--c-mystery)" data-topic="${t.id}">
         <span class="b-emoji emoji">${t.emoji}</span><span>${t.label}</span>
         <span class="b-num">${i + 1}</span>
       </button>`
    );
  });
  parts.push(`</div><div class="hint">A team member taps a topic, then answers out loud.</div></div>`);
  app.innerHTML = parts.join("");

  app.querySelectorAll("[data-topic]").forEach((b) =>
    b.addEventListener("click", () => {
      if (allowTap()) socket.emit("topic", { topicId: b.dataset.topic });
    })
  );
}

function renderWait() {
  app.innerHTML = `<div class="screen"><div class="c-wait">
    <div class="big emoji">👀</div>
    <div class="msg">Look at the big screen!</div>
  </div></div>`;
}

// ---- number pad / keyboard backup -----------------------------------------
window.addEventListener("keydown", (e) => {
  const n = parseInt(e.key, 10);
  if (!Number.isInteger(n) || n < 1 || n > 5) return;
  if (!inputAllowed()) return;
  if (!allowTap()) return;
  socket.emit("number", { n });
});

// ---- boot -----------------------------------------------------------------
(async function () {
  content = await (await fetch("/api/content")).json();
  socket = createSocket();
  socket.on("state", (s) => {
    const prevRev = state && state.rev;
    state = s;
    if (prevRev !== undefined && s.rev !== prevRev) {
      // content may have changed on reset
      fetch("/api/content")
        .then((r) => r.json())
        .then((c) => {
          content = c;
          render();
        });
    }
    render();
  });
  render();
})();
