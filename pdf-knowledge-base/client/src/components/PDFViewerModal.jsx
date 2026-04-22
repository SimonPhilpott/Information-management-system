import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export default function PDFViewerModal({ driveFileId, initialPage, filename, onClose }) {
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(initialPage || 1);
  const [scale, setScale] = useState(1.5);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const canvasRef = useRef(null);
  const pdfDocRef = useRef(null);

  // Load PDF document
  useEffect(() => {
    let cancelled = false;

    const loadPdf = async () => {
      try {
        setLoading(true);
        setError(null);

        const loadingTask = pdfjsLib.getDocument({
          url: `/api/pdf/${driveFileId}`,
          withCredentials: true
        });
        const pdf = await loadingTask.promise;

        if (cancelled) return;

        pdfDocRef.current = pdf;
        setNumPages(pdf.numPages);
        setCurrentPage(Math.min(initialPage || 1, pdf.numPages));
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load PDF:', err);
          setError('Failed to load PDF. Please try again.');
          setLoading(false);
        }
      }
    };

    loadPdf();
    return () => { cancelled = true; };
  }, [driveFileId, initialPage]);

  // Render current page
  useEffect(() => {
    if (!pdfDocRef.current || !canvasRef.current) return;

    const renderPage = async () => {
      try {
        const page = await pdfDocRef.current.getPage(currentPage);
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({
          canvasContext: context,
          viewport
        }).promise;
      } catch (err) {
        console.error('Failed to render page:', err);
      }
    };

    renderPage();
  }, [currentPage, scale]);

  const goToPage = useCallback((page) => {
    const p = Math.max(1, Math.min(page, numPages));
    setCurrentPage(p);
  }, [numPages]);

  const handlePageInput = (e) => {
    if (e.key === 'Enter') {
      const page = parseInt(e.target.value);
      if (!isNaN(page)) goToPage(page);
    }
  };

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') goToPage(currentPage - 1);
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goToPage(currentPage + 1);
      else if (e.key === '+' || e.key === '=') setScale(s => Math.min(s + 0.25, 3));
      else if (e.key === '-') setScale(s => Math.max(s - 0.25, 0.5));
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [currentPage, goToPage, onClose]);

  return (
    <div className="pdf-viewer-overlay">
      <div className="pdf-viewer-header">
        <div className="pdf-viewer-title">
          📄 {filename || 'Document'}
        </div>

        <div className="pdf-viewer-controls">
          <button className="pdf-viewer-btn" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1}>
            ◄ Prev
          </button>

          <div className="pdf-viewer-page-info">
            Page
            <input
              type="number"
              className="pdf-viewer-page-input"
              value={currentPage}
              min={1}
              max={numPages}
              onChange={(e) => setCurrentPage(parseInt(e.target.value) || 1)}
              onKeyDown={handlePageInput}
              onBlur={(e) => goToPage(parseInt(e.target.value) || 1)}
            />
            of {numPages}
          </div>

          <button className="pdf-viewer-btn" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= numPages}>
            Next ►
          </button>

          <div style={{ width: '1px', height: '20px', background: 'var(--glass-border)', margin: '0 4px' }} />

          <button className="pdf-viewer-btn" onClick={() => setScale(s => Math.max(s - 0.25, 0.5))}>
            −
          </button>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', minWidth: '40px', textAlign: 'center' }}>
            {Math.round(scale * 100)}%
          </span>
          <button className="pdf-viewer-btn" onClick={() => setScale(s => Math.min(s + 0.25, 3))}>
            +
          </button>

          <div style={{ width: '1px', height: '20px', background: 'var(--glass-border)', margin: '0 4px' }} />

          <button className="pdf-viewer-close" onClick={onClose}>
            ✕
          </button>
        </div>
      </div>

      <div className="pdf-viewer-body">
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '16px' }}>
            <div className="spinner" style={{ width: 48, height: 48 }}></div>
            <p style={{ color: 'var(--text-secondary)' }}>Loading PDF...</p>
          </div>
        ) : error ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '16px' }}>
            <p style={{ color: 'var(--accent-rose)', fontSize: '18px' }}>❌</p>
            <p style={{ color: 'var(--text-secondary)' }}>{error}</p>
          </div>
        ) : (
          <div className="pdf-viewer-canvas-wrapper">
            <canvas ref={canvasRef} />
          </div>
        )}
      </div>
    </div>
  );
}
