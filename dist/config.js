/** Google's official test ad units. They always fill and are safe to tap. */
export const TEST_UNITS = {
    banner: {
        ios: 'ca-app-pub-3940256099942544/2934735716',
        android: 'ca-app-pub-3940256099942544/6300978111',
    },
    rewarded: {
        ios: 'ca-app-pub-3940256099942544/1712485313',
        android: 'ca-app-pub-3940256099942544/5224354917',
    },
    interstitial: {
        ios: 'ca-app-pub-3940256099942544/4411468910',
        android: 'ca-app-pub-3940256099942544/1033173712',
    },
};
export function pickUnit(units, fallbackTest, testAds, platform) {
    if (!units || platform === 'web')
        return '';
    const set = testAds ? units.test ?? fallbackTest : units.prod;
    // No real unit on this platform → no test ad either, so test builds match release.
    if (testAds && !units.prod[platform])
        return '';
    return set[platform] ?? '';
}
