import React from 'react';
import type { ReactNode } from 'react';

interface Props {
  /** Static fallback, or a render function that receives the failure reason. */
  fallback: ReactNode | ((reason: string) => ReactNode);
  children: ReactNode;
}

interface State {
  hasError: boolean;
  /** WP-146: WHY it failed. A bare "mesh failed" label sent round 24
   * hunting a corrupt GLB for a file that parses cleanly (1044 meshes) and
   * serves 200 — the reason never left the console. */
  reason: string;
}

/**
 * Error boundary that catches GLB loading failures (thrown by useGLTF / Suspense).
 * Renders `fallback` whenever a child throws during render.
 */
export class GLBErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, reason: '' };

  static getDerivedStateFromError(err: Error): State {
    return { hasError: true, reason: err.message || String(err) };
  }

  componentDidCatch(err: Error) {
    console.warn('GLB load failed:', err.message);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    const { fallback } = this.props;
    return typeof fallback === 'function' ? fallback(this.state.reason) : fallback;
  }
}
