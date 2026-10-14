# capacitor-ads

AdMob for Capacitor apps in one setup call: bottom banner, rewarded ads, GDPR consent (UMP) and Apple's tracking prompt (ATT).
It wraps `@capacitor-community/admob@6.2.0` and includes a patch for the plugin's iOS side.

Extracted from Word Den. Works with any framework. `privacyOptionsAvailable` follows the Svelte store contract, so `$store` works in Svelte.

## What it does

- On first start: UMP consent form when required (EEA/UK) → ATT prompt on iOS → `AdMob.initialize()` → banner.
- Banner: keeps the slot collapsed until an ad arrives, writes its height to a CSS variable (`--ad-h`), retries after a no-fill (30s → 1m → 2m → 5m) and retries again when the app returns to the foreground.
- Hides the native banner while an overlay/sheet (`.overlay`) is open, because a CSS z-index can't cover it.
- Rewarded: resolves `true` only if the reward was earned; handles early close, no fill and lost events. Hides the banner during the ad and calls `onFullscreenAd` so you can pause music.
- Test builds automatically use Google's test units. Tapping your own live ads gets the AdMob account banned.

## Install (pnpm workspace)

```bash
pnpm add github:behrank/capacitor-ads#v1.0.0 @capacitor-community/admob@6.2.0 --filter <your-app>
npx capacitor-ads-patch     # from the workspace root: copies the iOS patch, registers it with pnpm
pnpm install
npx cap sync ios
```

The patch pins Google Mobile Ads to 11.x (the plugin otherwise tracks `main`) and fixes how the 320×50 banner is placed on the safe-area edge, so the creative isn't clipped or shifted.

## Info.plist

Copy the keys in [`ios/Info.plist-snippet.xml`](ios/Info.plist-snippet.xml) into `ios/App/App/Info.plist`: the AdMob App ID, the ATT text and the 50 SKAdNetwork IDs. Without `GADApplicationIdentifier` the app crashes on launch.

For the consent form to appear, create and publish a GDPR message in the AdMob console under **Privacy & messaging**.

## Use

```ts
// src/lib/ads.ts
import { createAds } from 'capacitor-ads';

export const ads = createAds({
  banner:   { prod: { ios: 'ca-app-pub-…/…' } },
  rewarded: { prod: { ios: 'ca-app-pub-…/…' } },
  testAds: !import.meta.env.PROD || import.meta.env.VITE_TEST_ADS === '1',
  onFullscreenAd: (active) => pauseMusic(active),   // optional
});
```

```ts
ads.startBanner();                       // once the main UI is up (safe to call repeatedly)
await ads.adsSettled();                  // before showing your own prompts (Game Center, notifications…)
if (ads.rewardedAvailable) {
  const earned = await ads.showRewarded();
}
```

Settings → "Ad privacy choices":

```svelte
{#if $privacy}<button on:click={ads.showPrivacyOptions}>Ad privacy choices</button>{/if}
<script>const privacy = ads.privacyOptionsAvailable;</script>
```

Layout padding for the banner:

```css
.shell.native { padding-bottom: calc(var(--ad-h, 50px) + env(safe-area-inset-bottom, 0px)); }
```

## Options

| Option | Default | |
|---|---|---|
| `banner`, `rewarded` | — | `{ prod: { ios, android }, test? }`. Leave out, or give an empty id, for no ad. `test` defaults to Google's test units. A platform without a real unit gets no test ad either. |
| `testAds` | required | Use test units. |
| `bannerHeight` | `50` | Slot height (pt). |
| `bannerPosition` | `BOTTOM_CENTER` | or `TOP_CENTER` |
| `heightCssVar` | `--ad-h` | `null` turns it off. |
| `overlaySelector` | `.overlay` | Banner is hidden while this is in the DOM. `null` turns it off. |
| `retryDelaysMs` | `[30s, 60s, 120s, 300s]` | No-fill backoff. |
| `requestTracking` | `true` | Ask for ATT on iOS. |
| `settleTimeoutMs` | `12000` | Max wait in `adsSettled()`. |
| `rewardedReadyTimeoutMs` | `8000` | Max wait for the SDK before a rewarded ad. |
| `rewardedMaxMs` | `180000` | Safety cap on one rewarded ad. |
| `onFullscreenAd` | — | `(active) => void` |
| `logTag` | `[ads]` | Console prefix. |

`TEST_UNITS` exports Google's test units (banner, rewarded, interstitial).

## Release checklist

- Release build without `VITE_TEST_ADS` → real units. Device test build with `VITE_TEST_ADS=1`.
- App Store Connect privacy: declare "Device ID" + "Advertising data" used for third-party advertising (tracking).
- `app-ads.txt` on your developer website.

## Develop

```bash
npm install
npm run build   # → dist/ (committed, so git installs need no build step)
npm test
```

Release a version: bump `version`, `npm run build`, commit, `git tag v1.x.y && git push --tags`, then update the `#v1.x.y` in each app.
