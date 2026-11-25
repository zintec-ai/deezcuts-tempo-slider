// Runs in the ISOLATED world (the extension content-script context) of each
// SoundCloud widget iframe, at document_start. Needs protocol.js and panel.js.
//
// Two modes:
// - Standalone (default): shows the tempo panel on top of the widget.
// - Controlled: the top page is a controller site (see
//   TempoProtocol.isControllerOrigin) and sends the rate. The bridge shows
//   no panel and follows the page. deezcuts.io uses this mode, because
//   its widgets are hidden.
//
// In both modes, the rate goes to main_world.js with a CustomEvent.

(() => {
  "use strict";

  // Keep these names the same as in main_world.js.
  const EVT_SET = "tempo-slider:set"; // here -> main_world.js
  const EVT_STATE = "tempo-slider:state"; // main_world.js -> here
  const EVT_HELLO = "tempo-slider:hello"; // here -> main_world.js: "send state"
  const EVT_READY = "tempo-slider:ready"; // main_world.js -> here: "send the rate again"

  let controller = null; // { win, origin } after the first message from a controller
  let lastSettings = null;
  let lastState = null;
  let panel = null;
  // A random ID. The controller uses it in its debug log.
  const frameId = Math.random().toString(36).slice(2, 10);

  function setRate(settings) {
    lastSettings = settings;
    document.dispatchEvent(new CustomEvent(EVT_SET, { detail: JSON.stringify(settings) }));
  }

  function reportState() {
    if (!controller || !lastState) return;
    // Copy only the known fields. lastState comes from the MAIN world, and a
    // script in the widget page can change it.
    const { count, playing } = lastState;
    controller.win.postMessage(
      TempoProtocol.encode({ type: "state", frameId, count: Number(count) || 0, playing: playing === true }),
      controller.origin,
    );
  }

  // main_world.js started after this script: send the rate again.
  document.addEventListener(EVT_READY, () => {
    if (lastSettings) setRate(lastSettings);
    document.dispatchEvent(new CustomEvent(EVT_HELLO));
  });

  // State from main_world.js (media element count, playing or paused).
  document.addEventListener(EVT_STATE, (e) => {
    let state;
    try {
      state = JSON.parse(e.detail);
    } catch {
      return;
    }
    if (!state || typeof state !== "object") return;
    lastState = state;
    if (panel) panel.setStatus(state.count === 0 ? "Press play to connect to the player." : "");
    reportState();
  });

  // Messages from the controller page. Only the top window can control
  // the frame, and only if it has a controller origin.
  window.addEventListener("message", (e) => {
    if (!TempoProtocol.isControllerOrigin(e.origin)) return;
    const msg = TempoProtocol.decode(e.data);
    if (!msg || msg.type !== "set") return;
    if (e.source !== window.top) {
      console.debug("[tempo-slider] ignored a set message that did not come from the top window");
      return;
    }
    if (!controller) {
      controller = { win: e.source, origin: e.origin };
      panel?.remove();
      panel = null;
    }
    setRate({ rate: msg.rate, preservesPitch: msg.preservesPitch });
    reportState();
  });

  // Standalone mode: show the panel when the page is ready, if no
  // controller took control before that.
  function showPanel() {
    if (controller || panel) return;
    panel = TempoPanel.create({ onChange: setRate });
    panel.setStatus(lastState?.count ? "" : "Press play to connect to the player.");
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", showPanel, { once: true });
  } else {
    showPanel();
  }

  // Tell a controller page (if there is one) that this frame is ready.
  // The message contains no data, so the "*" target origin is safe.
  try {
    window.top.postMessage(TempoProtocol.encode({ type: "hello", frameId }), "*");
  } catch {
    /* no top window */
  }
  document.dispatchEvent(new CustomEvent(EVT_HELLO));
})();
