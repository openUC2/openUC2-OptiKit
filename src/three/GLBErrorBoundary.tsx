import React from 'react';
import type { ReactNode } from 'react';

interface Props {
  fallback: ReactNode;
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Error boundary that catches GLB loading failures (thrown by useGLTF / Suspense).
 * Renders `fallback` whenever a child throws during render.
 */
export class GLBErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(err: Error) {
    console.warn('GLB load failed:', err.message);
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}
