(() => {
  const POS_LABELS = ["万", "千", "百", "十", "个"];
  const PAGE_SIZE = 30;
  const charts = {};
  let data = null;
  let analysis = null;
  let tableRows = [];
  let page = 1;
  let appeared = new Map(); // compact "81146" -> [{drawNum, drawTime}, ...]
  let lastPicks = [];

  const $ = (id) => document.getElementById(id);

  const fmtMoney = (n) => {
    if (n == null || Number.isNaN(n)) return "—";
    if (n >= 1e8) return (n / 1e8).toFixed(2) + " 亿";
    if (n >= 1e4) return (n / 1e4).toFixed(1) + " 万";
    return String(Math.round(n));
  };

  const fmtInt = (n) => (n == null ? "—" : Number(n).toLocaleString("zh-CN"));

  Chart.defaults.color = "#8aa393";
  Chart.defaults.borderColor = "rgba(255,196,72,0.12)";
  Chart.defaults.font.family = "'IBM Plex Mono', monospace";

  const amber = "#ffc448";
  const mint = "#3dffb5";

  async function boot() {
    const [res, ares] = await Promise.all([
      fetch("./web/data.json"),
      fetch("./web/analysis.json"),
    ]);
    if (!res.ok) throw new Error("无法加载 data.json，请用本地静态服务打开页面");
    if (!ares.ok) throw new Error("无法加载 analysis.json");
    data = await res.json();
    analysis = await ares.json();
    buildAppearedIndex();
    renderHero();
    bindTabs();
    bindRange();
    bindHistory();
    bindTool();
    renderAnalysis();
    renderMarket();
    renderToolMeta();
    renderMath();
  }

  function compactDigits(digits) {
    return digits.map(String).join("");
  }

  function parseFiveDigits(raw) {
    const digits = String(raw || "").replace(/\D/g, "");
    if (digits.length !== 5) return null;
    return digits.split("").map((d) => Number(d));
  }

  function buildAppearedIndex() {
    appeared = new Map();
    for (const r of data.table) {
      const key = compactDigits(r.digits);
      if (!appeared.has(key)) appeared.set(key, []);
      appeared.get(key).push({ drawNum: r.drawNum, drawTime: r.drawTime });
    }
    for (const list of appeared.values()) {
      list.sort((a, b) => a.drawTime.localeCompare(b.drawTime));
    }
  }

  function renderToolMeta() {
    const used = appeared.size;
    const pool = 100000 - used;
    $("toolKpis").innerHTML = [
      ["号码空间", "100,000"],
      ["已开组合", used.toLocaleString("zh-CN")],
      ["未开号池", pool.toLocaleString("zh-CN")],
    ]
      .map(
        ([label, value]) =>
          `<div class="kpi"><span class="label">${label}</span><span class="value">${value}</span></div>`
      )
      .join("");
  }

  function bindTool() {
    $("checkBtn").addEventListener("click", runCheck);
    $("checkInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") runCheck();
    });
    $("pickBtn").addEventListener("click", runPick);
    $("copyBtn").addEventListener("click", copyPicks);
  }

  function runCheck() {
    const digits = parseFiveDigits($("checkInput").value);
    const el = $("checkResult");
    if (!digits) {
      el.className = "tool-result";
      el.textContent = "请输入正好 5 位数字。";
      return;
    }
    const key = compactDigits(digits);
    const hits = appeared.get(key);
    const pretty = digits.join(" ");
    if (!hits || !hits.length) {
      el.className = "tool-result miss";
      el.textContent = `${pretty}  ·  未开过，在未开号池内`;
      return;
    }
    el.className = "tool-result hit";
    const detail = hits
      .map((h) => `${h.drawNum}/${h.drawTime}`)
      .join("，");
    el.textContent = `${pretty}  ·  已开 ${hits.length} 次：${detail}`;
  }

  function randomFresh() {
    for (let i = 0; i < 5000; i++) {
      const n = Math.floor(Math.random() * 100000);
      const key = String(n).padStart(5, "0");
      if (!appeared.has(key)) {
        return key.split("").map(Number);
      }
    }
    throw new Error("抽取失败，请重试");
  }

  function runPick() {
    let n = Number($("pickCount").value) || 5;
    n = Math.max(1, Math.min(50, n));
    $("pickCount").value = String(n);
    const picks = [];
    const used = new Set();
    while (picks.length < n) {
      const digs = randomFresh();
      const key = compactDigits(digs);
      if (used.has(key)) continue;
      used.add(key);
      picks.push(digs);
    }
    lastPicks = picks;
    $("pickList").innerHTML = picks
      .map(
        (d, i) =>
          `<li><span class="idx">#${i + 1}</span><span class="balls">${d
            .map((x) => `<span class="ball">${x}</span>`)
            .join("")}</span><span class="mono">${d.join("")}</span></li>`
      )
      .join("");
  }

  function copyPicks() {
    if (!lastPicks.length) {
      runPick();
    }
    const text = lastPicks.map((d) => d.join(" ")).join("\n");
    navigator.clipboard.writeText(text).then(
      () => {
        $("copyBtn").textContent = "已复制";
        setTimeout(() => {
          $("copyBtn").textContent = "复制";
        }, 1200);
      },
      () => {
        $("copyBtn").textContent = "复制失败";
        setTimeout(() => {
          $("copyBtn").textContent = "复制";
        }, 1200);
      }
    );
  }

  function renderHero() {
    const m = data.meta;
    const latest = m.latest;
    $("metaRange").textContent = `${m.from} → ${m.to} · ${m.count.toLocaleString("zh-CN")} 期`;
    $("latestMeta").textContent = `第 ${latest.drawNum} 期 · ${latest.drawTime}`;
    $("latestDigits").innerHTML = latest.digits
      .map((d) => `<span class="digit">${d}</span>`)
      .join("");
    $("kpiRow").innerHTML = [
      ["本期销售", fmtMoney(latest.saleAmount)],
      ["开奖后奖池", fmtMoney(latest.poolAfter)],
      ["一等奖注数", fmtInt(latest.prizeCount)],
      ["派奖总额", fmtMoney(latest.prizeTotal)],
    ]
      .map(
        ([label, value]) =>
          `<div class="kpi"><span class="label">${label}</span><span class="value">${value}</span></div>`
      )
      .join("");
  }

  function bindTabs() {
    document.querySelectorAll(".tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".tab").forEach((b) => b.classList.remove("is-active"));
        document.querySelectorAll(".panel").forEach((p) => p.classList.remove("is-active"));
        btn.classList.add("is-active");
        const panel = btn.dataset.panel;
        $(`panel-${panel}`).classList.add("is-active");
        $("rangeBar").hidden = !(panel === "analysis" || panel === "shape");
        requestAnimationFrame(() => {
          Object.values(charts).forEach((c) => c.resize());
        });
      });
    });
  }

  function bindRange() {
    $("rangeSelect").addEventListener("change", renderAnalysis);
  }

  function currentStats() {
    const key = $("rangeSelect").value;
    return { key, stats: data[key] };
  }

  function destroyChart(id) {
    if (charts[id]) {
      charts[id].destroy();
      delete charts[id];
    }
  }

  function meanLinePlugin(mean) {
    return {
      id: "meanLine",
      afterDraw(chart) {
        const { ctx, chartArea, scales } = chart;
        const x = scales.x;
        const y = scales.y;
        const py = y.getPixelForValue(mean);
        if (py < chartArea.top || py > chartArea.bottom) return;
        ctx.save();
        ctx.strokeStyle = "rgba(61,255,181,0.55)";
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(chartArea.left, py);
        ctx.lineTo(chartArea.right, py);
        ctx.stroke();
        ctx.fillStyle = mint;
        ctx.font = "11px IBM Plex Mono";
        ctx.fillText(`均值 ${mean.toFixed(0)}`, chartArea.right - 78, py - 6);
        ctx.restore();
      },
    };
  }

  function renderAnalysis() {
    const { key, stats } = currentStats();
    const labels = {
      all: "全部历史",
      recent365: "近 365 期",
      recent100: "近 100 期",
    };
    $("rangeHint").textContent = `${labels[key]} · 样本 ${stats.count} 期`;

    const mean = stats.count * 5 / 10;
    destroyChart("overall");
    charts.overall = new Chart($("chartOverall"), {
      type: "bar",
      data: {
        labels: [...Array(10).keys()].map(String),
        datasets: [
          {
            label: "出现次数",
            data: stats.overall,
            backgroundColor: amber,
            borderRadius: 4,
            maxBarThickness: 36,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, ticks: { precision: 0 } },
        },
      },
      plugins: [meanLinePlugin(mean)],
    });

    renderHeat(stats.byPosition);
    renderPositions(stats.byPosition);
    renderShape(stats);
  }

  function heatColor(t) {
    // t 0..1 → deep green to amber
    const r = Math.round(16 + t * (255 - 16));
    const g = Math.round(40 + t * (196 - 40));
    const b = Math.round(28 + t * (72 - 28));
    return `rgb(${r},${g},${b})`;
  }

  function renderHeat(byPosition) {
    const flat = byPosition.flat();
    const min = Math.min(...flat);
    const max = Math.max(...flat);
    const norm = (v) => (max === min ? 0.5 : (v - min) / (max - min));

    let html = `<div class="corner"></div>`;
    for (let d = 0; d < 10; d++) html += `<div class="colh">${d}</div>`;
    byPosition.forEach((row, i) => {
      html += `<div class="rowh">${POS_LABELS[i]}</div>`;
      row.forEach((v) => {
        const t = norm(v);
        const color = heatColor(t);
        const text = t > 0.55 ? "#1a1204" : "#e8f2ea";
        html += `<div class="cell" style="background:${color};color:${text}" title="${v}">${v}</div>`;
      });
    });
    $("heatMap").innerHTML = html;
  }

  function renderPositions(byPosition) {
    destroyChart("positions");
    const colors = ["#ffc448", "#3dffb5", "#7ec8ff", "#ff8f6b", "#d4a5ff"];
    charts.positions = new Chart($("chartPositions"), {
      type: "bar",
      data: {
        labels: [...Array(10).keys()].map(String),
        datasets: byPosition.map((row, i) => ({
          label: POS_LABELS[i],
          data: row,
          backgroundColor: colors[i],
          borderRadius: 3,
          maxBarThickness: 14,
        })),
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: "bottom",
            labels: { boxWidth: 12, boxHeight: 12 },
          },
        },
        scales: {
          x: { stacked: false, grid: { display: false } },
          y: { beginAtZero: true, ticks: { precision: 0 } },
        },
      },
    });
  }

  function renderShape(stats) {
    const mkBar = (id, canvasId, points, xKey, color) => {
      destroyChart(id);
      charts[id] = new Chart($(canvasId), {
        type: "bar",
        data: {
          labels: points.map((p) => String(p[xKey])),
          datasets: [
            {
              data: points.map((p) => p.n),
              backgroundColor: color,
              borderRadius: 3,
              maxBarThickness: 22,
            },
          ],
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false } },
            y: { beginAtZero: true, ticks: { precision: 0 } },
          },
        },
      });
    };

    mkBar("sum", "chartSum", stats.sumDist, "sum", amber);
    mkBar("span", "chartSpan", stats.spanDist, "span", mint);
    mkBar("odd", "chartOdd", stats.oddDist, "odd", "#7ec8ff");
    mkBar("unique", "chartUnique", stats.uniqueDist, "unique", "#ff8f6b");
  }

  function renderMarket() {
    const m = data.market;
    const labels = m.map((r) => r.drawTime.slice(5));

    const lineOpt = (label, values, color) => {
      const id = label;
      destroyChart(id);
      charts[id] = new Chart($(label === "sale" ? "chartSale" : label === "pool" ? "chartPool" : "chartPrize"), {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              data: values,
              borderColor: color,
              backgroundColor: color + "33",
              fill: true,
              tension: 0.25,
              pointRadius: 0,
              borderWidth: 2,
              spanGaps: true,
            },
          ],
        },
        options: {
          responsive: true,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title: (items) => {
                  const i = items[0].dataIndex;
                  return `${m[i].drawNum} · ${m[i].drawTime}`;
                },
                label: (ctx) => {
                  const v = ctx.parsed.y;
                  if (label === "prize") return ` 注数 ${fmtInt(v)}`;
                  return ` ${fmtMoney(v)}`;
                },
              },
            },
          },
          scales: {
            x: {
              ticks: { maxTicksLimit: 8, maxRotation: 0 },
              grid: { display: false },
            },
            y: {
              ticks: {
                callback: (v) => (label === "prize" ? v : fmtMoney(v)),
              },
            },
          },
        },
      });
    };

    lineOpt("sale", m.map((r) => r.saleAmount), amber);
    lineOpt("pool", m.map((r) => r.poolAfter), mint);
    lineOpt("prize", m.map((r) => r.prizeCount), "#7ec8ff");
  }

  function nearestUnique(t) {
    const cov = analysis.coverage;
    let best = cov.unique[0];
    let bestT = cov.t[0];
    for (let i = 0; i < cov.t.length; i++) {
      if (Math.abs(cov.t[i] - t) < Math.abs(bestT - t)) {
        bestT = cov.t[i];
        best = cov.unique[i];
      }
    }
    return best;
  }

  function verdictClass(p) {
    if (p >= 0.05) return "tag-ok";
    if (p >= 0.01) return "tag-watch";
    return "tag-watch";
  }

  function renderMath() {
    const m = analysis.model;
    const fc = m.firstCollision;
    $("mathVerdict").innerHTML = `
      <h2>判决：公开样本非常接近「独立、均匀、有放回」</h2>
      <p>零假设 H₀：每一期五位号码在 100000 种组合上独立均匀。下面的曲线和检验都在问同一件事——数据有没有偏离这个模型。偏离要同时看统计量和效应大小，不能只看一次越线。</p>
      <p class="desc">样本 ${m.n.toLocaleString("zh-CN")} 期（${m.from} → ${m.to}）。不同号码 ${m.unique.toLocaleString("zh-CN")} 组，理论期望 ${m.expectedUnique.toLocaleString("zh-CN")}，差 ${m.uniqueGap > 0 ? "+" : ""}${m.uniqueGap}。下一期是新号的模型概率约 ${(m.pNew * 100).toFixed(2)}%，是旧号约 ${(m.pRepeat * 100).toFixed(2)}%。这只说明「撞不撞历史」，不改变任意一注仍是 1/100000。</p>
    `;

    $("mathKpis").innerHTML = [
      ["期望唯一数", m.expectedUnique.toLocaleString("zh-CN")],
      ["实际唯一数", m.unique.toLocaleString("zh-CN")],
      ["下一期为新号", (m.pNew * 100).toFixed(2) + "%"],
      ["首次撞号期望", Math.round(m.birthdayExpect) + " 期"],
      ["实际首次撞号", `第 ${fc.t} 期`],
      ["和值均值", `${m.sumMean} / ${m.sumMeanTheory}`],
      ["和值方差", `${m.sumVar} / ${m.sumVarTheory}`],
      ["万千位互信息", `${m.miBits01} bit`],
    ]
      .map(
        ([label, value]) =>
          `<div class="kpi"><span class="label">${label}</span><span class="value">${value}</span></div>`
      )
      .join("");

    const cov = analysis.coverage;
    destroyChart("coverage");
    charts.coverage = new Chart($("chartCoverage"), {
      type: "line",
      data: {
        labels: cov.time,
        datasets: [
          {
            label: "实际 |Sₜ|",
            data: cov.unique,
            borderColor: amber,
            pointRadius: 0,
            borderWidth: 2,
            tension: 0.15,
          },
          {
            label: "理论期望",
            data: cov.theory,
            borderColor: mint,
            pointRadius: 0,
            borderWidth: 2,
            borderDash: [5, 4],
            tension: 0.15,
          },
        ],
      },
      options: lineOpts(),
    });

    const roll = analysis.rolling;
    const theoryRepeat = roll.map((r) =>
      Number((nearestUnique(r.t) / m.N).toFixed(4))
    );
    destroyChart("repeat");
    charts.repeat = new Chart($("chartRepeat"), {
      type: "line",
      data: {
        labels: roll.map((r) => r.drawTime),
        datasets: [
          {
            label: "滚动 365 期撞号率",
            data: roll.map((r) => r.repeatRate),
            borderColor: amber,
            pointRadius: 0,
            borderWidth: 2,
            tension: 0.2,
          },
          {
            label: "理论 |Sₜ|/N",
            data: theoryRepeat,
            borderColor: mint,
            pointRadius: 0,
            borderWidth: 1.5,
            borderDash: [5, 4],
            tension: 0.2,
          },
        ],
      },
      options: lineOpts((v) => (v * 100).toFixed(1) + "%"),
    });

    destroyChart("sumRoll");
    charts.sumRoll = new Chart($("chartSumRoll"), {
      type: "line",
      data: {
        labels: roll.map((r) => r.drawTime),
        datasets: [
          {
            label: "滚动和值均值",
            data: roll.map((r) => r.sumMean),
            borderColor: amber,
            pointRadius: 0,
            borderWidth: 2,
            tension: 0.2,
          },
          {
            label: "理论 22.5",
            data: roll.map(() => 22.5),
            borderColor: mint,
            pointRadius: 0,
            borderWidth: 1.5,
            borderDash: [5, 4],
          },
        ],
      },
      options: lineOpts((v) => Number(v).toFixed(2), false),
    });

    destroyChart("chiRoll");
    charts.chiRoll = new Chart($("chartChiRoll"), {
      type: "line",
      data: {
        labels: roll.map((r) => r.drawTime),
        datasets: [
          {
            label: "滚动 χ²",
            data: roll.map((r) => r.chi2),
            borderColor: "#7ec8ff",
            pointRadius: 0,
            borderWidth: 2,
            tension: 0.2,
          },
          {
            label: "5% 临界 16.92",
            data: roll.map(() => 16.92),
            borderColor: "#ff8f6b",
            pointRadius: 0,
            borderWidth: 1.5,
            borderDash: [5, 4],
          },
        ],
      },
      options: lineOpts((v) => Number(v).toFixed(1)),
    });

    const names = ["万位", "千位", "百位", "十位", "个位", "五位合计"];
    const rows = analysis.positions.map((p) => ({
      name: names[p.pos],
      chi2: p.chi2,
      p: p.p,
      dev: p.maxAbsDev,
    }));
    rows.push({
      name: "五位合计",
      chi2: m.overallChi2,
      p: m.overallP,
      dev: m.overallMaxAbsDev,
    });
    $("posBody").innerHTML = rows
      .map((r) => {
        const read =
          r.p >= 0.05
            ? "与均匀相容"
            : r.p >= 0.01
              ? "贴着临界，看效应量"
              : "名义上偏小，先看偏离幅度";
        const pp = (r.dev * 100).toFixed(2) + " pct";
        return `<tr>
          <td>${r.name}</td>
          <td class="mono">${r.chi2.toFixed(2)}</td>
          <td class="mono ${verdictClass(r.p)}">${r.p.toFixed(4)}</td>
          <td class="mono">${pp}</td>
          <td>${read}</td>
        </tr>`;
      })
      .join("");

    destroyChart("gaps");
    charts.gaps = new Chart($("chartGaps"), {
      type: "bar",
      data: {
        labels: analysis.gaps.map((g) => g.label),
        datasets: [
          {
            data: analysis.gaps.map((g) => g.n),
            backgroundColor: amber,
            borderRadius: 3,
            maxBarThickness: 28,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, ticks: { precision: 0 } },
        },
      },
    });
    const g = analysis.gapStats;
    $("gapNote").textContent = `${g.n} 次再次开出 · 最短 ${g.min} 天 · 中位 ${g.median} 天 · 平均 ${g.mean} 天 · 最长 ${g.max} 天`;

    destroyChart("yearRepeat");
    const yearOpts = lineOpts((v) => (v * 100).toFixed(1) + "%");
    yearOpts.plugins.legend.display = false;
    charts.yearRepeat = new Chart($("chartYearRepeat"), {
      type: "bar",
      data: {
        labels: analysis.yearly.map((y) => y.year),
        datasets: [
          {
            data: analysis.yearly.map((y) => y.repeatRate),
            backgroundColor: mint,
            borderRadius: 3,
            maxBarThickness: 18,
          },
        ],
      },
      options: yearOpts,
    });

    renderYearHeat();

    $("mathNotes").innerHTML = `
      <div>
        <h3>1. 覆盖过程几乎贴理论</h3>
        <p>唯一号码期望公式是 N(1−(1−1/N)ⁿ)。实际 ${m.unique} 对期望 ${m.expectedUnique}，相对差不到 0.2%。首次撞号的生日问题期望大约 ${Math.round(m.birthdayExpect)} 期；数据里第一次是第 ${fc.t} 期（${fc.drawTime}，号码 ${fc.result}，距上次 ${fc.gapDays} 天）。量级一致。</p>
      </div>
      <div>
        <h3>2. 「短期多半不撞」成立，「保证不撞」不成立</h3>
        <p>此刻下一期撞上历史的模型概率约 ${(m.pRepeat * 100).toFixed(2)}%。近 100 期经验撞号率 ${(m.repeatRate100 * 100).toFixed(2)}%，近 365 期 ${(m.repeatRate365 * 100).toFixed(2)}%，近 1000 期 ${(m.repeatRate1000 * 100).toFixed(2)}%。未开号池是约束抽样：候选集里去掉已开组合，并不把某一注的命中率从 1/100000 抬高。</p>
      </div>
      <div>
        <h3>3. 形态矩和位置独立都贴均匀</h3>
        <p>和值理论均值 22.5、方差 ${m.sumVarTheory}，样本是 ${m.sumMean} 与 ${m.sumVar}。万位与千位互信息 ${m.miBits01} bit，相对一位熵 ${m.entropyBits} bit 可以忽略。分位 χ² 都低于 5% 临界；五位合计 χ²=${m.overallChi2}，近似 p≈${m.overallP}，最大频率偏离只有 ${(m.overallMaxAbsDev * 100).toFixed(2)} 个百分点。大样本会把很小的起伏放大成临界附近的 p 值，效应量仍然很小。</p>
      </div>
      <div>
        <h3>4. 滚动窗口允许噪声，不允许长期漂移</h3>
        <p>365 期窗口的 χ² 会不时越过 16.92，这是 9 个自由度下大约每 20 个独立窗口就有一次的事，而且窗口高度重叠，越线会连成一段。要声称「开奖变了」，需要和值均值或某位频率在多年里停在理论带外面。图上没有这种持续偏移。</p>
      </div>
      <div>
        <h3>5. 市场层才可能有经济差异</h3>
        <p>开奖接近均匀时，每个号码概率相同，但热号开出后奖金会被更多注摊薄。那是赔付差异，不是开奖概率差异。未开号、冷号、吉利号要不要买，取决于你在意的是「不和历史重复」这种约束，还是「中了之后少分一点」，两者都不是公式预测下一期。</p>
      </div>
    `;
  }

  function lineOpts(tick, beginZero = true) {
    return {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          position: "bottom",
          labels: { boxWidth: 12, boxHeight: 12 },
        },
      },
      scales: {
        x: {
          ticks: { maxTicksLimit: 6, maxRotation: 0 },
          grid: { display: false },
        },
        y: {
          beginAtZero: beginZero,
          ticks: tick ? { callback: tick } : {},
        },
      },
    };
  }

  function renderYearHeat() {
    const years = analysis.yearly;
    let max = 0.01;
    years.forEach((y) =>
      y.freq.forEach((f) => {
        max = Math.max(max, Math.abs(f - 0.1));
      })
    );
    let html = `<div class="corner"></div>`;
    for (let d = 0; d < 10; d++) html += `<div class="colh">${d}</div>`;
    years.forEach((y) => {
      html += `<div class="rowh">${y.year.slice(2)}</div>`;
      y.freq.forEach((f) => {
        const dev = f - 0.1;
        const t = dev / max; // -1..1
        const color =
          t >= 0
            ? `rgba(255,196,72,${0.15 + 0.85 * t})`
            : `rgba(61,255,181,${0.15 + 0.85 * -t})`;
        const pp = (dev * 100).toFixed(1);
        html += `<div class="cell" style="background:${color};color:#e8f2ea" title="${y.year} 数字偏离 ${pp} pct">${pp}</div>`;
      });
    });
    $("yearHeat").innerHTML = html;
  }

  function bindHistory() {
    tableRows = data.table;
    $("searchInput").addEventListener("input", () => {
      page = 1;
      renderTable();
    });
    $("prevPage").addEventListener("click", () => {
      page = Math.max(1, page - 1);
      renderTable();
    });
    $("nextPage").addEventListener("click", () => {
      const filtered = filteredRows();
      const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
      page = Math.min(pages, page + 1);
      renderTable();
    });
    renderTable();
  }

  function filteredRows() {
    const q = ($("searchInput").value || "").trim().toLowerCase();
    if (!q) return tableRows;
    return tableRows.filter((r) => {
      const balls = r.digits.join("") + " " + r.digits.join(" ");
      return (
        String(r.drawNum).includes(q) ||
        String(r.drawTime).includes(q) ||
        balls.includes(q.replace(/\s+/g, ""))
      );
    });
  }

  function renderTable() {
    const rows = filteredRows();
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (page > pages) page = pages;
    const start = (page - 1) * PAGE_SIZE;
    const slice = rows.slice(start, start + PAGE_SIZE);

    $("tableHint").textContent = `共 ${rows.length.toLocaleString("zh-CN")} 条`;
    $("pageInfo").textContent = `${page} / ${pages}`;
    $("prevPage").disabled = page <= 1;
    $("nextPage").disabled = page >= pages;

    $("historyBody").innerHTML = slice
      .map((r) => {
        const balls = r.digits
          .map((d) => `<span class="ball">${d}</span>`)
          .join("");
        const pdf = r.pdfUrl
          ? `<a class="link" href="${r.pdfUrl}" target="_blank" rel="noopener">PDF</a>`
          : "—";
        return `<tr>
          <td class="mono">${r.drawNum}</td>
          <td class="mono">${r.drawTime}</td>
          <td><span class="balls">${balls}</span></td>
          <td class="mono">${fmtMoney(r.saleAmount)}</td>
          <td class="mono">${fmtMoney(r.poolAfter)}</td>
          <td class="mono">${fmtInt(r.prizeCount)}</td>
          <td>${pdf}</td>
        </tr>`;
      })
      .join("");
  }

  boot().catch((err) => {
    console.error(err);
    $("metaRange").textContent = "数据加载失败";
    $("latestMeta").textContent = err.message || String(err);
  });
})();
