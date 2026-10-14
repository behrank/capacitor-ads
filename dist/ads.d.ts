import { type AdsConfig, type Platform } from './config.js';
import { type Readable } from './store.js';
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
export declare function createAds(config: AdsConfig): Ads;
