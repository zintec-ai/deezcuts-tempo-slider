// Shared constants and helpers for the ISOLATED-world scripts.
// Content scripts cannot use `import`, so this file defines a global
// object. The manifest loads it before ui.js and site_controller.js.
//
// Messages between a site page (the "controller") and the widget frames
// use window.postMessage with a string: "tempo-slider:" + JSON.
// The SoundCloud widget, the SoundCloud api.js and the deezcuts.io app
// read messages with JSON.parse(e.data) in a try block. The prefix makes
// the string invalid JSON, so these handlers ignore our messages.

// eslint-disable-next-line no-var
var TempoProtocol = (() => {
  "use strict";

  const PREFIX = "tempo-slider:";
  const WIDGET_ORIGIN = "https://w.soundcloud.com";

  // Sites that can control the widget frames. Keep this list the same as
  // the site_controller.js entry in the manifests.
  function isControllerOrigin(origin) {
    return origin === "https://deezcuts.io" || /^https:\/\/[a-z0-9-]+\.deezcuts\.io$/.test(origin);
  }

  function encode(msg) {
    return PREFIX + JSON.stringify(msg);
  }

  // Returns the message object, or null if the data is not our message.
  function decode(data) {
    if (typeof data !== "string" || !data.startsWith(PREFIX)) return null;
    try {
      const msg = JSON.parse(data.slice(PREFIX.length));
      return msg && typeof msg.type === "string" ? msg : null;
    } catch {
      return null;
    }
  }

  return { WIDGET_ORIGIN, isControllerOrigin, encode, decode };
})();
