import { test } from '@playwright/test';
import { thoughtGrowthWorkflow } from '../helpers/thought-growth-workflow';

for (const viewport of [
  { name: 'desktop', width: 1440, height: 1000, touch: false },
  { name: 'mobile', width: 390, height: 844, touch: true },
]) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.touch, hasTouch: viewport.touch, reducedMotion: 'reduce' });
    test('production captured thought keeps its words and type while a grown task persists', async ({ page }) => {
      test.setTimeout(60_000);
      await thoughtGrowthWorkflow(page, 'http://127.0.0.1:4181', true, viewport.touch);
    });
  });
}
