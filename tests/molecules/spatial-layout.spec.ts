import { test } from '@playwright/test';
import { layoutStorageFailureWorkflow, noWebGlWorkflow, savedSpatialLayoutWorkflow, spatial3dWorkflow, spatialMotionAndContextLossWorkflow } from '../helpers/spatial-layout-workflow';

test('saved layout controls, orbit placement, reset and Undo preserve every task across reload', async ({ page, baseURL }, testInfo) => {
  await savedSpatialLayoutWorkflow(page, baseURL!, false, testInfo.project.name === 'mobile', testInfo);
});
test('a rotated 3D view supports native placement and cancel without changing tasks', async ({ page, baseURL }, testInfo) => {
  await spatial3dWorkflow(page, baseURL!, false, testInfo.project.name === 'mobile', testInfo);
});
test('unavailable WebGL retains working layout controls and task navigation', async ({ page, baseURL }, testInfo) => {
  await noWebGlWorkflow(page, baseURL!, false, testInfo.project.name === 'mobile', testInfo);
});
test('a rejected layout save is visible, reversible and explicitly retryable', async ({ page, baseURL }, testInfo) => {
  await layoutStorageFailureWorkflow(page, baseURL!, false, testInfo.project.name === 'mobile', testInfo);
});
test('reduced motion keeps 3D still and context loss preserves a usable saved layout', async ({ page, baseURL }, testInfo) => {
  await spatialMotionAndContextLossWorkflow(page, baseURL!, false, testInfo.project.name === 'mobile', testInfo);
});
