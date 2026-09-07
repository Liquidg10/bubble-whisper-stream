import { Component, type ErrorInfo, type ReactNode } from 'react';

/** A failed optional graphics chunk must never take the task editor down. */
export class AtomicSpatialBoundary extends Component<{ children: ReactNode; onUnavailable: (reason: string) => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    this.props.onUnavailable('3D could not load. Flat view is ready, and your saved layout is safe.');
  }
  render() { return this.state.failed ? null : this.props.children; }
}
