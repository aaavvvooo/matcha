import { Component } from 'react';
import Btn from './ui/Btn';

// Catches render-time errors anywhere below it so a single broken component shows a
// recoverable screen instead of a blank page. Async errors (fetch, event handlers) must
// still be handled where they happen.
class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        role="alert"
        style={{
          minHeight: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          padding: 24,
          textAlign: 'center',
          background: 'var(--cream)',
          color: 'var(--ink)',
          fontFamily: 'var(--font-body)',
        }}
      >
        <h1 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 28, margin: 0 }}>
          Something went wrong
        </h1>
        <p style={{ color: 'var(--ink3)', margin: 0 }}>Please reload the page. If it keeps happening, try again later.</p>
        <Btn onClick={() => window.location.reload()}>Reload</Btn>
      </div>
    );
  }
}

export default ErrorBoundary;
