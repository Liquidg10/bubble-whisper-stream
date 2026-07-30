import { describe, expect, it } from 'vitest';
import {
  P20_BROWSER_GATE_FAILURE,
  productionPipelineService
} from '@/services/productionPipeline';

describe('production pipeline browser boundary', () => {
  it('fails closed without a CI gate receipt and leaves the plan untouched', async () => {
    const planName = `browser-boundary-${crypto.randomUUID()}`;
    const created = productionPipelineService.createDeploymentPlan(planName);

    expect(created.status).toBe('planning');
    expect(await productionPipelineService.startDeployment(planName)).toBe(false);
    expect(productionPipelineService.getDeploymentStatus(planName)).toMatchObject({
      currentStage: -1,
      startedAt: 0,
      status: 'planning'
    });
  });

  it('states the external receipt boundary explicitly', () => {
    expect(P20_BROWSER_GATE_FAILURE).toContain('CI gate receipt required');
    expect(P20_BROWSER_GATE_FAILURE).toContain('browser clients cannot execute');
  });
});
