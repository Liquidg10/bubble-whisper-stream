import { expect, test } from '@playwright/test';
import { existingAreaWorkflow, nativeOrbitWorkflow, prepareAnonymousGuide } from './native-orbit-workflow';

test('native orbit drag at zoom, cancellation and keyboard alternative persist one task', async ({ page, baseURL, isMobile }, testInfo) => {
  const errors = await prepareAnonymousGuide(page, new URL(baseURL!).origin, false);
  await nativeOrbitWorkflow(page, testInfo, isMobile);
  expect(errors).toEqual([]);
});

test('reusing a saved life area grows bonds without duplicating its nucleus or task', async ({ page, baseURL }, testInfo) => {
  const errors = await prepareAnonymousGuide(page, new URL(baseURL!).origin, false);
  await existingAreaWorkflow(page, testInfo);
  expect(errors).toEqual([]);
});
