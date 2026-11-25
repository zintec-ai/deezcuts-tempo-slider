// Runs in the ISOLATED world (the extension content-script context) of each
// SoundCloud widget iframe, at document_start. Needs protocol.js.
//
// The bridge between a deezcuts.io page and main_world.js:
// - It accepts a "set" message only from the top window, and only if the
//   top window is a deezcuts.io page (see TempoProtocol.isControllerOrigin).
// - It sends the rate to main_world.js with a CustomEvent.
// - It reports the state of the frame to the page (for the debug log).
// On other websites, no "set" message arrives, and the bridge does nothing.
// The bridge sends no message to a page that did not send "set" first.

(() => {
  "use strict";

  // Keep these names the same as in main_world.js.
  const EVT_SET = "tempo-slider:set"; // here -> main_world.js
  const EVT_STATE = "tempo-slider:state"; // main_world.js -> here
  const EVT_HELLO = "tempo-slider:hello"; // here -> main_world.js: "send state"
  const EVT_READY = "tempo-slider:ready"; // main_world.js -> here: "send the rate again"

  let controller = null; // { win, origin } after the first message from the controller
  let lastSettings = null;
  let lastState = null;
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
    if (!lastSettings) return;
    setRate(lastSettings);
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
    reportState();
  });

  // Messages from the controller page.
  window.addEventListener("message", (e) => {
    if (!TempoProtocol.isControllerOrigin(e.origin)) return;
    const msg = TempoProtocol.decode(e.data);
    if (!msg || msg.type !== "set") return;
    if (e.source !== window.top) {
      console.debug("[tempo-slider] ignored a set message that did not come from the top window");
      return;
    }
    controller ??= { win: e.source, origin: e.origin };
    setRate({ rate: msg.rate, preservesPitch: msg.preservesPitch });
    reportState();
  });
})();
