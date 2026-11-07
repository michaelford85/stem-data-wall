/* Shared Apache ECharts option builders, used by the monitor and the results
   page. `big` makes fonts/labels large for the 1080p crowd monitor. */
/* global echarts */

function _grid(big) {
  return { left: "3%", right: "4%", bottom: big ? "14%" : "10%", top: big ? "14%" : "12%", containLabel: true };
}
function _fs(big, n) {
  return big ? n * 1.9 : n;
}

/* Bar chart of how many kids picked each answer for ONE question.
   The correct answer gets a gold outline + a ⭐. */
function answerBarOption(q, big) {
  const cats = q.answers.map((a) => `${a.emoji}\n${a.label}`);
  const data = q.answers.map((a) => ({
    value: a.count,
    itemStyle: {
      color: a.color,
      borderColor: a.isCorrect ? "#fbbf24" : "transparent",
      borderWidth: a.isCorrect ? _fs(big, 4) : 0,
    },
  }));
  return {
    title: {
      text: (q.text || "").slice(0, 70),
      left: "center",
      textStyle: { fontFamily: "Fredoka", fontSize: _fs(big, 18), color: "#0f172a" },
    },
    grid: _grid(big),
    xAxis: {
      type: "category",
      data: cats,
      axisLabel: {
        fontFamily: "Fredoka",
        fontSize: _fs(big, 13),
        interval: 0,
        lineHeight: _fs(big, 16),
        color: "#334155",
      },
    },
    yAxis: {
      type: "value",
      minInterval: 1,
      axisLabel: { fontFamily: "Fredoka", fontSize: _fs(big, 12), color: "#334155" },
    },
    series: [
      {
        type: "bar",
        data,
        barWidth: "55%",
        label: {
          show: true,
          position: "top",
          fontFamily: "Fredoka",
          fontWeight: 700,
          fontSize: _fs(big, 16),
          color: "#0f172a",
          formatter: (p) => (q.answers[p.dataIndex].isCorrect ? `⭐ ${p.value}` : `${p.value}`),
        },
        itemStyle: { borderRadius: [10, 10, 0, 0] },
      },
    ],
    animationDuration: 600,
  };
}

/* How popular each category is (tile picks + answers). */
function categoryBarOption(byCategory, big) {
  return {
    grid: _grid(big),
    xAxis: {
      type: "category",
      data: byCategory.map((c) => c.name),
      axisLabel: { fontFamily: "Fredoka", fontSize: _fs(big, 13), interval: 0, color: "#334155" },
    },
    yAxis: { type: "value", minInterval: 1, axisLabel: { fontFamily: "Fredoka", fontSize: _fs(big, 12) } },
    series: [
      {
        type: "bar",
        data: byCategory.map((c) => ({ value: c.picks + c.answers, itemStyle: { color: c.color } })),
        barWidth: "55%",
        itemStyle: { borderRadius: [10, 10, 0, 0] },
        label: { show: true, position: "top", fontFamily: "Fredoka", fontWeight: 700, fontSize: _fs(big, 15) },
      },
    ],
    animationDuration: 600,
  };
}

/* Percent correct per category. */
function percentCorrectOption(byCategory, big) {
  return {
    grid: _grid(big),
    xAxis: {
      type: "category",
      data: byCategory.map((c) => c.name),
      axisLabel: { fontFamily: "Fredoka", fontSize: _fs(big, 13), interval: 0, color: "#334155" },
    },
    yAxis: { type: "value", max: 100, axisLabel: { formatter: "{value}%", fontFamily: "Fredoka", fontSize: _fs(big, 12) } },
    series: [
      {
        type: "bar",
        data: byCategory.map((c) => ({ value: c.percentCorrect, itemStyle: { color: c.color } })),
        barWidth: "55%",
        itemStyle: { borderRadius: [10, 10, 0, 0] },
        label: {
          show: true,
          position: "top",
          formatter: "{c}%",
          fontFamily: "Fredoka",
          fontWeight: 700,
          fontSize: _fs(big, 15),
        },
      },
    ],
    animationDuration: 600,
  };
}

/* Answers over time (per minute). */
function timeSeriesOption(series, big) {
  return {
    grid: _grid(big),
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "time",
      axisLabel: { fontFamily: "Fredoka", fontSize: _fs(big, 11), color: "#334155" },
    },
    yAxis: { type: "value", minInterval: 1, axisLabel: { fontFamily: "Fredoka", fontSize: _fs(big, 12) } },
    series: [
      {
        type: "line",
        smooth: true,
        showSymbol: false,
        areaStyle: { opacity: 0.2 },
        lineStyle: { width: _fs(big, 3) },
        itemStyle: { color: "#2563eb" },
        data: series.map((p) => [p.t, p.count]),
      },
    ],
    animationDuration: 600,
  };
}
