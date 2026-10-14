export type Platform = 'ios' | 'android' | 'web';
/** One ad unit id per platform. An empty or missing id means "no ad on that platform". */
export interface PlatformUnits {
    ios?: string;
    android?: string;
}
export interface AdUnits {
    /** Real units. Served only when `testAds` is false. */
    prod: PlatformUnits;
    /** Defaults to Google's official test units (`TEST_UNITS`). */
    test?: PlatformUnits;
}
export interface AdsConfig {
    /** Bottom banner. Leave out for an app without a banner. */
    banner?: AdUnits;
    /** Rewarded ad. Leave out (or give an empty id) for an app without one. */
    rewarded?: AdUnits;
    /**
     * Show Google's test ads instead of the real units. Turn this on for every
     * development and device-test build: tapping your own live ads gets the AdMob
     * account banned. Typical: `!import.meta.env.PROD || import.meta.env.VITE_TEST_ADS === '1'`.
     */
    testAds: boolean;
    /** Banner slot height in points. Default 50 (standard 320×50 banner). */
    bannerHeight?: number;
    /** Default `BOTTOM_CENTER`. */
    bannerPosition?: 'BOTTOM_CENTER' | 'TOP_CENTER';
    /**
     * CSS variable on <html> that holds the banner's current height in px
     * (0 until an ad loads). Use it to pad the layout. Default `--ad-h`; `null` turns it off.
     */
    heightCssVar?: string | null;
    /**
     * The native banner sits above the web view, so a CSS z-index can't cover it.
     * While an element matching this selector is in the DOM the banner is hidden.
     * Default `.overlay`; `null` turns it off.
     */
    overlaySelector?: string | null;
    /** Retry delays after a banner no-fill, in ms. Default 30s, 60s, 2m, 5m (last one repeats). */
    retryDelaysMs?: number[];
    /** Ask for Apple's tracking permission (ATT) after consent on iOS. Default true. */
    requestTracking?: boolean;
    /** How long `adsSettled()` waits for the consent/ATT prompts at most. Default 12000. */
    settleTimeoutMs?: number;
    /** How long `showRewarded()` waits for the SDK to be ready. Default 8000. */
    rewardedReadyTimeoutMs?: number;
    /** Safety cap on one rewarded ad, in case the dismiss event is lost. Default 180000. */
    rewardedMaxMs?: number;
    /** Called with true while a full-screen ad is up and false after — e.g. to pause music. */
    onFullscreenAd?: (active: boolean) => void;
    /** Prefix for console warnings. Default `[ads]`. */
    logTag?: string;
    /** Overrides the detected platform. Mainly for tests. */
    platform?: Platform;
    /** Overrides how the AdMob plugin is loaded. Mainly for tests. */
    loadAdMob?: () => Promise<typeof import('@capacitor-community/admob')>;
}
/** Google's official test ad units. They always fill and are safe to tap. */
export declare const TEST_UNITS: {
    readonly banner: {
        readonly ios: "ca-app-pub-3940256099942544/2934735716";
        readonly android: "ca-app-pub-3940256099942544/6300978111";
    };
    readonly rewarded: {
        readonly ios: "ca-app-pub-3940256099942544/1712485313";
        readonly android: "ca-app-pub-3940256099942544/5224354917";
    };
    readonly interstitial: {
        readonly ios: "ca-app-pub-3940256099942544/4411468910";
        readonly android: "ca-app-pub-3940256099942544/1033173712";
    };
};
export declare function pickUnit(units: AdUnits | undefined, fallbackTest: PlatformUnits, testAds: boolean, platform: Platform): string;
