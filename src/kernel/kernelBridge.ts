/**
 * Tiny indirection so simulationStore can trigger the kernel loop without
 * importing it (kernelSim imports the store; a direct import would be a cycle).
 */

let trigger: (() => void) | null = null;

export function registerKernelTrigger(fn: (() => void) | null): void {
  trigger = fn;
}

export function triggerKernelPass(): void {
  trigger?.();
}
