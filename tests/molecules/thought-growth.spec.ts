import { test } from '@playwright/test';
import { thoughtGrowthWorkflow } from '../helpers/thought-growth-workflow';

test.use({ reducedMotion: 'reduce', trace: 'off' });

test('a captured thought grows an edited task and keeps its source and family after reload', async ({ page, baseURL, isMobile }) => {
  await thoughtGrowthWorkflow(page, new URL(baseURL!).origin, false, isMobile);
});
