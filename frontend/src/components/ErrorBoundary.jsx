import React from 'react';

/**
 * ErrorBoundary — React widget ağacındaki beklenmedik render hatalarını yakalar.
 * Hata oluştuğunda uygulama çökmez; kullanıcıya zarif bir fallback UI gösterir.
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Yakalandı:', error, errorInfo);
    this.setState({ errorInfo });
    // Opsiyonel: Sentry / loglama servisi çağrısı buraya yapılabilir
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '200px',
          padding: '32px',
          background: 'rgba(139,26,26,0.08)',
          border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: '16px',
          margin: '16px',
          gap: '12px',
        }}>
          <span style={{ fontSize: 32 }}>⚠️</span>
          <p style={{ color: '#ef4444', fontWeight: 700, margin: 0, fontSize: 15 }}>
            Bu bölümde bir hata oluştu
          </p>
          {this.props.showDetail && this.state.error && (
            <pre style={{
              color: '#fca5a5',
              fontSize: 11,
              background: 'rgba(0,0,0,0.3)',
              padding: '8px 12px',
              borderRadius: 8,
              maxWidth: '100%',
              overflow: 'auto',
            }}>
              {this.state.error.toString()}
            </pre>
          )}
          <button
            onClick={this.handleRetry}
            style={{
              padding: '8px 20px',
              background: 'rgba(239,68,68,0.15)',
              border: '1px solid rgba(239,68,68,0.4)',
              borderRadius: 8,
              color: '#ef4444',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            Yeniden Dene
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
