// Runs in the MAIN world (the page's own JavaScript context) of the
// SoundCloud widget iframe, at document_start.
//
// Purpose: find every media element that the widget uses, also elements
// that are not in the DOM (for example `new Audio()`), and keep their
// playback rate at the value that the UI script sends.
//
// This script has no access to extension APIs. It talks to ui.js
// (ISOLATED world) with CustomEvents on `document`. The event detail is a
// JSON string, because Firefox blocks object access across the two worlds.

(() => {
  "use strict";

  const TAG = "[tempo-slider]";
  // Keep these names the same as in ui.js. This script cannot load
  // protocol.js, because a global in the MAIN world is visible to the page.
  const EVT_SET = "tempo-slider:set"; // ui.js -> here
  const EVT_STATE = "tempo-slider:state"; // here -> ui.js
  const EVT_HELLO = "tempo-slider:hello"; // ui.js -> here: "send state"
  const EVT_READY = "tempo-slider:ready"; // here -> ui.js: "send the rate again"
  // The limits of the rate. The widest fader range is ±50 % (WIDE).
  const MIN_RATE = 0.5;
  const MAX_RATE = 1.5;

  // A Set and not a WeakSet, because applyTo() iterates over all elements.
  // The widget makes few media elements, so the strong references are OK.
  const media = new Set();
  let rate = 1;
  let preservesPitch = true;

  function applyTo(el) {
    try {
      if (el.preservesPitch !== preservesPitch) {
        el.preservesPitch = preservesPitch;
      }
      // load() resets playbackRate to defaultPlaybackRate. Set both, so
      // that the rate stays when the widget loads the next track.
      if (el.defaultPlaybackRate !== rate) el.defaultPlaybackRate = rate;
      // The guard (compare before set) prevents a ratechange loop.
      if (el.playbackRate !== rate) el.playbackRate = rate;
    } catch (err) {
      console.warn(TAG, "cannot set rate on media element", err);
    }
  }

  function sendState() {
    let playing = false;
    for (const el of media) if (!el.paused) playing = true;
    document.dispatchEvent(
      new CustomEvent(EVT_STATE, {
        detail: JSON.stringify({ rate, preservesPitch, count: media.size, playing }),
      }),
    );
  }

  function track(el) {
    if (!el || media.has(el)) return;
    media.add(el);
    console.info(TAG, "found media element:", el.tagName, el.isConnected ? "(in DOM)" : "(not in DOM)");
    const reapply = () => applyTo(el);
    el.addEventListener("loadedmetadata", reapply);
    el.addEventListener("play", reapply);
    el.addEventListener("ratechange", reapply);
    el.addEventListener("play", sendState);
    el.addEventListener("pause", sendState);
    applyTo(el);
    sendState();
  }

  // 1. Catch elements when the widget calls play(), in or out of the DOM.
  const origPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...args) {
    track(this);
    return origPlay.apply(this, args);
  };

  // 2. Catch elements that are in the DOM before or without a play() call.
  function scan(root) {
    if (root instanceof HTMLMediaElement) track(root);
    if (root.querySelectorAll) root.querySelectorAll("audio, video").forEach(track);
  }
  new MutationObserver((records) => {
    for (const r of records) r.addedNodes.forEach(scan);
  }).observe(document, { childList: true, subtree: true });
  document.addEventListener("DOMContentLoaded", () => scan(document));

  // 3. Messages from ui.js.
  document.addEventListener(EVT_SET, (e) => {
    let msg;
    try {
      msg = JSON.parse(e.detail);
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object") return;
    if (typeof msg.rate === "number" && msg.rate >= MIN_RATE && msg.rate <= MAX_RATE) rate = msg.rate;
    if (typeof msg.preservesPitch === "boolean") preservesPitch = msg.preservesPitch;
    media.forEach(applyTo);
    sendState();
  });
  document.addEventListener(EVT_HELLO, sendState);

  // ui.js also runs at document_start. The browser does not guarantee which
  // script runs first, so ui.js can send the rate before this listener
  // exists. This event tells ui.js to send the rate again.
  document.dispatchEvent(new CustomEvent(EVT_READY));

  // Diagnostic: if the widget plays sound but no element is found, the
  // widget uses Web Audio, and playbackRate cannot change the tempo.
  setTimeout(() => {
    if (media.size === 0) {
      console.info(TAG, "no media element found yet. Press play in the widget.");
    }
  }, 5000);
})();
