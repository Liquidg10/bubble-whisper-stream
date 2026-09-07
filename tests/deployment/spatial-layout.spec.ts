import { test } from '@playwright/test';
import { layoutStorageFailureWorkflow, noWebGlWorkflow, savedSpatialLayoutWorkflow, spatial3dWorkflow, spatialMotionAndContextLossWorkflow } from '../helpers/spatial-layout-workflow';

for (const touch of [false, true]) {
  test.describe(touch ? 'mobile spatial layouts' : 'desktop spatial layouts', () => {
    test.use({ viewport: touch ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, isMobile: touch, hasTouch: touch });
    test('saved placement and Undo survive reload without task changes', async ({ page }, testInfo) => {
      test.setTimeout(60_000);
      await savedSpatialLayoutWorkflow(page, 'http://127.0.0.1:4181', true, touch, testInfo);
    });
    test('3D camera and native placement preserve task meaning', async ({ page }, testInfo) => {
      test.setTimeout(60_000);
      await spatial3dWorkflow(page, 'http://127.0.0.1:4181', true, touch, testInfo);
    });
    test('no-WebGL fallback retains ordinary controls', async ({ page }, testInfo) => {
      test.setTimeout(60_000);
      await noWebGlWorkflow(page, 'http://127.0.0.1:4181', true, touch, testInfo);
    });
    test('layout storage rejection is visible and Retry recovers', async ({ page }, testInfo) => {
      test.setTimeout(60_000);
      await layoutStorageFailureWorkflow(page, 'http://127.0.0.1:4181', true, touch, testInfo);
    });
    test('reduced motion and real context loss retain a usable saved layout', async ({ page }, testInfo) => {
      test.setTimeout(60_000);
      await spatialMotionAndContextLossWorkflow(page, 'http://127.0.0.1:4181', true, touch, testInfo);
    });
  });
}
