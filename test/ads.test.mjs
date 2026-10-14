import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAds, TEST_UNITS } from '../dist/index.js';

// Minimal DOM for the banner height var / overlay watcher.
globalThis.document = {
  documentElement: { style: { props: {}, setProperty(k, v) { this.props[k] = v; } } },
  body: {}, visibilityState: 'visible',
  querySelector: () => null, addEventListener() {},
};
globalThis.MutationObserver = class { observe() {} };

function fakeAdMob({ consent = 'NOT_REQUIRED', att = 'notDetermined', rewardOutcome = 'earned' } = {}) {
  const calls = []; const listeners = {};
  const AdMob = {
    async requestConsentInfo() { calls.push('consentInfo'); return { status: consent, isConsentFormAvailable: consent !== 'NOT_REQUIRED' }; },
    async showConsentForm() { calls.push('consentForm'); return { status: 'OBTAINED', isConsentFormAvailable: true }; },
    async trackingAuthorizationStatus() { calls.push('attStatus'); return { status: att }; },
    async requestTrackingAuthorization() { calls.push('attRequest'); },
    async initialize() { calls.push('init'); },
    async showBanner(o) { calls.push('showBanner:' + o.adId); listeners['bannerAdLoaded']?.(); },
    async hideBanner() { calls.push('hideBanner'); },
    async resumeBanner() { calls.push('resumeBanner'); },
    async prepareRewardVideoAd(o) { calls.push('prepare:' + o.adId); },
    async showRewardVideoAd() {
      calls.push('showRewarded');
      if (rewardOutcome === 'earned') { listeners['onRewardedVideoAdReward']?.(); listeners['onRewardedVideoAdDismissed']?.(); }
      else { listeners['onRewardedVideoAdDismissed']?.(); return new Promise(() => {}); }
    },
    async addListener(ev, fn) { listeners[ev] = fn; return { remove: async () => {} }; },
  };
  const mod = {
    AdMob,
    AdmobConsentStatus: { REQUIRED: 'REQUIRED', NOT_REQUIRED: 'NOT_REQUIRED', OBTAINED: 'OBTAINED' },
    BannerAdSize: { BANNER: 'BANNER' }, BannerAdPosition: { BOTTOM_CENTER: 'BOTTOM_CENTER', TOP_CENTER: 'TOP_CENTER' },
    BannerAdPluginEvents: { Loaded: 'bannerAdLoaded', SizeChanged: 'bannerAdSizeChanged', FailedToLoad: 'bannerAdFailedToLoad' },
    RewardAdPluginEvents: { Rewarded: 'onRewardedVideoAdReward', Dismissed: 'onRewardedVideoAdDismissed', FailedToShow: 'onRewardedVideoAdFailedToShow' },
  };
  return { mod, calls };
}

const units = { banner: { prod: { ios: 'real-banner' } }, rewarded: { prod: { ios: 'real-rewarded' } } };

test('web build: nothing native', async () => {
  const ads = createAds({ ...units, testAds: false, platform: 'web' });
  assert.equal(ads.isNative, false);
  assert.equal(ads.rewardedAvailable, false);
  assert.equal(await ads.showRewarded(), false);
});

test('test builds use Google test units', () => {
  const ads = createAds({ ...units, testAds: true, platform: 'ios' });
  assert.equal(ads.bannerUnitId, TEST_UNITS.banner.ios);
  assert.equal(ads.rewardedUnitId, TEST_UNITS.rewarded.ios);
  const rel = createAds({ ...units, testAds: false, platform: 'ios' });
  assert.equal(rel.bannerUnitId, 'real-banner');
  const android = createAds({ ...units, testAds: true, platform: 'android' });
  assert.equal(android.rewardedAvailable, false, 'no real android unit → none in test either');
});

test('consent → ATT → init → banner, in order; height var set', async () => {
  const { mod, calls } = fakeAdMob({ consent: 'REQUIRED' });
  const ads = createAds({ ...units, testAds: false, platform: 'ios', loadAdMob: async () => mod });
  await ads.startBanner();
  await ads.startBanner(); // second call is a no-op
  assert.deepEqual(calls, ['consentInfo', 'consentForm', 'attStatus', 'attRequest', 'init', 'showBanner:real-banner']);
  assert.equal(ads.privacyOptionsAvailable.get(), true);
  assert.equal(document.documentElement.style.props['--ad-h'], '50px');
});

test('rewarded: earned → true, early close → false; music hook toggled', async () => {
  for (const [outcome, expected] of [['earned', true], ['closed', false]]) {
    const { mod } = fakeAdMob({ rewardOutcome: outcome });
    const seen = [];
    const ads = createAds({ ...units, testAds: false, platform: 'ios', rewardedReadyTimeoutMs: 50, rewardedMaxMs: 200, loadAdMob: async () => mod, onFullscreenAd: (a) => seen.push(a) });
    assert.equal(await ads.showRewarded(), expected);
    assert.deepEqual(seen, [true, false]);
  }
});
