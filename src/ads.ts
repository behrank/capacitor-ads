import { Capacitor } from '@capacitor/core';
import { type AdsConfig, type Platform, TEST_UNITS, pickUnit } from './config.js';
import { type Readable, valueStore } from './store.js';

type AdMobApi = typeof import('@capacitor-community/admob');

export interface Ads {
  /** True in the iOS/Android app, false in a browser/PWA build. */
  readonly isNative: boolean;
  readonly platform: Platform;
  /** The banner unit in use ('' when there is none). */
  readonly bannerUnitId: string;
  /** The rewarded unit in use ('' when there is none). */
  readonly rewardedUnitId: string;
  /** Rewarded ads exist only in the native app and only with a configured unit. */
  readonly rewardedAvailable: boolean;
  /**
   * True when the consent form can be reopened (EEA/UK users). Show an
   * "Ad privacy choices" row in Settings while it is true.
   */
  readonly privacyOptionsAvailable: Readable<boolean>;
  /**
   * Gathers consent (UMP, then ATT on iOS), starts the SDK and shows the banner.
   * Safe to call many times; only the first call does anything. Without a banner
   * unit it still gathers consent and starts the SDK (for rewarded ads).
   */
  startBanner(): Promise<void>;
  /** Resolves once the consent/ATT prompts are done (or after a timeout), so other prompts can follow. */
  adsSettled(): Promise<void>;
  /**
   * Shows one rewarded ad. Resolves true only if the player watched it through and
   * earned the reward; false on no fill, an early close, or any error.
   */
  showRewarded(): Promise<boolean>;
  /** Settings → "Ad privacy choices": reopens the consent form. */
  showPrivacyOptions(): Promise<void>;
}

export function createAds(config: AdsConfig): Ads {
  const platform: Platform =
    config.platform ?? (Capacitor.getPlatform() as Platform);
  const isNative = platform !== 'web';
  const bannerUnitId = pickUnit(config.banner, TEST_UNITS.banner, config.testAds, platform);
  const rewardedUnitId = pickUnit(config.rewarded, TEST_UNITS.rewarded, config.testAds, platform);
  const rewardedAvailable = isNative && !!rewardedUnitId;

  const tag = config.logTag ?? '[ads]';
  const bannerHeight = config.bannerHeight ?? 50;
  const heightVar = config.heightCssVar === undefined ? '--ad-h' : config.heightCssVar;
  const overlaySelector = config.overlaySelector === undefined ? '.overlay' : config.overlaySelector;
  const retryDelays = config.retryDelaysMs?.length ? config.retryDelaysMs : [30_000, 60_000, 120_000, 300_000];
  const load = config.loadAdMob ?? (() => import('@capacitor-community/admob'));
  const onFullscreen = config.onFullscreenAd ?? (() => {});

  const privacyOptionsAvailable = valueStore(false);

  let started = false;
  let bannerLoaded = false;
  /** False while an overlay is open (the banner is hidden then). */
  let bannerShown = true;
  let retryCount = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  /** Resolves once consent has been gathered and the SDK initialised. */
  let sdkReady: Promise<boolean> | null = null;
  let resolveSdk: ((ok: boolean) => void) | null = null;
  const sdkPromise = (): Promise<boolean> => {
    if (!sdkReady) sdkReady = new Promise((r) => (resolveSdk = r));
    return sdkReady;
  };

  function setAdHeight(px: number) {
    if (!heightVar || typeof document === 'undefined') return;
    document.documentElement.style.setProperty(heightVar, Math.max(0, px) + 'px');
  }

  /**
   * GDPR (UMP) consent first, then Apple's tracking prompt (ATT).
   * UMP has to run on every launch before an ad is requested; outside the EEA/UK it
   * resolves NOT_REQUIRED without showing anything. Failures never block ads:
   * without consent Google serves limited/non-personalised ads.
   */
  async function gatherConsent(mod: AdMobApi): Promise<void> {
    const { AdMob, AdmobConsentStatus } = mod;
    try {
      let info = await AdMob.requestConsentInfo();
      if (info.isConsentFormAvailable && info.status === AdmobConsentStatus.REQUIRED) {
        info = await AdMob.showConsentForm();
      }
      privacyOptionsAvailable.set(
        !!info.isConsentFormAvailable && info.status !== AdmobConsentStatus.NOT_REQUIRED,
      );
    } catch (e) {
      console.warn(tag, 'consent failed', e);
    }
    if (platform === 'ios' && config.requestTracking !== false) {
      try {
        const { status } = await AdMob.trackingAuthorizationStatus();
        if (status === 'notDetermined') await AdMob.requestTrackingAuthorization();
      } catch (e) {
        console.warn(tag, 'ATT failed', e);
      }
    }
  }

  /**
   * Hide the banner while an overlay is open. Only acts once a banner has actually
   * loaded — the SDK removes the view after a failed request, and hide/resume then just fail.
   */
  function watchOverlays(hide: () => Promise<void>, show: () => Promise<void>) {
    if (!overlaySelector || typeof document === 'undefined') return;
    const sync = () => {
      const open = !!document.querySelector(overlaySelector);
      if (open === !bannerShown) return;
      bannerShown = !open;
      if (!bannerLoaded) return;
      void (open ? hide() : show()).catch(() => {});
    };
    new MutationObserver(sync).observe(document.body, { childList: true, subtree: true });
    sync();
  }

  async function startBanner(): Promise<void> {
    if (!isNative || started) return;
    started = true;
    // Keep the slot collapsed until an ad actually arrives (no empty strip on no-fill).
    setAdHeight(0);
    try {
      const mod = await load();
      const { AdMob, BannerAdSize, BannerAdPosition, BannerAdPluginEvents } = mod;
      sdkPromise();
      await gatherConsent(mod);
      await AdMob.initialize();
      resolveSdk?.(true);
      if (!bannerUnitId) return;

      /**
       * No fill ("No ad to show", code 3) is normal for a new app or ad unit and in
       * low-demand regions. The SDK only auto-refreshes a banner that has loaded once,
       * so after a failure we request again ourselves, backing off.
       */
      const request = async () => {
        clearTimeout(retryTimer);
        retryTimer = undefined;
        try {
          await AdMob.showBanner({
            adId: bannerUnitId,
            adSize: BannerAdSize.BANNER,
            position: (config.bannerPosition ?? 'BOTTOM_CENTER') === 'TOP_CENTER'
              ? BannerAdPosition.TOP_CENTER
              : BannerAdPosition.BOTTOM_CENTER,
            margin: 0,
          });
          // An overlay may have opened while we were waiting; keep it uncovered.
          if (!bannerShown) await AdMob.hideBanner().catch(() => {});
        } catch (e) {
          console.warn(tag, 'showBanner failed', e);
          scheduleRetry();
        }
      };
      const scheduleRetry = () => {
        if (retryTimer) return;
        const delay = retryDelays[Math.min(retryCount, retryDelays.length - 1)];
        retryCount++;
        retryTimer = setTimeout(() => void request(), delay);
      };

      AdMob.addListener(BannerAdPluginEvents.Loaded, () => {
        bannerLoaded = true;
        retryCount = 0;
        setAdHeight(bannerHeight);
      });
      AdMob.addListener(BannerAdPluginEvents.SizeChanged, (size: { width: number; height: number }) => {
        if (size?.height > 0) setAdHeight(size.height);
      });
      AdMob.addListener(BannerAdPluginEvents.FailedToLoad, (err: { code?: number; message?: string }) => {
        console.warn(tag, 'no banner', err?.code, err?.message);
        // Once a banner has loaded, the SDK keeps refreshing it on its own.
        if (bannerLoaded) return;
        setAdHeight(0);
        scheduleRetry();
      });
      // Coming back to the app is a good moment to try again instead of waiting out the backoff.
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible' && !bannerLoaded && retryTimer) {
            retryCount = 0;
            void request();
          }
        });
      }

      await request();
      watchOverlays(() => AdMob.hideBanner(), () => AdMob.resumeBanner());
    } catch (e) {
      started = false;
      resolveSdk?.(false);
      sdkReady = null;
      console.warn(tag, 'banner failed', e);
    }
  }

  async function adsSettled(): Promise<void> {
    if (!isNative) return;
    await Promise.race([
      sdkPromise(),
      new Promise((r) => setTimeout(r, config.settleTimeoutMs ?? 12_000)),
    ]);
  }

  async function showRewarded(): Promise<boolean> {
    if (!rewardedAvailable) return false;
    void startBanner();
    const ok = await Promise.race([
      sdkPromise(),
      new Promise<boolean>((r) => setTimeout(() => r(false), config.rewardedReadyTimeoutMs ?? 8000)),
    ]);
    if (!ok) return false;
    const { AdMob, RewardAdPluginEvents } = await load();
    const handles: { remove: () => Promise<void> }[] = [];
    try {
      await AdMob.prepareRewardVideoAd({ adId: rewardedUnitId });
      let earned = false;
      let finish: () => void = () => {};
      // Dismissed (or a show error) ends it. The show call itself may never resolve when the
      // player closes early, so it is not awaited; a long safety timeout covers a lost event.
      const closed = new Promise<void>((resolve) => {
        finish = resolve;
        setTimeout(resolve, config.rewardedMaxMs ?? 180_000);
      });
      handles.push(await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => { earned = true; }));
      handles.push(await AdMob.addListener(RewardAdPluginEvents.Dismissed, () => finish()));
      handles.push(await AdMob.addListener(RewardAdPluginEvents.FailedToShow, () => finish()));
      onFullscreen(true);
      await AdMob.hideBanner().catch(() => {});
      AdMob.showRewardVideoAd().then(() => { earned = true; }, () => finish());
      await closed;
      return earned;
    } catch (e) {
      console.warn(tag, 'rewarded failed', e);
      return false;
    } finally {
      onFullscreen(false);
      for (const h of handles) void h.remove().catch(() => {});
      if (bannerShown && bannerLoaded) void AdMob.resumeBanner().catch(() => {});
    }
  }

  async function showPrivacyOptions(): Promise<void> {
    if (!isNative) return;
    try {
      const { AdMob } = await load();
      await AdMob.showConsentForm();
    } catch (e) {
      console.warn(tag, 'privacy form failed', e);
    }
  }

  return {
    isNative,
    platform,
    bannerUnitId,
    rewardedUnitId,
    rewardedAvailable,
    privacyOptionsAvailable: { subscribe: privacyOptionsAvailable.subscribe, get: privacyOptionsAvailable.get },
    startBanner,
    adsSettled,
    showRewarded,
    showPrivacyOptions,
  };
}
