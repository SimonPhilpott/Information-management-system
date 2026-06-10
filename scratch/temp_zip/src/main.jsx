import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { ThemeProvider } from './ThemeContext.jsx'
import './index.css'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', color: '#ff4d4d', background: '#0a0505', border: '1px solid #ff4d4d', borderRadius: '8px', margin: '40px', fontFamily: 'monospace' }}>
          <h2 style={{ fontSize: '24px', marginBottom: '16px' }}>Information Management System Startup Exception</h2>
          <p style={{ color: '#ccc', marginBottom: '24px' }}>A critical error occurred while initializing the application component tree:</p>
          <pre style={{ whiteSpace: 'pre-wrap', background: '#1a0d0d', padding: '16px', borderRadius: '4px', border: '1px solid #331a1a', overflowX: 'auto', fontSize: '14px', lineHeight: '1.5' }}>
            {this.state.error?.stack || this.state.error?.toString()}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
