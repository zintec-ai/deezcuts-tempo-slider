// The tempo control UI for a standalone SoundCloud embed. ui.js (in the
// widget frame) uses it. The UI is in a closed Shadow DOM, so the page
// CSS and the UI CSS do not affect each other.
//
// Usage:
//   const panel = TempoPanel.create({ onChange });
//   onChange({ rate, preservesPitch }) runs after each user change.
//   panel.setStatus(text), panel.remove()
// The panel shows at the top right of the widget.

// eslint-disable-next-line no-var
var TempoPanel = (() => {
  "use strict";

  // Slider range in +/- percent. The same ranges as fader.js (50 = WIDE).
  const RANGES = [6, 10, 16, 50];
  const FINE_STEP = 0.1; // percent per click on the - and + buttons

  const CSS = `
    :host { all: initial; }
    .wrap {
      position: fixed; top: 6px; right: 6px; z-index: 2147483647;
      font: 11px/1.3 system-ui, sans-serif; color: #222;
      display: flex; flex-direction: column; align-items: flex-end; gap: 4px;
    }
    button, select, input { font: inherit; }
    .toggle {
      background: #ff5500; color: #fff; border: 0; border-radius: 3px;
      padding: 2px 6px; cursor: pointer; font-weight: 600;
      font-variant-numeric: tabular-nums; opacity: 0.9;
    }
    .toggle:hover { opacity: 1; }
    .toggle.off { background: #333; }
    .panel {
      background: rgba(255,255,255,0.97); border: 1px solid #ccc; border-radius: 4px;
      padding: 6px 8px; width: 230px; box-shadow: 0 2px 8px rgba(0,0,0,0.25);
      display: none; flex-direction: column; gap: 5px;
    }
    .panel.open { display: flex; }
    .row { display: flex; align-items: center; gap: 5px; }
    .row > input[type=range] { flex: 1; min-width: 0; accent-color: #ff5500; }
    .fine { width: 22px; padding: 0; cursor: pointer; }
    .bpm { width: 54px; }
    .grow { flex: 1; }
    .muted { color: #777; }`;

  // Builds the DOM with createElement, not innerHTML (store reviewers
  // flag innerHTML).
  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k === "checked") el.checked = v;
      else el.setAttribute(k, v);
    }
    el.append(...children);
    return el;
  }

  const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d;

  function create({ onChange = () => {} } = {}) {
    const state = { pct: 0, range: 6, preservesPitch: true, originalBpm: null, open: false };
    const rate = () => 1 + state.pct / 100;

    const host = document.createElement("div");
    host.setAttribute("data-tempo-slider", "");
    const root = host.attachShadow({ mode: "closed" });

    const toggle = h("button", { class: "toggle off", title: "Tempo control", text: "±0.0%" });
    const slider = h("input", { type: "range", class: "slider", step: "0.05", "aria-label": "Tempo in percent" });
    const fineDown = h("button", { class: "fine", title: `-${FINE_STEP}%`, text: "−" });
    const fineUp = h("button", { class: "fine", title: `+${FINE_STEP}%`, text: "+" });
    const pctLabel = h("span", { class: "pct grow" });
    const rangeSel = h(
      "select",
      { class: "range", "aria-label": "Slider range" },
      ...RANGES.map((r) => h("option", { value: String(r), text: r === 50 ? "WIDE ±50%" : `±${r}%` })),
    );
    const resetBtn = h("button", { class: "reset", title: "Reset to 0%", text: "0" });
    const lock = h("input", { type: "checkbox", class: "lock", checked: true });
    const origInput = h("input", {
      type: "number", class: "bpm orig", min: "20", max: "400", step: "0.1", placeholder: "orig.",
    });
    const targetInput = h("input", {
      type: "number", class: "bpm target", min: "10", max: "800", step: "0.1",
      placeholder: "target", "aria-label": "Target BPM",
    });
    const status = h("div", { class: "status muted" });
    const panel = h(
      "div",
      { class: "panel", role: "group", "aria-label": "Tempo control" },
      h("div", { class: "row" }, fineDown, slider, fineUp),
      h("div", { class: "row" }, pctLabel, rangeSel, resetBtn),
      h("div", { class: "row" }, h("label", { class: "grow" }, lock, " Key lock")),
      h("div", { class: "row" }, h("label", {}, "BPM ", origInput), h("span", { text: "→" }), targetInput),
      status,
    );
    const wrap = h("div", { class: "wrap" }, toggle, panel);
    root.append(h("style", { text: CSS }), wrap);

    function emit() {
      onChange({ rate: rate(), preservesPitch: state.preservesPitch });
    }

    function setPct(pct) {
      const max = Math.max(...RANGES);
      state.pct = round(Math.min(max, Math.max(-max, pct)), 2);
      // Make the slider range larger when the value is outside of it.
      if (Math.abs(state.pct) > state.range) {
        state.range = RANGES.find((r) => r >= Math.abs(state.pct)) ?? max;
      }
      render();
      emit();
    }

    function render() {
      const sign = state.pct > 0 ? "+" : state.pct < 0 ? "−" : "±";
      toggle.textContent = `${sign}${Math.abs(state.pct).toFixed(1)}%`;
      toggle.classList.toggle("off", state.pct === 0);
      slider.min = String(-state.range);
      slider.max = String(state.range);
      slider.value = String(state.pct);
      rangeSel.value = String(state.range);
      pctLabel.textContent = `${state.pct >= 0 ? "+" : "−"}${Math.abs(state.pct).toFixed(2)}% (${rate().toFixed(3)}×)`;
      lock.checked = state.preservesPitch;
      panel.classList.toggle("open", state.open);
      if (state.originalBpm && root.activeElement !== targetInput) {
        targetInput.value = String(round(state.originalBpm * rate(), 1));
      }
    }

    toggle.addEventListener("click", () => {
      state.open = !state.open;
      render();
    });
    slider.addEventListener("input", () => setPct(Number(slider.value)));
    slider.addEventListener("dblclick", () => setPct(0));
    fineDown.addEventListener("click", () => setPct(state.pct - FINE_STEP));
    fineUp.addEventListener("click", () => setPct(state.pct + FINE_STEP));
    rangeSel.addEventListener("change", () => {
      state.range = Number(rangeSel.value);
      setPct(Math.min(state.range, Math.max(-state.range, state.pct)));
    });
    resetBtn.addEventListener("click", () => setPct(0));
    lock.addEventListener("change", () => {
      state.preservesPitch = lock.checked;
      emit();
    });
    origInput.addEventListener("input", () => {
      const v = Number(origInput.value);
      state.originalBpm = v > 0 ? v : null;
      if (!state.originalBpm) targetInput.value = "";
      render();
    });
    targetInput.addEventListener("change", () => {
      const t = Number(targetInput.value);
      if (state.originalBpm && t > 0) setPct((t / state.originalBpm - 1) * 100);
    });

    // Keys in the UI must not go to the page (for example, space = play).
    root.addEventListener("keydown", (e) => e.stopPropagation());

    // Attach to <html>, not to <body>: a page framework (for example React)
    // can replace the body content and remove the panel.
    document.documentElement.appendChild(host);
    render();

    return {
      setStatus(text) {
        status.textContent = text;
      },
      remove() {
        host.remove();
      },
    };
  }

  return { create };
})();
