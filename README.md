# Deezcuts Tempo Slider

A browser extension for Chrome-based browsers and Firefox. It adds a
DJ-style tempo fader to the players on deezcuts.io. deezcuts.io plays tracks
through SoundCloud embed widgets (the `w.soundcloud.com/player` iframe), and
the extension changes the playback speed in these widgets. The extension
works only on deezcuts.io. It is not affiliated with SoundCloud.

## How it works

The [SoundCloud Widget API](https://developers.soundcloud.com/docs/api/html5-widget)
has no method for the playback speed. For this reason, the extension does not
use the Widget API. It runs content scripts inside the widget iframe and in
the deezcuts.io page:

| File | Where | World | Function |
|---|---|---|---|
| `tempo_core/main_world.js` | widget frame | `MAIN` (the page JavaScript context), `document_start` | Finds the media elements of the widget and sets `playbackRate` and `preservesPitch` on them. |
| `tempo_core/protocol.js` | widget frame, deezcuts.io | `ISOLATED` | Message format and origin checks. |
| `tempo_core/fader.js` | deezcuts.io top frame | `ISOLATED` | The CDJ-style tempo fader for the deezcuts.io players (in a Shadow DOM). |
| `tempo_core/ui.js` | widget frame | `ISOLATED` (the extension context), `document_start` | Bridge. Accepts the rate from a deezcuts.io top page and sends it to `main_world.js`. |
| `tempo_core/site_controller.js` | deezcuts.io top frame | `ISOLATED`, `document_idle` | Puts a fader into each deezcuts.io player and sends the rate to all widget frames. |

A "content script" is a script that the browser adds to a web page that
matches a URL pattern. `main_world.js` must run in the `MAIN` world, because
the widget can play audio with an element that is not in the DOM
(`new Audio()`). The script catches these elements with a wrapper on
`HTMLMediaElement.prototype.play`.

The widget player (checked on 2026-11-24) plays audio through a media
element with hls.js (`MediaSource`). It sets `playbackRate=1` each time that
it loads a track. `main_world.js` listens for `ratechange` and sets the
selected rate again. In Chrome, the widget also sends the element output
through Web Audio (`createMediaElementSource`) for fades. The element rate
also applies to this output.

`main_world.js` and `ui.js` send messages with `CustomEvent`s on
`document`. The event detail is a JSON string, because Firefox blocks
object access between the two worlds.

The browser runs the widget scripts in every SoundCloud embed, also on
other websites, because a match pattern cannot check the top page. On other
websites, no rate arrives from a deezcuts.io page. Then `main_world.js`
changes no media element, and `ui.js` sends no message.

### deezcuts.io

deezcuts.io plays tracks through 2 to 4 hidden widget iframes ("decks"). It
changes between them, and it plays a standby deck muted for a short time to
prepare it. The widgets are hidden, so the controls are in the page, and
the extension works as follows:

1. `site_controller.js` sends the current rate (`set`) to each widget frame
   when the frame loads.
2. The frame uses the rate from the page. It reports its state (`state`:
   media element count, playing or paused). The page writes a debug log
   line when the state of a deck changes.
3. Each change on a fader goes to all widget frames of the page.

The messages use `window.postMessage` with a string
`tempo-slider:` + JSON. The SoundCloud widget, the SoundCloud `api.js`, and
the deezcuts.io app read messages with `JSON.parse` in a `try` block. The
prefix makes the string invalid JSON, so they ignore our messages. The
frames accept `set` only from `https://deezcuts.io` and
`https://*.deezcuts.io`. The page sends only to `https://w.soundcloud.com`.

deezcuts.io has two players. Both use the same decks, so the tempo applies
to both:

- the footer player (`footer.dcfp`), on most pages;
- the large player on `/curate` (`.dchp` in `.dcflow__player`).

The extension puts a tempo fader (`tempo_core/fader.js`) next to the volume
slider of each player. The fader looks like the tempo fader of a Pioneer CDJ:

- Large player: a vertical fader. Up is "−" (slower), down is "+" (faster).
- Footer player: a horizontal fader between the volume slider and the queue
  button. The queue button stays at the right end. A vertical bar at each
  side separates the fader zone, as the bar between the waveform and the
  volume group. Left is "−", right is "+".
- The range button changes the range: ±6, ±10, ±16, WIDE (±50 %).
- A double click on the fader sets 0 %. The green LED is on at 0 %.
- Shift + drag moves the fader slowly. The mouse wheel and the arrow keys
  move it by one step.
- "MT" (Master Tempo) is the key lock.

All faders show one tempo state. If no player is on the page (for example,
before the first track starts), the extension shows no control.

The BPM display needs the BPM of the current track. The extension reads it
from these sources, in this sequence:

1. The `data-track-bpm` attribute on `footer.dcfp` or `section.dchp`. The
   value is the original BPM as a decimal number with a dot, for example
   `128` or `127.5`. An empty attribute counts as "BPM unknown".
2. The BPM fact next to the large player on `/curate`
   (`.dcflow__player [data-fact="bpm"] .dcfacts__value`). This row shows only
   if the BPM fact is pinned in the deezcuts.io settings.

On a track change, the tempo percentage stays the same and the BPM display
changes.

### Known limits

- If SoundCloud changes the player, the extension can stop working. Sign of
  this: the track plays, but the console shows no
  `[tempo-slider] found media element` line in the widget frame. Check this
  first when you test.
- The extension works only on deezcuts.io.
- The tempo goes back to 0 % when the page loads again.

## Icons

The icons are the deezcuts.io logo on a dark rounded tile. The sources are
in `icons-src/`:

- `icon-small.svg`: the 16 px icon. It has no grooves, because they are not
  clear at 16 px.
- `icon.svg`: the 32 px and 48 px icons.
- `icon-store.svg`: the 128 px icon. The tile is 96 × 96 px, with 16 px of
  transparent padding at each side, as the Chrome Web Store requires.

To change an icon, export the SVG to a PNG of the correct size with
transparency, and replace the file in `tempo_core/icons/`.

## Project layout

```
tempo_core/        Shared code, icons, and manifest.base.json (all browsers)
icons-src/         SVG sources of the icons (the deezcuts.io logo)
chrome/            manifest.override.json for Chrome, Edge, Brave, Opera, Vivaldi
firefox/           manifest.override.json for Firefox desktop and Android
scripts/           Node script: build
store/promo/       Promo tiles and screenshots: HTML sources, render.py, images
LICENSE            MIT license (the code only, not the logo)
PRIVACY.md         Privacy policy (the store listings link to it)
dist/              Build output (not in git)
packages/          ZIP files for the stores (not in git)
```

Only the manifest is different for each browser. `npm run build` makes
`dist/<browser>/manifest.json` from these parts:

- `tempo_core/manifest.base.json`: the keys that are the same for all
  browsers.
- `<browser>/manifest.override.json`: the keys for one browser. A key in
  the override replaces the same key in the base.
- `version` from `package.json`.

The Firefox override has `browser_specific_settings.gecko` (add-on ID,
minimum version, and the data collection statement) and `host_permissions`.
Chrome can show an "unrecognized manifest key" warning for the gecko key.
Chrome does not need `host_permissions` for content scripts. Firefox needs
them, or the user must allow each site manually.

The build copies only the files that the manifest uses (content scripts and
icons).

All scripts are Node scripts. They run on Windows, macOS, and Linux.

## Requirements

- Node.js 20 or later.
- Chrome 111 or later (for `"world": "MAIN"` in the manifest). Note: this
  version is from memory. The Chrome documentation does not state it.
- Firefox 140 or later on desktop, 142 or later on Android (for
  `data_collection_permissions`).

## Commands

```sh
npm install          # installs web-ext (Mozilla's extension tool)
npm run build        # writes dist/chrome and dist/firefox
npm run lint         # builds Firefox and runs the AMO validator
npm run package      # writes packages/chrome-<version>.zip and packages/firefox-<version>.zip
```

## Test the extension locally

Do `npm run build` first. Do it again after each code change, and then
reload the extension in the browser.

On WSL, the browsers run on Windows. To get the Windows path of a build
folder, run `wslpath -w dist/chrome` or `wslpath -w dist/firefox`.

### Chrome (and Edge, Brave)

1. Open `chrome://extensions` (Edge: `edge://extensions`).
2. Set "Developer mode" to on (top-right corner).
3. Click "Load unpacked" and select the `dist/chrome` folder.
4. After a code change, run `npm run build` and click the reload icon on the
   extension card.

The extension stays installed after a browser restart.

### Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click "Load Temporary Add-on…" and select `dist/firefox/manifest.json`.
3. After a code change, run `npm run build` and click "Reload".

Firefox removes a temporary add-on when the browser closes. On Linux or
macOS with a local Firefox, you can also use
`npx web-ext run --source-dir dist/firefox`. This was not tested on WSL. This command opens a new
Firefox profile and reloads the add-on when a file changes.

If the fader does not show or the tempo does not change in Firefox, the
extension possibly does not have access to the sites. Do these steps:

1. Open `about:addons`.
2. Click the extension name (not the switch).
3. Open the "Permissions" tab.
4. Set the switches for `w.soundcloud.com` and `deezcuts.io` to on.
5. Reload the deezcuts.io page.

### Test procedure on deezcuts.io

1. Open a track page on deezcuts.io and start the track in the player at
   the bottom.
2. Make sure that the footer player shows the tempo fader.
3. Open a page with an embedded SoundCloud player on a different website.
   Make sure that the extension shows nothing there.
4. Set the tempo to +8 %. Make sure that the tempo changes.
5. Go to the next track. Make sure that the tempo stays at +8 % (the player
   then uses a different deck).
6. Pause and play again, and seek in the track. Make sure that the tempo stays.
7. Make sure that the time display and the progress bar stay correct.
8. Make sure that the footer player shows the horizontal fader between the
   volume slider and the queue button, and that `/curate` shows the vertical
   fader after the volume slider.
9. Move one fader. Make sure that the other fader shows the same value.
10. Double-click a fader. Make sure that the tempo goes to 0 % and the LED
    comes on.
11. Open `/curate` with the BPM fact pinned. Make sure that the fader shows
    the BPM, and that the BPM changes on the next track.

## Publish

Do these steps for each release:

1. Increase `version` in `package.json`. The build writes it into each
   manifest.
2. Run `npm run lint`.
3. Run `npm run package`.

### Chrome Web Store

The privacy policy is `PRIVACY.md`.

This one store is for Chrome. Edge, Brave, Opera, and Vivaldi can also
install from it. Edge also has its own store (Microsoft Partner Center).
Microsoft charges no registration fee. You can upload the same ZIP file there.

1. Register as a developer in the
   [Chrome Web Store developer dashboard](https://developer.chrome.com/docs/webstore/register).
   Google charges a one-time registration fee (the documentation does not
   state the amount).
2. Upload `packages/chrome-<version>.zip`.
3. Supply the listing assets:
   - icon: 128×128 px (`tempo_core/icons/icon128.png`, with 16 px of
     transparent padding at each side);
   - min. one screenshot: 1280×800 px or 640×400 px;
   - small promo tile (440×280 px) and marquee (1400×560 px, optional):
     the PNG files in `store/promo/`.
4. Complete the "Privacy practices" tab: single purpose, a justification for
   the host access, "no remote code", and the data usage ("Website content"
   only). Use the privacy policy URL of `PRIVACY.md` on GitHub.
5. Submit for review. Review usually takes a few days. It can take up to a
   few weeks.

### Firefox Add-ons (AMO)

Firefox installs only signed add-ons (except temporary add-ons). The
Mozilla documentation mentions no fee for signing.

1. Make an account on [addons.mozilla.org](https://addons.mozilla.org/developers/).
2. Before the first upload, change the add-on ID in
   `firefox/manifest.override.json` (`tempo-slider@deezcuts.invalid`) to an ID that you
   own, for example `tempo-slider@your-domain`. Do not change the ID after
   the first upload.
3. Upload `packages/firefox-<version>.zip`. Select one of these:
   - "On this site" (listed): the add-on shows on AMO.
   - "On your own" (unlisted): Mozilla signs the add-on and you distribute
     the `.xpi` file yourself.
4. If a reviewer asks for the source code: the ZIP already contains the
   source code, because the project has no build step that changes the code.

### Name and trademark

The Chrome Web Store policy does not permit a product to suggest that
another company made or supports it. The AMO policy has no specific rule
for third-party names. For both stores, the name does not contain
"SoundCloud", "Pioneer" or "CDJ". The store description uses these names
only to describe the function, and it has a trademark note. Do not use the
SoundCloud or Pioneer DJ logo in the icon or in the screenshots.

## Before the first release

- Change the Firefox add-on ID (see above).
- Do the test procedure in Chrome and in Firefox.

## License and trademarks

The code is under the MIT license. See `LICENSE`.

"deezcuts", "DeezCuts", "deezcuts.io" and the DeezCuts logo are the
intellectual property of Zintec GmbH, Switzerland. The MIT license does not
give rights to these names or to the logo. The logo is in `icons-src/`,
`tempo_core/icons/` and `store/promo/`. Do not use the names or the logo for
other products without written permission from Zintec GmbH.
