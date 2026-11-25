// Runs in the ISOLATED world of the top frame on deezcuts.io, at
// document_idle. Needs protocol.js and fader.js.
//
// deezcuts.io plays tracks through 2 to 4 hidden SoundCloud widget iframes
// ("decks") and changes between them. This script:
// - puts a CDJ-style tempo fader into each player:
//   - vertical, after the volume slider of the large player on /curate,
//   - horizontal, in the footer player between the volume slider and the
//     queue button, with a vertical bar at each side,
// - sends each change to all widget frames,
// - sends the current rate to each widget frame when the frame loads,
// - writes the state reports of the frames to the debug log.
// If no player is on the page, the script shows no control.

(() => {
  "use strict";

  const WIDGET_SELECTOR = 'iframe[src^="https://w.soundcloud.com/player"]';
  // The BPM of the current track. First choice: the data-track-bpm
  // attribute on the root element of a player. Second choice: the BPM fact
  // next to the large player on /curate (it shows only if the user pinned
  // it). An empty attribute counts as "no BPM", so that the fact can be used.
  const PLAYER_ROOT_SELECTOR = "footer.dcfp, section.dchp";
  const BPM_ATTR_SELECTOR =
    '.dcfp[data-track-bpm]:not([data-track-bpm=""]), .dchp[data-track-bpm]:not([data-track-bpm=""])';
  const BPM_FACT_ELEMENT_SELECTOR = '.dcflow__player [data-fact="bpm"]';
  const BPM_FACT_SELECTOR = `${BPM_FACT_ELEMENT_SELECTOR} .dcfacts__value`;
  let lastPageBpm = null;

  // Where the faders go. "after": directly after this element.
  // "before": directly before this element.
  const FADER_SLOTS = [
    { after: ".dchp__volume", orientation: "vertical", dividers: false },
    { before: ".dcfp__aux > .dcfp__queue-toggle", orientation: "horizontal", dividers: true },
  ];

  // The one tempo state. All faders show it.
  const settings = { pct: 0, preservesPitch: true };

  const faders = FADER_SLOTS.map((slot) => {
    const fader = TempoFader.create({
      orientation: slot.orientation,
      dividers: slot.dividers,
      onChange: (next) => update(next, fader),
    });
    return { ...slot, fader };
  });

  // A change from one fader: show it in the other faders and send it.
  function update(next, from) {
    settings.pct = next.pct;
    settings.preservesPitch = next.preservesPitch;
    for (const f of faders) if (f.fader !== from) f.fader.set(settings);
    broadcast();
  }

  function setMessage() {
    return TempoProtocol.encode({
      type: "set",
      rate: 1 + settings.pct / 100,
      preservesPitch: settings.preservesPitch,
    });
  }

  function broadcast() {
    const data = setMessage();
    for (const iframe of document.querySelectorAll(WIDGET_SELECTOR)) {
      try {
        // The target origin makes sure that only the SoundCloud widget gets
        // the message. If the frame is still loading, the browser drops the
        // message, and the "load" listener sends the rate later.
        iframe.contentWindow?.postMessage(data, TempoProtocol.WIDGET_ORIGIN);
      } catch {
        /* frame removed */
      }
    }
  }

  // The last logged state of each deck, by frame ID.
  const deckStates = new Map();

  // Send the current rate to a widget frame each time that it loads a
  // document. The bridge in the frame starts at document_start, so it
  // gets the message.
  const knownFrames = new WeakSet();
  function watchFrames() {
    for (const iframe of document.querySelectorAll(WIDGET_SELECTOR)) {
      if (knownFrames.has(iframe)) continue;
      knownFrames.add(iframe);
      iframe.addEventListener("load", () => {
        iframe.contentWindow?.postMessage(setMessage(), TempoProtocol.WIDGET_ORIGIN);
      });
    }
  }

  // A frame reports its state: write it to the debug log. This helps when
  // a deck does not follow the tempo.
  window.addEventListener("message", (e) => {
    if (e.origin !== TempoProtocol.WIDGET_ORIGIN) return;
    const msg = TempoProtocol.decode(e.data);
    if (msg?.type === "state") {
      // Each deck reports after each tempo change. Log only a changed state.
      const line = `${msg.count} media element(s), ${msg.playing ? "playing" : "paused"}`;
      if (deckStates.get(msg.frameId) === line) return;
      deckStates.set(msg.frameId, line);
      console.debug(`[tempo-slider] deck ${msg.frameId}: ${line}`);
    }
  });

  // Show the BPM of the page in the faders. The tempo percentage stays the
  // same on a track change.
  function readPageBpm() {
    const text =
      document.querySelector(BPM_ATTR_SELECTOR)?.getAttribute("data-track-bpm") ??
      document.querySelector(BPM_FACT_SELECTOR)?.textContent ??
      "";
    const bpm = Number.parseFloat(text.replace(",", "."));
    const value = Number.isFinite(bpm) && bpm > 0 ? bpm : null;
    if (value !== lastPageBpm) {
      lastPageBpm = value;
      for (const f of faders) f.fader.setOriginalBpm(value);
    }
  }

  // React can render a player again and remove the fader. Put each fader
  // back in its slot when necessary. Remove it when the player is not there.
  function mountFaders() {
    for (const f of faders) {
      const { host } = f.fader;
      const anchor = document.querySelector(f.after ?? f.before);
      if (!anchor) host.remove();
      else if (f.after && anchor.nextElementSibling !== host) anchor.after(host);
      else if (f.before && anchor.previousElementSibling !== host) anchor.before(host);
    }
  }

  // Watch only the BPM sources for value changes: the attribute on the
  // player roots, and the text of the BPM fact (React changes the text in
  // place). The time display of the players changes often, so a
  // characterData observer on the full document costs too much.
  const bpmObserver = new MutationObserver(readPageBpm);
  let bpmTargets = [];
  function watchBpmSources() {
    const roots = [...document.querySelectorAll(PLAYER_ROOT_SELECTOR)];
    const fact = document.querySelector(BPM_FACT_ELEMENT_SELECTOR);
    const targets = fact ? [...roots, fact] : roots;
    if (targets.length === bpmTargets.length && targets.every((t, i) => t === bpmTargets[i])) return;
    bpmObserver.disconnect();
    for (const root of roots) {
      bpmObserver.observe(root, { attributes: true, attributeFilter: ["data-track-bpm"] });
    }
    if (fact) bpmObserver.observe(fact, { characterData: true, childList: true, subtree: true });
    bpmTargets = targets;
  }

  // Players, faders and the BPM fact come and go with the page content.
  function refresh() {
    watchFrames();
    mountFaders();
    watchBpmSources();
    readPageBpm();
  }
  let refreshQueued = false;
  new MutationObserver(() => {
    if (refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(() => {
      refreshQueued = false;
      refresh();
    });
  }).observe(document.documentElement, { childList: true, subtree: true });

  refresh();

  // Send the rate to the frames that loaded before this script ran.
  broadcast();
})();
