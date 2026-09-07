import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { prepareAnonymousGuide, savedBubbles as readSavedBubbles } from '../molecules/native-orbit-workflow';

const names = {
  source: 'See how one action connects your life',
  prerequisite: 'Try moving this bubble',
  other: 'Do one tiny thing that makes today easier',
};
interface SavedBubble {
  id: string; content: string; caption?: string; completed?: boolean;
  metadata?: {
    canonicalTask?: { relationships?: Array<{kind:string;targetTaskId:string}>; domainLinks?:Array<{domainId:string;effect?:string}> };
    bubbleGarden?: { sourceTaskId?:string; sproutKey?:string; automatic?:boolean; proactive?:{enabled:boolean}; review?:{dismissedSproutKeys:string[]} };
  };
}
const saved = async (page: Page) => await readSavedBubbles(page) as unknown as SavedBubble[];
async function press(control: Locator, touch: boolean) { if (touch) await control.tap(); else await control.click(); }
async function openTask(page: Page, title: string, touch: boolean) {
  const navigator = page.getByTestId('atomic-task-navigator');
  if (await navigator.getAttribute('open') === null) await press(navigator.locator('summary'), touch);
  await navigator.getByRole('searchbox', {name:'Find a task in Atomic view',exact:true}).fill(title);
  await press(navigator.getByRole('button', {name:new RegExp(`^Open ${title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\.`)}),touch);
  await expect(page.getByRole('textbox',{name:'Content',exact:true})).toHaveValue(title);
}
async function closeTask(page:Page,touch:boolean) { await expect(page.getByRole('dialog').locator('fieldset[aria-busy="true"]')).toHaveCount(0); await press(page.getByRole('button',{name:'Done',exact:true}),touch); await expect(page.getByRole('textbox',{name:'Content',exact:true})).toHaveCount(0); }
async function addRelationship(page:Page,targetId:string,kind:string,touch:boolean) {
  const editor=page.getByTestId('task-relationships-editor');
  await press(editor.getByRole('button',{name:'Connect another task',exact:true}),touch);
  await editor.getByRole('combobox',{name:'This task…',exact:true}).selectOption(kind);
  await editor.getByRole('combobox',{name:'Connected task',exact:true}).selectOption(targetId);
  await editor.getByRole('textbox',{name:'What does this connection mean? (optional)',exact:true}).fill(`Browser-reviewed ${kind} connection`);
  await press(editor.getByRole('button',{name:'Add connection',exact:true}),touch);
}
async function connections(page:Page,touch:boolean) {
  const summary=page.locator('summary').filter({hasText:/Connections \(/});
  if(await summary.locator('..').getAttribute('open')===null) await press(summary,touch);
  return page.getByTestId('atomic-relationship-panel');
}
async function scopedAxe(page:Page,selector:string,testInfo:TestInfo,label:string) {
  // Grow opens while the previous dialog exits. Visibility alone can sample
  // composited fade colors rather than the finished dialog's actual contrast.
  await expect(page.locator('[role="dialog"][data-state="closed"]')).toHaveCount(0);
  await expect(page.locator(selector).first()).toBeVisible();
  await expect.poll(async () => page.locator(selector).evaluateAll(elements => {
    const surfaces = new Set<Element>();
    const animations = new Set<Animation>();
    for (const element of elements) {
      for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
        surfaces.add(ancestor);
        ancestor.getAnimations().forEach(animation => animations.add(animation));
      }
      element.getAnimations({ subtree: true }).forEach(animation => animations.add(animation));
    }
    const activeFiniteAnimations = [...animations].filter(animation =>
      Number.isFinite(animation.effect?.getComputedTiming().endTime) &&
      (animation.pending || animation.playState === 'running'),
    );
    return elements.length > 0 && activeFiniteAnimations.length === 0 &&
      [...surfaces].every(element => getComputedStyle(element).opacity === '1');
  }), { message: 'The scanned surface and its ancestors have finished fading and animating' }).toBe(true);
  const results=await new AxeBuilder({page}).include(selector).analyze();
  await testInfo.attach(`${label}-accessibility`,{body:JSON.stringify({violations:results.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)}))}),contentType:'application/json'});
  expect(results.violations).toEqual([]);
}

export async function connectedActionsWorkflow(page:Page,origin:string,production:boolean,touch:boolean,testInfo:TestInfo) {
  const errors=await prepareAnonymousGuide(page,origin,production);
  const initial=await saved(page);
  const source=initial.find(task=>task.content===names.source)!;
  const prerequisite=initial.find(task=>task.content===names.prerequisite)!;
  const other=initial.find(task=>task.content===names.other)!;
  await openTask(page,names.source,touch);
  await addRelationship(page,prerequisite.id,'depends-on',touch);
  await addRelationship(page,other.id,'tradeoff',touch);
  await page.getByRole('combobox',{name:'How this connects to Wellbeing',exact:true}).selectOption('tradeoff');
  await closeTask(page,touch);
  await expect.poll(async()=>(await saved(page)).find(task=>task.id===source.id)?.metadata?.canonicalTask?.relationships?.length).toBe(2);
  await openTask(page,names.prerequisite,touch);
  await addRelationship(page,other.id,'supports',touch);
  await addRelationship(page,source.id,'depends-on',touch);
  await expect(page.getByTestId('task-relationships-editor').getByRole('alert')).toContainText(/cycle|loop/i);
  await page.getByTestId('task-relationships-editor').getByRole('alert').scrollIntoViewIfNeeded();
  await page.screenshot({path:testInfo.outputPath('dependency-cycle-blocked.png')});
  await press(page.getByTestId('task-relationships-editor').getByRole('button',{name:'Cancel',exact:true}),touch);
  await closeTask(page,touch);
  await page.reload();
  await expect(page.getByTestId('atomic-viewport')).toBeVisible();
  let records=await saved(page);
  expect(records).toHaveLength(3);
  expect(records.find(task=>task.id===source.id)?.metadata?.canonicalTask?.relationships?.map(link=>link.kind).sort()).toEqual(['depends-on','tradeoff']);
  expect(records.find(task=>task.id===prerequisite.id)?.metadata?.canonicalTask?.relationships?.map(link=>link.kind)).toEqual(['supports']);
  for(const kind of ['depends-on','supports','tradeoff']) {
    const panel=await connections(page,touch);
    const summary=panel.locator('summary').filter({hasText:/Task relationships/});
    if(await summary.locator('..').getAttribute('open')===null)await press(summary,touch);
    await press(panel.locator(`[data-relationship-kind="${kind}"]`).getByRole('button',{name:/^Trace connection from/}),touch);
    await expect(page.getByTestId('atomic-task-relationship-trace')).toHaveAttribute('data-relationship-kind',kind);
    await expect(page.getByRole('button',{name:'Clear task connection trace',exact:true})).toBeFocused();
    if(kind==='depends-on') await page.screenshot({path:testInfo.outputPath('dependency-trace.png')});
    await press(page.getByRole('button',{name:'Clear task connection trace',exact:true}),touch);
  }
  // Close the independent task navigator before opening the source again.
  await openTask(page,names.source,touch);
  await expect(page.getByTestId('saved-task-connections')).toContainText('Waiting on 1 prerequisite.');
  await press(page.getByRole('checkbox',{name:'Completed',exact:true}),touch);
  await expect(page.getByRole('status',{name:'Completed work connections',exact:true})).toContainText('Tradeoff you noted');
  await scopedAxe(page,'[data-testid="saved-task-connections"]',testInfo,'completed-connections');
  await closeTask(page,touch);
  await expect(page.locator('[data-completed-area="physical-health"]')).toContainText('0 support · 1 tradeoff complete');
  const panel=await connections(page,touch);
  await press(panel.locator('summary').filter({hasText:'Completed work across your life'}),touch);
  await expect(panel.locator('[data-contribution-area="physical-health"]')).toContainText('0 supporting actions · 1 tradeoff');
  await panel.locator('[data-contribution-area="physical-health"]').scrollIntoViewIfNeeded();
  await page.screenshot({path:testInfo.outputPath('completed-contributions.png')});
  await openTask(page,names.source,touch);
  await press(page.getByRole('checkbox',{name:'Completed',exact:true}),touch);
  await expect(page.getByRole('status',{name:'Completed work connections',exact:true})).toHaveCount(0);
  await closeTask(page,touch);
  await expect(page.locator('[data-completed-area]')).toHaveCount(0);
  await openTask(page,names.prerequisite,touch);
  await press(page.getByRole('checkbox',{name:'Completed',exact:true}),touch);
  await closeTask(page,touch);
  await openTask(page,names.source,touch);
  await expect(page.getByTestId('saved-task-connections')).toContainText('Ready: your prerequisites are complete.');
  await scopedAxe(page,'[data-testid="task-relationships-editor"]',testInfo,'relationship-editor');
  await closeTask(page,touch);
  await page.reload();
  await expect(page.getByTestId('atomic-viewport')).toBeVisible();
  records=await saved(page);
  expect(records).toHaveLength(3);
  expect(records.find(task=>task.id===source.id)?.completed).toBe(false);
  expect(records.find(task=>task.id===prerequisite.id)?.completed).toBe(true);
  expect(errors).toEqual([]);
  await testInfo.attach('connected-actions-receipt',{body:JSON.stringify({savedTasks:records.length,kinds:['depends-on','supports','tradeoff'],cycleRejected:true,completionReopened:true,pageErrors:errors}),contentType:'application/json'});
}

export async function automaticNotesWorkflow(page:Page,origin:string,production:boolean,touch:boolean,testInfo:TestInfo) {
  const errors=await prepareAnonymousGuide(page,origin,production);
  const ideas = page.getByRole('button', { name: 'Ideas from your bubbles', exact: true });
  await ideas.focus();
  await ideas.press('Enter');
  const ideasPanel = page.getByRole('dialog', { name: 'Ideas from your bubbles', exact: true });
  await expect(ideasPanel).toBeVisible();
  await expect(ideasPanel.getByRole('button', { name: /^Review ideas from/ })).toHaveCount(3);
  await scopedAxe(page, '[role="dialog"]', testInfo, 'ideas-popover');
  await page.screenshot({path:testInfo.outputPath('ideas-popover.png')});
  await ideasPanel.press('Escape');
  await expect(ideasPanel).toHaveCount(0);
  await expect(ideas).toBeFocused();
  const initial=await saved(page);
  const source=initial.find(task=>task.content===names.source)!;
  const prerequisite=initial.find(task=>task.content===names.prerequisite)!;
  await openTask(page,names.source,touch);
  await page.getByRole('textbox',{name:'Notes & small steps',exact:true}).fill('- [ ] Put one book away\n- Choose one small shelf');
  await addRelationship(page,prerequisite.id,'depends-on',touch);
  await page.getByRole('combobox',{name:'How this connects to Wellbeing',exact:true}).selectOption('tradeoff');
  await press(page.getByRole('button',{name:'Grow ideas from this bubble',exact:true}),touch);
  let grow=page.getByRole('dialog',{name:'Let a bubble grow',exact:true});
  await press(grow.locator('summary').filter({hasText:'Automatic steps · Off'}),touch);
  await press(grow.getByRole('button',{name:'Enable automatic notes steps',exact:true}),touch);
  await expect(grow.getByText('Waiting for this bubble’s prerequisites before creating another step.',{exact:true})).toBeVisible();
  await expect.poll(async()=>(await saved(page)).find(task=>task.id===source.id)?.metadata?.bubbleGarden?.proactive?.enabled).toBe(true);
  expect(await saved(page)).toHaveLength(3);
  const enrolledSource=(await saved(page)).find(task=>task.id===source.id)!;
  await grow.getByRole('button',{name:'Close',exact:true}).click();
  await openTask(page,names.prerequisite,touch);
  await press(page.getByRole('checkbox',{name:'Completed',exact:true}),touch);
  await closeTask(page,touch);
  await expect.poll(async()=>(await saved(page)).length).toBe(4);
  const child=(await saved(page)).find(task=>task.metadata?.bubbleGarden?.automatic)!;
  expect(child.content).toBe('Put one book away');
  expect(child.metadata?.canonicalTask?.domainLinks?.find(link=>link.domainId==='physical-health')?.effect).toBe('tradeoff');
  expect((await saved(page)).find(task=>task.id===source.id)).toEqual(enrolledSource);
  await page.reload();
  await expect(page.getByTestId('atomic-viewport')).toBeVisible();
  expect(await saved(page)).toHaveLength(4);
  await openTask(page,names.source,touch);
  await press(page.getByRole('button',{name:'Grow ideas from this bubble',exact:true}),touch);
  grow=page.getByRole('dialog',{name:'Let a bubble grow',exact:true});
  await expect(grow.getByRole('list',{name:'Steps grown from this bubble',exact:true}).getByRole('listitem')).toHaveCount(1);
  await press(grow.locator('summary').filter({hasText:'Automatic steps · On'}),touch);
  await scopedAxe(page,'[role="dialog"]',testInfo,'automatic-growth');
  await page.screenshot({path:testInfo.outputPath('automatic-step-history.png')});
  await press(grow.getByRole('button',{name:'Undo automatic step',exact:true}),touch);
  await expect.poll(async()=>(await saved(page)).length).toBe(3);
  await expect(grow.getByRole('button',{name:'Enable automatic notes steps',exact:true})).toBeVisible();
  await expect(grow.getByRole('textbox')).toHaveCount(1);
  await expect(grow.getByRole('textbox')).toHaveValue('Choose one small shelf');
  await grow.getByRole('button',{name:'Close',exact:true}).click();
  await page.reload();
  await expect(page.getByTestId('atomic-viewport')).toBeVisible();
  const remaining=await saved(page);
  expect(remaining).toHaveLength(3);
  expect(remaining.find(task=>task.id===source.id)?.metadata?.bubbleGarden?.proactive?.enabled).toBe(false);
  expect(remaining.find(task=>task.id===source.id)?.metadata?.bubbleGarden?.review?.dismissedSproutKeys).toContain(child.metadata?.bubbleGarden?.sproutKey);
  expect(errors).toEqual([]);
  await testInfo.attach('automatic-notes-receipt',{body:JSON.stringify({oneAutomaticChild:true,preservedSourceDuringCreation:true,dependencyPaused:true,undoPausedAndPersisted:true,pageErrors:errors}),contentType:'application/json'});
}
