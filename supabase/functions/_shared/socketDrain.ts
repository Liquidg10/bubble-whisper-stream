/** A close-only lifecycle: errors and timeouts never count as a drained socket. */
export interface DrainSocket {
  readonly readyState: number;
  addEventListener(type: 'close', listener: () => void, options?: { once: boolean }): void;
}

export function createSocketDrain() {
  const sockets = new Set<DrainSocket>();
  let sealed = false;
  let complete!: () => void;
  const completion = new Promise<void>((resolve) => { complete = resolve; });
  const check = () => { if (sealed && sockets.size === 0) complete(); };

  return {
    completion,
    get sealed() { return sealed; },
    track(socket: DrainSocket) {
      if (sealed) throw new Error('Cannot add work to a sealed socket drain');
      if (sockets.has(socket) || socket.readyState === 3) return;
      sockets.add(socket);
      socket.addEventListener('close', () => {
        sockets.delete(socket);
        check();
      }, { once: true });
    },
    seal() {
      sealed = true;
      check();
    },
  };
}
