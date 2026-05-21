import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, background: 'red', color: 'white', zIndex: 999999, padding: '20px', whiteSpace: 'pre-wrap' }}>
          <h2>Something went wrong in AdminPortal.</h2>
          <details style={{ whiteSpace: 'pre-wrap' }}>
            {this.state.error && this.state.error.toString()}
            <br />
            {this.state.error && this.state.error.stack}
          </details>
          <button onClick={() => this.setState({ hasError: false })}>Dismiss</button>
        </div>
      );
    }

    return this.props.children;
  }
}
