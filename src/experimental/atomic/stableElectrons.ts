/**
 * Stable Electron Orbital System
 * Maintains consistent electron positions regardless of viewport changes
 */

import { CoordinateSystem, WorldPoint } from './coordinateSystem';

export interface StableElectron {
  id: string;
  moleculeId: string;
  shell: number;
  baseAngle: number; // Fixed orbital position
  phase: number; // Animation phase
  content: string;
  type: string;
  originalBubble?: any;
}

export interface StableMolecule {
  id: string;
  worldPosition: WorldPoint; // Position in world space
  nucleus: {
    protons: number;
    neutrons: number;
    domain: string;
  };
  electrons: StableElectron[];
  bonds: string[];
  pulseActive: boolean;
  pulseType: 'shell' | 'bond' | null;
  selected: boolean;
}

const SHELL_RADII = [60, 100, 140]; // Base shell radii in world units

/**
 * Calculate stable electron screen position
 */
export function calculateElectronScreenPosition(
  electron: StableElectron,
  molecule: StableMolecule,
  coordinateSystem: CoordinateSystem,
  motionEnabled: boolean
): { x: number; y: number; angle: number } {
  // Calculate current angle (base + animation phase)
  const currentAngle = electron.baseAngle + (motionEnabled ? electron.phase : 0);
  
  // Get shell radius
  const shellRadius = SHELL_RADII[electron.shell] || SHELL_RADII[2];
  
  // Calculate world position
  const electronWorldPos = coordinateSystem.calculateElectronWorldPosition(
    molecule.worldPosition,
    electron.shell,
    currentAngle,
    shellRadius
  );
  
  // Convert to screen coordinates
  const screenPos = coordinateSystem.worldToScreen(electronWorldPos);
  
  return {
    x: screenPos.x,
    y: screenPos.y,
    angle: currentAngle
  };
}

/**
 * Determine which shell an electron should be in based on distance from molecule center
 */
export function determineShellFromDistance(
  distance: number,
  tolerance = 20
): number | null {
  for (let i = 0; i < SHELL_RADII.length; i++) {
    if (distance <= SHELL_RADII[i] + tolerance) {
      return i;
    }
  }
  return null;
}

/**
 * Calculate orbital angle for electron based on screen position
 */
export function calculateOrbitalAngle(
  electronScreenPos: { x: number; y: number },
  moleculeScreenPos: { x: number; y: number }
): number {
  const dx = electronScreenPos.x - moleculeScreenPos.x;
  const dy = electronScreenPos.y - moleculeScreenPos.y;
  return Math.atan2(dy, dx);
}

/**
 * Update electron animation phases
 */
export function updateElectronPhases(
  electrons: StableElectron[],
  deltaTime: number = 0.02
): StableElectron[] {
  return electrons.map(electron => ({
    ...electron,
    phase: electron.phase + deltaTime
  }));
}

/**
 * Distribute electrons evenly in their shells
 */
export function redistributeElectronsInShell(
  electrons: StableElectron[],
  shell: number
): StableElectron[] {
  const shellElectrons = electrons.filter(e => e.shell === shell);
  const otherElectrons = electrons.filter(e => e.shell !== shell);
  
  const redistributed = shellElectrons.map((electron, index) => ({
    ...electron,
    baseAngle: (index / shellElectrons.length) * 2 * Math.PI
  }));
  
  return [...otherElectrons, ...redistributed];
}