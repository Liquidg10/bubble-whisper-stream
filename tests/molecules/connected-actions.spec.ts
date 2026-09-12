import { test } from '@playwright/test';
import { automaticNotesWorkflow, connectedActionsWorkflow } from '../helpers/connected-actions-workflow';

test('typed relationships trace, reject dependency cycles and show reversible completed contributions', async ({ page, baseURL, isMobile }, testInfo) => {
  await connectedActionsWorkflow(page,new URL(baseURL!).origin,false,isMobile,testInfo);
});

test('automatic notes wait for prerequisites, create one child and undo durably', async ({ page, baseURL, isMobile }, testInfo) => {
  await automaticNotesWorkflow(page,new URL(baseURL!).origin,false,isMobile,testInfo);
});
