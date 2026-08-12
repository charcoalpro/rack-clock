# Rack Clock

A buildless work/rest timer PWA. Four files, no dependencies, no build step, ~21 KB uncompressed (~6 KB over the wire).

```
index.html      markup + inline utility CSS (4.7 KB) + app logic
manifest.json   PWA install config, SVG data-URI icons
sw.js           cache-first service worker
_headers        Cloudflare Pages edge cache + security headers
```

## How it works

**Work clock** counts up. **Rest** pauses it and starts a countdown — 1 minute normally, 3 minutes on every 3rd rest. At 00:00 it plays three synthesised beeps, resets the work clock to 00:00, and leaves it paused for the next set.

The row of graduation marks under the header is the session ladder: filled marks are sets you've banked, and every third mark is tall — that's a big rest. The upcoming mark blinks when the next rest is the long one.

The shell is height-capped at `100dvh` and never scrolls — a timer you have to scroll to read is useless mid-set. The clock is sized `min(27vw, 20dvh)` so height binds on a landscape phone, and two `max-height` breakpoints drop the footer, then the ladder and hint, rather than let anything spill. Verified at 20 viewport sizes from 240×320 up.

If the app isn't installed, a bar takes the footer's slot offering to install it — a real `beforeinstallprompt` button on Chromium, the Share → Add to Home Screen recipe on iOS, which has no programmatic install. Dismissing it is remembered in `rackclock.install-dismissed`, so it asks once.

## Architecture

State is a plain object. Actions mutate state only — they never touch the DOM, the wake lock, storage or the frame loop. Each action ends in `commit()`, which runs the effect pass exactly once:

```
action()  ->  mutate S  ->  commit()  ->  paint()    full DOM update
                                          syncLock()  screen wake lock
                                          save()      localStorage
                                          pump()      start/stop the rAF loop
```

`render()` is the hot path — digits and the tide, nothing else. It is a pure function of state: it writes the DOM and never transitions. A rest is allowed to end in exactly one place, `expire()`, which the frame loop calls before each render. Keeping those apart is what stops a repaint from re-entering `commit()`. One commit produces exactly one render, and the rAF loop stops entirely when the app is idle.

Anything read back from `localStorage` is coerced and clamped in `restore()` before it reaches state — it is user-writable storage that outlives any given app version, so an incoherent record is dropped rather than trusted.

Keeping effects out of the actions is what stops composed actions from replaying each other's side effects. Every value is an absolute `Date.now()` stamp, so throttled frames, a hidden tab, and a killed-and-relaunched app all recover the correct time rather than accumulating drift.

State is persisted on every commit and on `pagehide`. A relaunch inside 4 hours resumes the workout; a rest that expired while the app was gone resets silently instead of beeping at someone who is no longer waiting for it.

## Deploy

### 1. Push to GitHub

```bash
cd rack-clock
git init
git add .
git commit -m "Rack Clock: buildless work/rest timer PWA"
git branch -M main
git remote add origin https://github.com/charcoalpro/rack-clock.git
git push -u origin main
```

All four files must sit at the **repository root**, not in a subfolder.

### 2. Connect Cloudflare Pages

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. Authorise GitHub, pick the `rack-clock` repo, **Begin setup**
3. Build settings:
   - Framework preset: **None**
   - Build command: *leave empty*
   - Build output directory: `/`
   - Root directory: `/`
4. **Save and Deploy.** It finishes in seconds — there's nothing to compile.

Every push to `main` redeploys. Pull requests get their own preview URL.

### 3. Install it

Open the `.pages.dev` URL on your phone. Android/Chrome offers "Install app"; iOS/Safari needs Share → **Add to Home Screen**. Once installed it launches offline, full-screen, with no browser chrome.

## Releasing changes

Bump the `CACHE` constant in `sw.js` (`rack-clock-v1` → `v2`) on any deploy that changes `index.html`. If you ever change the shape of the persisted state, bump `STORE` in `index.html` too — `restore()` rejects any record whose `v` doesn't match. That's the entire release process — the old cache is deleted on activation and clients pick up the new shell on their next launch.

`_headers` deliberately keeps `index.html` and `sw.js` on `must-revalidate` at the browser while letting Cloudflare hold them at the edge (`CDN-Cache-Control`). Without that split, an unhashed single-file app can strand users on a stale build indefinitely.

## Optional hardening

Icons are inline SVG data URIs, which Chromium accepts for install. If you want belt-and-braces coverage for older Android WebViews and iOS home-screen icons, drop a `icon-512.png` and `apple-touch-icon.png` at the root, reference them in `manifest.json` and `index.html`, and add them to `PRECACHE` in `sw.js`. The `_headers` rules for `/*.png` already cover them.
