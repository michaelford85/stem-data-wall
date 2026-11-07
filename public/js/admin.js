/* Admin page: PIN gate + board reset, data reset (with typed confirmation),
   live totals, and CSV export. The PIN is held only in memory for this tab and
   sent as the x-admin-pin header. */
/* global createSocket */

let pin = null;
const $ = (id) => document.getElementById(id);

async function api(path, { method = "GET" } = {}) {
  const res = await fetch(path, {
    method,
    headers: { "x-admin-pin": pin, "Content-Type": "application/json" },
  });
  return res;
}

function renderTotals(t) {
  $("totals").innerHTML = [
    ["Data points", t.dataPoints],
    ["Tile picks", t.tilePicks],
    ["Answers", t.answers],
    ["% correct", t.percentCorrect + "%"],
    ["Mystery topics", t.mysteryTopics],
  ]
    .map(([label, val]) => `<div class="stat"><b>${val}</b><span>${label}</span></div>`)
    .join("");
}

async function refreshTotals() {
  const res = await api("/api/admin/totals");
  if (res.ok) renderTotals(await res.json());
}

// ---- PIN gate -------------------------------------------------------------
$("pin-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  pin = $("pin").value.trim();
  const res = await fetch("/api/admin/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin }),
  });
  const { ok } = await res.json();
  if (!ok) {
    $("pin-error").hidden = false;
    pin = null;
    return;
  }
  $("pin-form").hidden = true;
  $("panel").hidden = false;
  $("export").href = `/api/admin/export.csv?pin=${encodeURIComponent(pin)}`;
  refreshTotals();

  // Live totals via the shared stats feed.
  const socket = createSocket();
  socket.on("stats", (b) => renderTotals(b.totals));
});

// ---- board reset ----------------------------------------------------------
$("reset-board").addEventListener("click", async () => {
  const res = await api("/api/admin/reset-board", { method: "POST" });
  $("board-msg").textContent = res.ok ? "Board reset ✓" : "Failed";
  setTimeout(() => ($("board-msg").textContent = ""), 2500);
});

// ---- data reset (typed confirmation) --------------------------------------
$("reset-data").addEventListener("click", async () => {
  const typed = prompt('This deletes ALL collected data.\nType RESET to confirm:');
  if (typed !== "RESET") {
    $("data-msg").textContent = "Cancelled";
    setTimeout(() => ($("data-msg").textContent = ""), 2000);
    return;
  }
  const res = await api("/api/admin/reset-data", { method: "POST" });
  if (res.ok) {
    const { deleted } = await res.json();
    $("data-msg").textContent = `Deleted ${deleted} events ✓`;
    refreshTotals();
  } else {
    $("data-msg").textContent = "Failed";
  }
  setTimeout(() => ($("data-msg").textContent = ""), 3000);
});
