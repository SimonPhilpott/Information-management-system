import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { 
  ChevronLeft, 
  ChevronRight, 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  ExternalLink, 
  X,
  RotateCcw,
  Loader2,
  AlertCircle
} from 'lucide-react';

// Use the dynamic version from the library to ensure perfect worker matching
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
console.log(`[PDFWorkspace] Initializing with PDF.js version: ${pdfjs.version}`);

/**
 * PDFWorkspace provides a non-blocking, high-fidelity research pane.
 * It uses react-pdf for robust rendering and text selection.
 */
export default function PDFWorkspace({ driveFileId, initialPage, filename, highlightText, onClose }) {
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(initialPage || 1);
  const [scale, setScale] = useState(1.0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const containerRef = useRef(null);
  
  const pdfFile = useMemo(() => ({
    url: `/api/pdf/${encodeURIComponent(driveFileId)}`,
    withCredentials: true
  }), [driveFileId]);

  // Sync with initialPage changes
  useEffect(() => {
    if (initialPage) setPageNumber(initialPage);
  }, [initialPage]);

  function onDocumentLoadSuccess({ numPages }) {
    setNumPages(numPages);
    setLoading(false);
    setError(null);
  }

  function onDocumentLoadError(err) {
    console.error('[PDFWorkspace] Load error:', err);
    setError(err.message || 'Failed to load PDF');
    setLoading(false);
  }

  const changePage = (offset) => {
    setPageNumber(prev => Math.max(1, Math.min(numPages, prev + offset)));
  };

  const handleZoom = (delta) => {
    setScale(prev => Math.max(0.5, Math.min(3.0, prev + delta)));
  };

  return (
    <div className="pdf-workspace-container" ref={containerRef}>
      <header className="pdf-workspace-header">
        <div className="pdf-workspace-info">
          <span className="pdf-workspace-filename" title={filename}>
            {filename || 'Document View'}
          </span>
        </div>

        <div className="pdf-workspace-controls">
          <div className="pdf-pagination">
            <button 
              className="pdf-nav-btn" 
              onClick={() => changePage(-1)} 
              disabled={pageNumber <= 1}
            >
              <ChevronLeft size={16} />
            </button>
            <span className="pdf-page-indicator">
              {pageNumber} / {numPages || '--'}
            </span>
            <button 
              className="pdf-nav-btn" 
              onClick={() => changePage(1)} 
              disabled={pageNumber >= numPages}
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="pdf-zoom-controls">
            <button className="pdf-nav-btn" onClick={() => handleZoom(-0.2)}>
              <ZoomOut size={16} />
            </button>
            <span className="pdf-zoom-percent">{Math.round(scale * 100)}%</span>
            <button className="pdf-nav-btn" onClick={() => handleZoom(0.2)}>
              <ZoomIn size={16} />
            </button>
          </div>

          <div className="pdf-workspace-actions">
            <button 
              className="pdf-nav-btn" 
              title="Open in Google Drive"
              onClick={() => window.open(`https://drive.google.com/file/d/${driveFileId}/view`, '_blank')}
            >
              <ExternalLink size={16} />
            </button>
            <button 
              className="pdf-nav-btn close-btn" 
              title="Close Research Pane"
              onClick={onClose}
            >
              <X size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="pdf-workspace-body">
        {error ? (
          <div className="pdf-error-state">
            <AlertCircle size={48} className="error-icon" />
            <h3>Failed to render document</h3>
            <p>{error}</p>
            <button className="retry-btn" onClick={() => window.location.reload()}>
              <RotateCcw size={16} />
              Reload Application
            </button>
          </div>
        ) : (
          <div className="pdf-render-area">
            <Document
              file={pdfFile}
              onLoadSuccess={(doc) => {
                console.log('[PDFWorkspace] Document loaded successfully, pages:', doc.numPages);
                onDocumentLoadSuccess(doc);
              }}
              onLoadError={(err) => {
                console.error('[PDFWorkspace] Document load error:', err);
                onDocumentLoadError(err);
              }}
              loading={
                <div className="pdf-loading-spinner">
                  <Loader2 className="animate-spin" size={32} />
                  <p>Initializing sharp rendering...</p>
                </div>
              }
            >
              <Page 
                pageNumber={pageNumber} 
                scale={scale}
                renderTextLayer={true}
                renderAnnotationLayer={false}
                className="pdf-page-canvas"
                onRenderSuccess={() => console.log('[PDFWorkspace] Page rendered successfully')}
                onRenderError={(err) => console.error('[PDFWorkspace] Page render error:', err)}
                loading={null}
              />
            </Document>
          </div>
        )}
      </main>

      <style dangerouslySetInnerHTML={{ __html: `
        .pdf-workspace-container {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: var(--bg-primary);
          border-left: 1px solid var(--glass-border);
          box-shadow: -10px 0 30px rgba(0,0,0,0.2);
          z-index: 10;
        }

        .pdf-workspace-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          background: var(--bg-secondary);
          border-bottom: 1px solid var(--glass-border);
          gap: 16px;
        }

        .pdf-workspace-info {
          flex: 1;
          min-width: 0;
        }

        .pdf-workspace-filename {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          display: block;
        }

        .pdf-workspace-controls {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .pdf-pagination, .pdf-zoom-controls {
          display: flex;
          align-items: center;
          background: rgba(255,255,255,0.05);
          border: 1px solid var(--glass-border);
          border-radius: 8px;
          padding: 2px;
          gap: 4px;
        }

        .pdf-page-indicator, .pdf-zoom-percent {
          font-size: 12px;
          font-weight: 500;
          color: var(--text-secondary);
          min-width: 60px;
          text-align: center;
        }

        .pdf-nav-btn {
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 6px;
          border: none;
          background: transparent;
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.2s;
        }

        .pdf-nav-btn:hover:not(:disabled) {
          background: rgba(255,255,255,0.1);
          color: var(--text-primary);
        }

        .pdf-nav-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .pdf-nav-btn.close-btn:hover {
          background: var(--accent-rose);
          color: white;
        }

        .pdf-workspace-body {
          flex: 1;
          overflow: auto;
          background: #1a1a1a;
          position: relative;
          display: flex;
          justify-content: center;
        }

        .pdf-render-area {
          padding: 40px;
          display: flex;
          justify-content: center;
          min-height: 100%;
          width: 100%;
        }

        .pdf-page-canvas {
          box-shadow: 0 10px 40px rgba(0,0,0,0.5);
          background: white;
        }

        .pdf-loading-spinner {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          gap: 16px;
          color: var(--text-secondary);
        }

        .pdf-error-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px;
          text-align: center;
          height: 100%;
        }

        .error-icon {
          color: var(--accent-rose);
          margin-bottom: 16px;
        }

        .retry-btn {
          margin-top: 24px;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 20px;
          background: var(--accent-indigo);
          color: white;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
        }

        /* React-PDF specific layers */
        .react-pdf__Page__textContent {
          border: none !important;
        }
        
        .react-pdf__Page__annotations {
          display: none;
        }

        @media (max-width: 640px) {
          .pdf-workspace-header {
            padding: 8px 12px;
            gap: 8px;
          }
          .pdf-zoom-controls {
            display: none !important;
          }
          .pdf-pagination {
            gap: 2px;
          }
          .pdf-page-indicator {
            min-width: 40px;
            font-size: 10px;
          }
          .pdf-workspace-filename {
            font-size: 11px;
            max-width: 120px;
          }
        }
      `}} />
    </div>
  );
}
