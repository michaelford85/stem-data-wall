/* Results dashboard. Subscribes to the live "stats" bundle over Socket.IO and
   redraws four kinds of ECharts: category popularity, percent correct per
   category, answers over time, and answer distribution per question. */
/* global echarts, createSocket, categoryBarOption, percentCorrectOption, timeSeriesOption, answerBarOption */

const charts = {
  category: echarts.init(document.getElementById("c-category")),
  correct: echarts.init(document.getElementById("c-correct")),
  time: echarts.init(document.getElementById("c-time")),
};
const questionCharts = {}; // questionId -> echarts instance
const countEl = document.getElementById("r-count");
const qContainer = document.getElementById("r-questions");

function renderQuestions(byQuestion) {
  byQuestion.forEach((q) => {
    if (!questionCharts[q.questionId]) {
      const card = document.createElement("div");
      card.className = "r-card";
      card.innerHTML = `<div class="r-title">${q.categoryName}</div><div class="r-chart" id="q-${q.questionId}"></div>`;
      qContainer.appendChild(card);
      questionCharts[q.questionId] = echarts.init(card.querySelector(".r-chart"));
    }
    questionCharts[q.questionId].setOption(answerBarOption(q, false));
  });
}

function onStats(b) {
  countEl.textContent = b.totals.dataPoints;
  charts.category.setOption(categoryBarOption(b.byCategory, false));
  charts.correct.setOption(percentCorrectOption(b.byCategory, false));
  charts.time.setOption(timeSeriesOption(b.timeSeries, false));
  renderQuestions(b.byQuestion);
}

const socket = createSocket();
socket.on("stats", onStats);
socket.on("reset", () => {
  // Clear everything immediately so the page reflects an empty DB live.
  countEl.textContent = "0";
});

window.addEventListener("resize", () => {
  Object.values(charts).forEach((c) => c.resize());
  Object.values(questionCharts).forEach((c) => c.resize());
});
