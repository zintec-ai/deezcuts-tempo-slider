// A tempo fader that looks like the tempo slider ("pitch fader") of a
// Pioneer CDJ. site_controller.js puts it into the controls row of each
// deezcuts.io player:
// - "vertical": after the volume slider of the large player on /curate,
// - "horizontal": between the volume slider and the queue button of the
//   footer player.
//
// Behavior, as on a CDJ:
// - Vertical: up is "−" (slower) and down is "+" (faster).
//   Horizontal: left is "−" and right is "+".
// - The range button changes the range: ±6, ±10, ±16, WIDE.
// - The green LED is on at 0 %. The fader snaps to 0 near the center.
// - "MT" (Master Tempo) is the key lock.
// Also: a double click on the fader sets 0 %. Shift + drag moves slowly.
// The mouse wheel and the arrow keys move the fader by one step.
//
// Usage:
//   const fader = TempoFader.create({ orientation: "vertical", dividers: false, onChange });
//   dividers: true draws a vertical bar at each side, as the bar before the
//   volume group of the footer player.
//   onChange({ pct, preservesPitch }) runs after each user change.
//   fader.host is the element to put into the page.
//   fader.set({ pct, preservesPitch }), fader.setOriginalBpm(bpm)

// eslint-disable-next-line no-var
var TempoFader = (() => {
  "use strict";

  // range in +/- percent, the label on the button, and the step in percent
  const RANGES = [
    { range: 6, label: "±6", step: 0.02 },
    { range: 10, label: "±10", step: 0.05 },
    { range: 16, label: "±16", step: 0.05 },
    { range: 50, label: "WIDE", step: 0.1 },
  ];
  // The distance that the cap can move, the cap length along the travel,
  // and the rail width across the travel.
  const SIZES = {
    vertical: { travel: 84, cap: 16, across: 34 },
    horizontal: { travel: 140, cap: 14, across: 26 },
  };
  const SNAP_PX = 3; // the center snap zone, at each side of the center

  // The page custom properties (--player-hero-*) go through the shadow
  // boundary, so the fader uses the colors of the deezcuts.io player.
  // The fader uses the colors of the large player (--player-hero-*) or of
  // the footer player (--player-bar-*), with the deezcuts.io defaults.
  const cssFor = (o, { travel, cap, across }) => `
    :host {
      display: inline-flex; flex: none; align-self: center;
      --t-text: var(--player-hero-text, var(--player-bar-text, #f4f0e7));
      --t-muted: var(--player-hero-text-muted, var(--player-bar-text-muted, #c3bdb4));
      --t-faint: var(--player-hero-text-faint, var(--player-bar-text-faint, #a9a39a));
      --t-signal: var(--player-hero-signal, var(--player-bar-signal, #f2a03d));
      --t-signal-deep: var(--player-hero-signal-deep, #c97f2a);
      --t-edge: var(--player-hero-edge, var(--player-bar-edge, #50473f));
      --t-control: var(--player-hero-control, var(--player-bar-control, #2c2a26));
      --t-control-hover: var(--player-hero-control-hover, var(--player-bar-track, #3c3935));
      --t-font: var(--player-hero-font, var(--player-bar-font, system-ui, sans-serif));
    }
    .fader {
      display: inline-flex; align-items: center; gap: 10px;
      font-family: var(--t-font);
      color: var(--t-text);
      user-select: none; -webkit-user-select: none;
    }
    .fader.horizontal { gap: 8px; }
    .fader.dividers::before, .fader.dividers::after {
      content: ""; flex: none; width: 1px; height: 22px;
      background: var(--line-strong, #87827d);
    }
    .fader.dividers::before { margin: 0 2px 0 8px; }
    .fader.dividers::after { margin: 0 8px 0 2px; }
    .rail {
      position: relative;
      ${o === "vertical" ? `width: ${across}px; height: ${travel + cap}px;` : `width: ${travel + cap}px; height: ${across}px;`}
      cursor: grab; touch-action: none; outline: none;
    }
    .rail:focus-visible { outline: 1px solid var(--t-signal); outline-offset: 3px; border-radius: 2px; }
    .rail.dragging { cursor: grabbing; }
    .slot {
      position: absolute;
      ${o === "vertical" ? "left: 50%; top: 4px; bottom: 4px; width: 4px; margin-left: -2px;" : "top: 50%; left: 4px; right: 4px; height: 4px; margin-top: -2px;"}
      border-radius: 2px; background: #000;
      box-shadow: inset 0 1px 2px rgba(0,0,0,0.9), 0 0 0 1px var(--t-edge);
    }
    .ticks {
      position: absolute;
      ${o === "vertical" ? `left: 0; top: ${cap / 2}px; height: ${travel}px; width: 7px;` : `top: 0; left: ${cap / 2}px; width: ${travel}px; height: 6px;`}
    }
    .tick {
      position: absolute; background: var(--t-faint); opacity: 0.6;
      ${o === "vertical" ? "left: 0; width: 5px; height: 1px;" : "top: 0; height: 4px; width: 1px;"}
    }
    .tick.center { opacity: 1; background: var(--t-text); ${o === "vertical" ? "width: 7px;" : "height: 6px;"} }
    .sign {
      position: absolute; font-size: 10px; line-height: 10px; font-weight: 600;
      color: var(--t-faint);
    }
    ${o === "vertical"
      ? ".sign { right: 0; } .sign.minus { top: 0; } .sign.plus { bottom: 0; }"
      : ".sign { bottom: -1px; } .sign.minus { left: 0; } .sign.plus { right: 0; }"}
    .led {
      position: absolute; width: 5px; height: 5px; border-radius: 50%; background: #1d3a22;
      ${o === "vertical" ? "right: 1px; top: 50%; margin-top: -2.5px;" : "bottom: 1px; left: 50%; margin-left: -2.5px;"}
    }
    .led.on { background: #3dff6a; box-shadow: 0 0 5px #3dff6a; }
    .cap {
      position: absolute; border-radius: 2px;
      ${o === "vertical" ? `left: 3px; right: 3px; height: ${cap}px;` : `top: 3px; bottom: 7px; width: ${cap}px;`}
      background:
        repeating-linear-gradient(${o === "vertical" ? "to bottom" : "to right"}, transparent 0 2px, rgba(255,255,255,0.07) 2px 3px),
        linear-gradient(to bottom, #4a4845, #1c1b1a 55%, #2b2a28);
      box-shadow: 0 2px 4px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.18);
    }
    .cap::after {
      content: ""; position: absolute; background: #f4f0e7;
      ${o === "vertical" ? "left: 2px; right: 2px; top: 50%; height: 2px; margin-top: -1px;" : "top: 2px; bottom: 2px; left: 50%; width: 2px; margin-left: -1px;"}
    }
    .readout { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; min-width: 66px; }
    .label { font-size: 9px; letter-spacing: 0.08em; color: var(--t-faint); }
    .horizontal .readout { display: grid; grid-template-columns: auto auto; align-items: center; gap: 2px 6px; min-width: 0; }
    .horizontal .label { display: none; }
    .horizontal .buttons { grid-column: 2; grid-row: 1 / span 2; flex-direction: column; gap: 2px; }
    .bpm {
      font-size: ${o === "vertical" ? 20 : 15}px; line-height: 1; font-weight: 600;
      font-variant-numeric: tabular-nums; letter-spacing: 0.02em;
    }
    .bpm.none { color: var(--t-faint); }
    .pct { font-size: 11px; font-variant-numeric: tabular-nums; color: var(--t-muted); }
    .pct.active { color: var(--t-signal); }
    .buttons { display: flex; gap: 4px; }
    button {
      font: inherit; font-size: 9px; font-weight: 700; letter-spacing: 0.05em;
      min-width: 30px; padding: 2px 4px; border-radius: 2px; cursor: pointer;
      color: var(--t-muted);
      background: var(--t-control);
      border: 1px solid var(--t-edge);
    }
    button:hover { background: var(--t-control-hover); }
    button.lit { color: var(--t-signal); border-color: var(--t-signal-deep); }`;

  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else el.setAttribute(k, v);
    }
    el.append(...children);
    return el;
  }

  const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d;
  const fmtPct = (pct) => `${pct > 0 ? "+" : pct < 0 ? "−" : "±"}${Math.abs(pct).toFixed(2)}%`;

  function create({ orientation = "vertical", dividers = false, onChange = () => {} } = {}) {
    const vertical = orientation === "vertical";
    const size = SIZES[vertical ? "vertical" : "horizontal"];
    const TRAVEL_PX = size.travel;
    const state = { pct: 0, rangeIndex: 0, preservesPitch: true, originalBpm: null };
    const cur = () => RANGES[state.rangeIndex];

    const host = document.createElement("div");
    host.setAttribute("data-tempo-slider-fader", "");
    const root = host.attachShadow({ mode: "closed" });

    const ticks = h("div", { class: "ticks" });
    for (let i = 0; i <= 8; i += 1) {
      const t = h("span", { class: i === 4 ? "tick center" : "tick" });
      t.style[vertical ? "top" : "left"] = `${Math.round((i / 8) * TRAVEL_PX)}px`;
      ticks.append(t);
    }
    const led = h("span", { class: "led", title: "Tempo 0 %" });
    const cap = h("div", { class: "cap" });
    const rail = h(
      "div",
      {
        class: "rail", tabindex: "0", role: "slider", "aria-label": "Tempo",
        "aria-orientation": vertical ? "vertical" : "horizontal",
        title: "Tempo. Drag the fader. Shift + drag: slow. Double-click: 0 %.",
      },
      ticks,
      h("span", { class: "slot" }),
      h("span", { class: "sign minus", text: "−" }),
      h("span", { class: "sign plus", text: "+" }),
      led,
      cap,
    );
    const bpm = h("div", { class: "bpm" });
    const pct = h("div", { class: "pct" });
    const rangeBtn = h("button", { type: "button", title: "Tempo range" });
    const mtBtn = h("button", { type: "button", text: "MT", title: "Master Tempo (key lock)" });
    const fader = h(
      "div",
      { class: `fader ${vertical ? "vertical" : "horizontal"}${dividers ? " dividers" : ""}` },
      rail,
      h("div", { class: "readout" }, h("span", { class: "label", text: "BPM" }), bpm, pct, h("div", { class: "buttons" }, rangeBtn, mtBtn)),
    );
    root.append(h("style", { text: cssFor(vertical ? "vertical" : "horizontal", size) }), fader);

    function render() {
      const { range, label } = cur();
      const pos = (Math.max(-range, Math.min(range, state.pct)) + range) / (2 * range);
      cap.style[vertical ? "top" : "left"] = `${Math.round(pos * TRAVEL_PX)}px`;
      led.classList.toggle("on", state.pct === 0);
      rail.setAttribute("aria-valuemin", String(-range));
      rail.setAttribute("aria-valuemax", String(range));
      rail.setAttribute("aria-valuenow", String(state.pct));
      rail.setAttribute("aria-valuetext", fmtPct(state.pct));
      pct.textContent = fmtPct(state.pct);
      pct.classList.toggle("active", state.pct !== 0);
      if (state.originalBpm) {
        bpm.textContent = (state.originalBpm * (1 + state.pct / 100)).toFixed(1);
        bpm.classList.remove("none");
        bpm.title = `Original BPM: ${state.originalBpm}`;
      } else {
        bpm.textContent = "–––.–";
        bpm.classList.add("none");
        bpm.title = "The BPM of this track is unknown.";
      }
      rangeBtn.textContent = label;
      rangeBtn.title = `Tempo range: ±${range}%. Click for the next range.`;
      mtBtn.classList.toggle("lit", state.preservesPitch);
    }

    function emit() {
      onChange({ pct: state.pct, preservesPitch: state.preservesPitch });
    }

    function setPct(value) {
      const { range, step } = cur();
      const clamped = Math.max(-range, Math.min(range, value));
      const next = round(Math.round(clamped / step) * step, 2);
      if (next === state.pct) return;
      state.pct = next;
      render();
      emit();
    }

    // Dragging: the cap follows the pointer from its start position. A
    // click on the rail does not make the tempo jump.
    let drag = null;
    rail.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      rail.focus();
      rail.setPointerCapture(e.pointerId);
      rail.classList.add("dragging");
      drag = { at: vertical ? e.clientY : e.clientX, pct: state.pct };
      e.preventDefault();
    });
    rail.addEventListener("pointermove", (e) => {
      if (!drag) return;
      // No button is pressed: the drag ended outside of the rail.
      if (e.buttons === 0) {
        endDrag();
        return;
      }
      const { range } = cur();
      const scale = e.shiftKey ? 0.2 : 1;
      const moved = ((vertical ? e.clientY : e.clientX) - drag.at) * scale;
      let value = drag.pct + (moved / TRAVEL_PX) * 2 * range;
      // Snap to the center, as the center click of the CDJ fader.
      if (Math.abs(value) < (SNAP_PX / TRAVEL_PX) * 2 * range * scale) value = 0;
      setPct(value);
    });
    const endDrag = () => {
      drag = null;
      rail.classList.remove("dragging");
    };
    rail.addEventListener("pointerup", endDrag);
    rail.addEventListener("pointercancel", endDrag);
    // The browser releases the capture, for example when the page moves the
    // fader to a different position in the DOM.
    rail.addEventListener("lostpointercapture", endDrag);
    rail.addEventListener("dblclick", () => setPct(0));

    // The wheel moves one step for each WHEEL_STEP_PX of scrolling. A mouse
    // wheel notch is about 100 px. A trackpad sends many small events.
    const WHEEL_STEP_PX = 50;
    let wheelSum = 0;
    rail.addEventListener(
      "wheel",
      (e) => {
        const { range, step } = cur();
        const dir = Math.sign(e.deltaY);
        // At a limit, let the page scroll.
        if ((dir > 0 && state.pct >= range) || (dir < 0 && state.pct <= -range)) return;
        e.preventDefault();
        // deltaMode 1 = lines, 2 = pages (Firefox with a mouse wheel).
        const px = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 300 : 1);
        if (Math.sign(px) !== Math.sign(wheelSum)) wheelSum = 0;
        wheelSum += px;
        const steps = Math.trunc(wheelSum / WHEEL_STEP_PX);
        if (steps === 0) return;
        wheelSum -= steps * WHEEL_STEP_PX;
        setPct(state.pct + steps * step);
      },
      { passive: false },
    );

    // The keys move the cap in the direction of the arrow. Vertical: up is
    // slower. Horizontal: left is slower.
    rail.addEventListener("keydown", (e) => {
      const { step, range } = cur();
      const moves = vertical
        ? { ArrowUp: -step, ArrowDown: step, PageUp: -range / 10, PageDown: range / 10 }
        : { ArrowLeft: -step, ArrowRight: step, PageDown: -range / 10, PageUp: range / 10 };
      if (e.key in moves) setPct(state.pct + moves[e.key]);
      else if (e.key === "0" || e.key === "Home") setPct(0);
      else return;
      e.preventDefault();
    });

    rangeBtn.addEventListener("click", () => {
      state.rangeIndex = (state.rangeIndex + 1) % RANGES.length;
      const before = state.pct;
      // Keep the tempo. If the tempo is outside the new range, use the limit.
      state.pct = round(Math.max(-cur().range, Math.min(cur().range, state.pct)), 2);
      render();
      if (state.pct !== before) emit();
    });
    mtBtn.addEventListener("click", () => {
      state.preservesPitch = !state.preservesPitch;
      render();
      emit();
    });

    // Keys in the fader must not go to the page (for example, space = play).
    root.addEventListener("keydown", (e) => e.stopPropagation());

    render();

    return {
      host,
      // Changes from the other control. This does not call onChange.
      set({ pct: value, preservesPitch }) {
        state.pct = round(value, 2);
        state.preservesPitch = preservesPitch;
        // Make the range larger when the tempo is outside of it.
        if (Math.abs(state.pct) > cur().range) {
          const i = RANGES.findIndex((r) => r.range >= Math.abs(state.pct));
          state.rangeIndex = i === -1 ? RANGES.length - 1 : i;
        }
        render();
      },
      setOriginalBpm(value) {
        state.originalBpm = value > 0 ? value : null;
        render();
      },
    };
  }

  return { create };
})();
