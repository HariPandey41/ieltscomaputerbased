/* IELTS Listening — Computer-Based Mock Test Engine
   Single-file vanilla JS. No build step. Works on GitHub Pages.
   See README.md for how to add a new test. */

(function () {
  "use strict";

  const app = document.getElementById("app");
  const params = new URLSearchParams(location.search);
  const testId = params.get("test");

  const REVIEW_SECONDS = 20;     // pause after each section's audio for checking answers
  const GET_READY_SECONDS = 3;   // pause before each section's audio starts
  const TOTAL_MINUTES = 30;      // shown as overall countdown in the top bar

  const state = {
    test: null,
    sectionIndex: 0,
    answers: {},          // questionId -> answer value
    startedAt: null,
    remainingSeconds: TOTAL_MINUTES * 60,
    timerHandle: null,
  };

  if (!testId) {
    renderError("No test was specified. Go back and choose a test from the home page.");
    return;
  }

  fetch("data/tests-manifest.json")
    .then((r) => r.json())
    .then((manifest) => {
      const entry = manifest.find((t) => t.id === testId);
      if (!entry) throw new Error("Test not found in manifest");
      return fetch(entry.file);
    })
    .then((r) => r.json())
    .then((testData) => {
      state.test = testData;
      renderInstructions();
    })
    .catch(() => {
      renderError("Could not load this test's data file. Check data/tests-manifest.json and the test JSON.");
    });

  // ---------------------------------------------------------------------
  // Screens
  // ---------------------------------------------------------------------

  function renderError(message) {
    app.innerHTML = `
      <div class="instructions-wrap">
        <h1>Something went wrong</h1>
        <p class="subhead">${escapeHtml(message)}</p>
        <a class="btn" href="index.html">Back to test list</a>
      </div>`;
  }

  function renderInstructions() {
    const test = state.test;
    const totalQ = test.sections.reduce((n, s) => n + s.questions.length, 0);
    app.innerHTML = `
      <div class="instructions-wrap">
        <div class="subhead">COMPUTER-BASED PRACTICE · ${test.sections.length} SECTIONS · ${totalQ} QUESTIONS</div>
        <h1>${escapeHtml(test.title)}</h1>
        <div class="rules">
          <ol>
            <li>The recording for each section plays <strong>once, all the way through</strong>. You cannot pause or rewind it, exactly as in the real test.</li>
            <li>Type or select your answers as you listen. You can move between questions inside the current section at any time.</li>
            <li>After each section finishes, you get a short review pause before the next section begins automatically.</li>
            <li>You will not see whether an answer is right or wrong until you finish the whole test.</li>
            <li>Check your speakers or headphones now — there is a volume control on the exam screen.</li>
          </ol>
        </div>
        <div class="audio-warning">Turn your sound on before you begin. Playback cannot be repeated once started.</div>
        <button class="btn" id="start-btn">Start test</button>
      </div>`;
    document.getElementById("start-btn").addEventListener("click", startTest);
  }

  function startTest() {
    state.startedAt = Date.now();
    startGlobalTimer();
    goToSection(0);
  }

  function goToSection(index) {
    state.sectionIndex = index;
    if (index >= state.test.sections.length) {
      finishTest();
      return;
    }
    renderGetReady(index);
  }

  function renderGetReady(index) {
    const section = state.test.sections[index];
    renderTopbar(section.title, false);
    const main = getOrCreateMain();
    let seconds = GET_READY_SECONDS;
    main.innerHTML = `
      <div class="interstitial">
        <div class="home-eyebrow">GET READY</div>
        <h2 style="font-family:var(--serif); font-size:26px; margin:8px 0 0;">${escapeHtml(section.title)}</h2>
        <div class="big-count" id="ready-count">${seconds}</div>
        <p>Audio will start automatically. Make sure your volume is on.</p>
      </div>`;
    const counter = document.getElementById("ready-count");
    const tick = setInterval(() => {
      seconds -= 1;
      if (seconds <= 0) {
        clearInterval(tick);
        renderSection(index);
      } else {
        counter.textContent = seconds;
      }
    }, 1000);
  }

  function renderSection(index) {
    const test = state.test;
    const section = test.sections[index];
    renderTopbar(section.title, true);

    const main = getOrCreateMain();
    main.innerHTML = `
      <div class="audio-strip">
        <span class="audio-label" id="audio-status">▶ Playing section audio…</span>
        <input type="range" id="volume" min="0" max="1" step="0.05" value="1" aria-label="Volume">
        <audio id="section-audio" src="${encodeURI(section.audio)}" preload="auto"></audio>
      </div>
      <div class="exam-main">
        ${section.context ? `<div class="section-context">${escapeHtml(section.context)}</div>` : ""}
        <div class="section-instructions">${escapeHtml(section.instructions)}</div>
        ${section.image ? `<div class="map-image-wrap"><img src="${encodeURI(section.image)}" alt="Diagram for this section"></div>` : ""}
        <div class="question-list" id="question-list"></div>
      </div>
    `;

    renderQuestions(section.questions);
    wireAudio(section, index);
    renderFooter(section.questions);
  }

  function renderQuestions(questions) {
    const list = document.getElementById("question-list");
    list.innerHTML = questions.map(renderQuestionBlock).join("");

    questions.forEach((q) => {
      if (q.type === "fill_blank") {
        const input = document.getElementById(`q${q.id}`);
        input.value = state.answers[q.id] || "";
        input.addEventListener("input", (e) => {
          state.answers[q.id] = e.target.value;
          updatePaletteCell(q.id);
        });
      } else if (q.type === "mcq") {
        document.querySelectorAll(`input[name="q${q.id}"]`).forEach((radio) => {
          radio.checked = state.answers[q.id] === Number(radio.value);
          radio.addEventListener("change", (e) => {
            state.answers[q.id] = Number(e.target.value);
            updatePaletteCell(q.id);
          });
        });
      } else if (q.type === "mcq_multi") {
        document.querySelectorAll(`input[name="q${q.id}"]`).forEach((cb) => {
          const current = state.answers[q.id] || [];
          cb.checked = current.includes(Number(cb.value));
          cb.addEventListener("change", () => {
            const boxes = document.querySelectorAll(`input[name="q${q.id}"]:checked`);
            state.answers[q.id] = Array.from(boxes).map((b) => Number(b.value));
            updatePaletteCell(q.id);
          });
        });
      } else if (q.type === "matching" || q.type === "map_label") {
        const select = document.getElementById(`q${q.id}`);
        select.value = state.answers[q.id] || "";
        select.addEventListener("change", (e) => {
          state.answers[q.id] = e.target.value;
          updatePaletteCell(q.id);
        });
      }
    });
  }

  function renderQuestionBlock(q) {
    let body = "";
    if (q.type === "fill_blank") {
      body = `<div class="q-input"><input type="text" id="q${q.id}" autocomplete="off" spellcheck="false"></div>`;
    } else if (q.type === "mcq") {
      body = `<div class="option-list">${q.options
        .map(
          (opt, i) => `
        <label class="option-row">
          <input type="radio" name="q${q.id}" value="${i}">
          <span>${escapeHtml(opt)}</span>
        </label>`
        )
        .join("")}</div>`;
    } else if (q.type === "mcq_multi") {
      body = `<div class="option-list">${q.options
        .map(
          (opt, i) => `
        <label class="option-row">
          <input type="checkbox" name="q${q.id}" value="${i}">
          <span>${escapeHtml(opt)}</span>
        </label>`
        )
        .join("")}</div>`;
    } else if (q.type === "matching" || q.type === "map_label") {
      body = `<div class="q-input"><select id="q${q.id}">
        <option value="" disabled selected>Choose…</option>
        ${q.options.map((opt) => `<option value="${escapeHtml(opt)}">${escapeHtml(opt)}</option>`).join("")}
      </select></div>`;
    }
    return `
      <div class="question-block" id="block-q${q.id}">
        <div><span class="q-num">${q.id}.</span><span class="q-label">${escapeHtml(q.label)}</span></div>
        ${body}
      </div>`;
  }

  function wireAudio(section, index) {
    const audio = document.getElementById("section-audio");
    const status = document.getElementById("audio-status");
    const volume = document.getElementById("volume");
    let lastAllowed = 0;
    let finished = false;

    volume.addEventListener("input", () => {
      audio.volume = Number(volume.value);
    });

    audio.addEventListener("timeupdate", () => {
      lastAllowed = audio.currentTime;
    });

    // Block rewind/fast-forward, matching real exam behaviour.
    audio.addEventListener("seeking", () => {
      if (Math.abs(audio.currentTime - lastAllowed) > 0.75) {
        audio.currentTime = lastAllowed;
      }
    });

    // Block manual pause; only "ended" should stop playback.
    audio.addEventListener("pause", () => {
      if (!finished && audio.currentTime < audio.duration) {
        audio.play().catch(() => {});
      }
    });

    audio.addEventListener("ended", () => {
      finished = true;
      status.textContent = "■ Section audio finished";
      renderReviewPause(index);
    });

    audio.play().catch(() => {
      status.textContent = "Click anywhere on the page to start audio playback.";
      const resume = () => {
        audio.play();
        document.removeEventListener("click", resume);
      };
      document.addEventListener("click", resume);
    });
  }

  function renderReviewPause(index) {
    const test = state.test;
    const isLast = index === test.sections.length - 1;
    let seconds = REVIEW_SECONDS;

    const banner = document.createElement("div");
    banner.className = "audio-strip";
    banner.style.background = "#F0E6D2";
    banner.innerHTML = `
      <span class="audio-label" id="review-count-label">Review your answers — moving on in ${seconds}s</span>
      <button class="btn btn-ghost" id="continue-now" style="margin-left:auto;">Continue now</button>
    `;
    const strip = document.querySelector(".audio-strip");
    strip.replaceWith(banner);

    const label = document.getElementById("review-count-label");
    const advance = () => {
      clearInterval(tick);
      goToSection(index + 1);
    };
    document.getElementById("continue-now").addEventListener("click", advance);

    const tick = setInterval(() => {
      seconds -= 1;
      if (seconds <= 0) {
        advance();
      } else {
        label.textContent = `Review your answers — moving on in ${seconds}s`;
      }
    }, 1000);
  }

  function renderFooter(questions) {
    let footer = document.querySelector(".exam-footer");
    if (!footer) {
      footer = document.createElement("div");
      footer.className = "exam-footer";
      document.body.appendChild(footer);
    }
    footer.innerHTML = `
      <div class="palette" id="palette"></div>
      <div class="footer-hint">Answered questions are highlighted</div>
    `;
    const palette = document.getElementById("palette");
    palette.innerHTML = questions
      .map((q) => `<button type="button" id="pcell-q${q.id}" data-qid="${q.id}">${q.id}</button>`)
      .join("");
    palette.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        const block = document.getElementById(`block-q${btn.dataset.qid}`);
        if (block) block.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      updatePaletteCell(Number(btn.dataset.qid));
    });
  }

  function updatePaletteCell(qid) {
    const cell = document.getElementById(`pcell-q${qid}`);
    if (!cell) return;
    const answered = isAnswered(state.answers[qid]);
    cell.classList.toggle("answered", answered);
  }

  function isAnswered(value) {
    if (value === undefined || value === null) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "string") return value.trim().length > 0;
    return true;
  }

  function renderTopbar(sectionTitle, showTimer) {
    let bar = document.querySelector(".exam-topbar");
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "exam-topbar";
      app.prepend(bar);
    }
    bar.innerHTML = `
      <div class="topbar-left">
        <span class="topbar-title">${escapeHtml(state.test.title)}</span>
        <span class="topbar-section">${escapeHtml(sectionTitle)}</span>
      </div>
      <div class="topbar-timer" id="topbar-timer">${showTimer ? formatTime(state.remainingSeconds) : "—"}</div>
    `;
  }

  function getOrCreateMain() {
    let wrap = document.querySelector(".exam-main-wrap");
    // We rebuild the body under the topbar each screen; simplest is to just
    // clear everything except the topbar and footer, then return a fresh node.
    document.querySelectorAll(".exam-main, .audio-strip, .interstitial").forEach((n) => n.remove());
    const holder = document.createElement("div");
    app.appendChild(holder);
    return holder;
  }

  function startGlobalTimer() {
    state.timerHandle = setInterval(() => {
      state.remainingSeconds = Math.max(0, state.remainingSeconds - 1);
      const el = document.getElementById("topbar-timer");
      if (el) {
        el.textContent = formatTime(state.remainingSeconds);
        el.classList.toggle("low", state.remainingSeconds <= 120);
      }
      if (state.remainingSeconds === 0) {
        clearInterval(state.timerHandle);
      }
    }, 1000);
  }

  function formatTime(totalSeconds) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  // ---------------------------------------------------------------------
  // Scoring + results
  // ---------------------------------------------------------------------

  function finishTest() {
    clearInterval(state.timerHandle);
    document.querySelector(".exam-footer")?.remove();

    const test = state.test;
    const perSection = [];
    const reviewRows = [];
    let totalCorrect = 0;
    let totalQuestions = 0;

    test.sections.forEach((section) => {
      let correctInSection = 0;
      section.questions.forEach((q) => {
        totalQuestions += 1;
        const userValue = state.answers[q.id];
        const correct = isCorrect(q, userValue);
        if (correct) {
          correctInSection += 1;
          totalCorrect += 1;
        }
        reviewRows.push({ q, userValue, correct });
      });
      perSection.push({ title: section.title, correct: correctInSection, total: section.questions.length });
    });

    const band = estimateBand(totalCorrect);
    renderResults(totalCorrect, totalQuestions, band, perSection, reviewRows);
  }

  function isCorrect(q, userValue) {
    if (!isAnswered(userValue)) return false;
    if (q.type === "fill_blank") {
      const norm = (s) => String(s).trim().toLowerCase();
      return q.answer.some((a) => norm(a) === norm(userValue));
    }
    if (q.type === "mcq") {
      return Number(userValue) === Number(q.answer);
    }
    if (q.type === "mcq_multi") {
      const a = [...q.answer].sort();
      const b = [...userValue].map(Number).sort();
      return a.length === b.length && a.every((v, i) => v === b[i]);
    }
    if (q.type === "matching" || q.type === "map_label") {
      return String(userValue) === String(q.answer);
    }
    return false;
  }

  function formatAnswer(q, value) {
    if (!isAnswered(value)) return "no answer";
    if (q.type === "mcq") return q.options[value];
    if (q.type === "mcq_multi") return value.map((i) => q.options[i]).join(", ");
    return String(value);
  }

  function formatCorrectAnswer(q) {
    if (q.type === "fill_blank") return q.answer[0];
    if (q.type === "mcq") return q.options[q.answer];
    if (q.type === "mcq_multi") return q.answer.map((i) => q.options[i]).join(", ");
    return String(q.answer);
  }

  const BAND_TABLE = [
    [39, 9], [37, 8.5], [35, 8], [32, 7.5], [30, 7],
    [26, 6.5], [23, 6], [18, 5.5], [16, 5], [13, 4.5],
    [10, 4], [8, 3.5], [6, 3], [4, 2.5],
  ];

  function estimateBand(correct) {
    for (const [min, band] of BAND_TABLE) {
      if (correct >= min) return band;
    }
    return 2;
  }

  function renderResults(correct, total, band, perSection, reviewRows) {
    document.querySelectorAll(".exam-topbar").forEach((n) => n.innerHTML = "");
    app.innerHTML = "";

    const wrap = document.createElement("div");
    wrap.className = "results-wrap";
    wrap.innerHTML = `
      <div class="home-eyebrow">TEST COMPLETE</div>
      <h1>Your results</h1>

      <div class="band-banner">
        Estimated band: <strong>${band}</strong> — based on a commonly used approximate
        raw-score conversion. Your actual test-centre band may differ.
      </div>

      <div class="score-cards">
        <div class="score-card"><div class="num">${correct}/${total}</div><div class="label">Overall score</div></div>
        ${perSection
          .map(
            (s, i) => `<div class="score-card"><div class="num">${s.correct}/${s.total}</div><div class="label">${escapeHtml(s.title)}</div></div>`
          )
          .join("")}
      </div>

      <div id="review-list"></div>

      <div class="results-actions">
        <a class="btn" href="index.html">Back to test list</a>
        <a class="btn btn-ghost" href="test.html?test=${encodeURIComponent(state.test.id)}">Retake this test</a>
      </div>
    `;
    app.appendChild(wrap);

    const list = document.getElementById("review-list");
    list.innerHTML = reviewRows
      .map(
        (row) => `
      <div class="review-item ${row.correct ? "correct" : "incorrect"}">
        <span class="mark">${row.correct ? "✓" : "✗"}</span>
        <div class="review-body">
          <div class="rq-label">${row.q.id}. ${escapeHtml(row.q.label)}</div>
          <div class="rq-answers">
            <span class="your">Your answer: ${escapeHtml(formatAnswer(row.q, row.userValue))}</span>
            ${row.correct ? "" : ` · <span class="correct-ans">Correct: ${escapeHtml(formatCorrectAnswer(row.q))}</span>`}
          </div>
        </div>
      </div>`
      )
      .join("");
  }

  // ---------------------------------------------------------------------

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
})();
