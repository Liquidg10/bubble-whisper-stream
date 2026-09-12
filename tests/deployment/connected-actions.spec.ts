import { test } from '@playwright/test';
import { automaticNotesWorkflow, connectedActionsWorkflow } from '../helpers/connected-actions-workflow';

for (const touch of [false,true]) {
  test.describe(touch ? 'mobile connected actions' : 'desktop connected actions',()=>{
    test.use({viewport:touch?{width:390,height:844}:{width:1440,height:1000},isMobile:touch,hasTouch:touch});
    test('typed connections and reversible completed work persist in the production build',async({page},testInfo)=>{
      test.setTimeout(60000);
      await connectedActionsWorkflow(page,'http://127.0.0.1:4181',true,touch,testInfo);
    });
    test('automatic notes are bounded and can be undone in the production build',async({page},testInfo)=>{
      test.setTimeout(60000);
      await automaticNotesWorkflow(page,'http://127.0.0.1:4181',true,touch,testInfo);
    });
  });
}
