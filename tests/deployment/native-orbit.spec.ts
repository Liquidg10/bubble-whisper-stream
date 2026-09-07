import { expect, test } from '@playwright/test';
import { existingAreaWorkflow, nativeOrbitWorkflow, prepareAnonymousGuide } from '../molecules/native-orbit-workflow';

for (const viewport of [
  { name: 'desktop', width: 1440, height: 1000, touch: false },
  { name: 'mobile', width: 390, height: 844, touch: true },
]) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.touch, hasTouch: viewport.touch });
    test('production native orbit movement and accessible alternative survive reload', async ({ page }, testInfo) => {
      test.setTimeout(60_000);
      const errors = await prepareAnonymousGuide(page, 'http://127.0.0.1:4181', true);
      await nativeOrbitWorkflow(page, testInfo, viewport.touch);
      expect(errors).toEqual([]);
    });
    test('production life-area reuse preserves stable identity and shared bonds', async ({ page }, testInfo) => {
      test.setTimeout(60_000);
      const errors = await prepareAnonymousGuide(page, 'http://127.0.0.1:4181', true);
      await existingAreaWorkflow(page, testInfo);
      expect(errors).toEqual([]);
    });
  });
}
