import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ExternalLink, X, RotateCcw } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export default function PDFViewerModal({ driveFileId, initialPage, filename, highlightText, onClose }) {
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(initialPage || 1);
  const [scale, setScale] = useState(1.0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const canvasRef = useRef(null);
  const bodyRef = useRef(null);

  // Auto-fit to width
  const fitToWidth = useCallback(async (doc, pageNum) => {
    if (!doc || !bodyRef.current) return;
    try {
      const page = await doc.getPage(pageNum || currentPage);
      const viewport = page.getViewport({ scale: 1.0 });
      const containerWidth = bodyRef.current.clientWidth - 40; // 20px padding on each side
      const newScale = containerWidth / viewport.width;
      // Cap scale between 0.5 and 2.0 for best experience
      setScale(Math.max(0.5, Math.min(newScale, 2.0)));
    } catch (err) {
      console.warn('[PDFViewer] Auto-fit failed:', err);
    }
  }, [currentPage]);

  // Load PDF document
  const loadPdf = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      console.log(`[PDFViewer] Loading document: ${driveFileId}...`);
      const loadingTask = pdfjsLib.getDocument({
        url: `/api/pdf/${encodeURIComponent(driveFileId)}`,
        withCredentials: true
      });
      const pdf = await loadingTask.promise;

      setPdfDoc(pdf);
      setNumPages(pdf.numPages);
      const startPage = Math.min(initialPage || 1, pdf.numPages);
      setCurrentPage(startPage);
      setLoading(false);
      
      // Trigger initial fit
      setTimeout(() => fitToWidth(pdf, startPage), 100);
      
      console.log(`[PDFViewer] Document loaded. Total pages: ${pdf.numPages}`);
    } catch (err) {
      console.error('[PDFViewer] Failed to load PDF:', err);
      setError('Failed to load PDF. The file may be too large or unavailable.');
      setLoading(false);
    }
  }, [driveFileId, initialPage, fitToWidth]);

  useEffect(() => {
    loadPdf();
  }, [loadPdf]);

  // Handle window resize for auto-fit
  useEffect(() => {
    const handleResize = () => {
      if (pdfDoc) fitToWidth(pdfDoc);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [pdfDoc, fitToWidth]);

  // Update page if initialPage prop changes
  useEffect(() => {
    if (initialPage) {
      setCurrentPage(initialPage);
    }
  }, [initialPage]);

  // Render current page
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    const renderPage = async () => {
      try {
        console.log(`[PDFViewer] Rendering page ${currentPage} (HiDPI)...`);
        const page = await pdfDoc.getPage(currentPage);
        
        // HiDPI Support: Calculate the scale factor based on screen density
        const pixelRatio = window.devicePixelRatio || 1;
        const baseViewport = page.getViewport({ scale });
        const viewport = page.getViewport({ scale: scale * pixelRatio });
        
        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext('2d', { alpha: false }); // Better performance

        // Set internal resolution higher for sharpness
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        // Set display size to the intended scale
        canvas.style.width = `${baseViewport.width}px`;
        canvas.style.height = `${baseViewport.height}px`;

        // Clear canvas
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);

        const renderTask = page.render({
          canvasContext: context,
          viewport,
          intent: 'display',
          background: 'rgba(255,255,255,1)'
        });
        
        await renderTask.promise;

        // Highlight text with HiDPI correction
        if (highlightText) {
          const textContent = await page.getTextContent();
          const query = highlightText.toLowerCase();
          
          context.save();
          context.globalAlpha = 0.35;
          context.fillStyle = '#fde047';

          for (const item of textContent.items) {
            if (!item.str || item.str.trim().length < 3) continue;
            
            const itemText = item.str.toLowerCase();
            if (query.includes(itemText)) {
              // Transform coordinates using the HiDPI viewport
              const [a, b, c, d, e, f] = pdfjsLib.Util.transform(viewport.transform, item.transform);
              context.fillRect(e, f - item.height * (scale * pixelRatio), item.width * (scale * pixelRatio), item.height * (scale * pixelRatio));
            }
          }
          context.restore();
        }

        console.log(`[PDFViewer] Page ${currentPage} rendered at ${Math.round(scale * 100)}% (Effective: ${Math.round(scale * pixelRatio * 100)}%)`);
      } catch (err) {
        console.error('[PDFViewer] Failed to render page:', err);
      }
    };

    renderPage();
  }, [pdfDoc, currentPage, scale, highlightText]);

  const goToPage = useCallback((page) => {
    if (!numPages) return;
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
            <span className="hidden sm:inline">◄ Prev</span>
            <span className="sm:hidden">◄</span>
          </button>

          <div className="pdf-viewer-page-info">
            <span className="hidden sm:inline">Page</span>
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
            <span className="hidden sm:inline">of</span>
            <span className="sm:hidden">/</span>
            {numPages}
          </div>

          <button className="pdf-viewer-btn" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= numPages}>
            <span className="hidden sm:inline">Next ►</span>
            <span className="sm:hidden">►</span>
          </button>

          <div className="pdf-viewer-divider" />

          <button className="pdf-viewer-btn" onClick={() => setScale(s => Math.max(s - 0.25, 0.5))}>
            −
          </button>
          <span className="pdf-viewer-scale-text">
            {Math.round(scale * 100)}%
          </span>
          <button className="pdf-viewer-btn" onClick={() => setScale(s => Math.min(s + 0.25, 3))}>
            +
          </button>

          <div className="pdf-viewer-divider" />

          <button 
            className="pdf-viewer-btn" 
            title="Open in Google Drive"
            onClick={() => window.open(`https://drive.google.com/file/d/${driveFileId}/view#page=${currentPage}`, '_blank')}
          >
            <ExternalLink size={16} />
          </button>

          <button className="pdf-viewer-close" onClick={onClose} title="Close viewer">
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="pdf-viewer-body" ref={bodyRef}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '16px' }}>
            <div className="spinner" style={{ width: 48, height: 48 }}></div>
            <p style={{ color: 'var(--text-secondary)' }}>Loading PDF...</p>
          </div>
        ) : error ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '16px', padding: '20px', textAlign: 'center' }}>
            <p style={{ color: 'var(--accent-rose)', fontSize: '24px' }}>⚠️</p>
            <p style={{ color: 'var(--text-primary)', fontWeight: 'bold' }}>Could not load document</p>
            <p style={{ color: 'var(--text-secondary)', maxWidth: '300px' }}>{error}</p>
            <button 
              className="pdf-viewer-btn" 
              style={{ marginTop: '12px', background: 'var(--accent-indigo)', color: 'white', padding: '8px 24px' }}
              onClick={() => { loadPdf(); }}
            >
              <RotateCcw size={14} style={{ marginRight: '8px' }} />
              Retry Loading
            </button>
          </div>
        ) : (
          <div className="pdf-viewer-canvas-wrapper" style={{ background: '#333', padding: '20px', minHeight: '100%', display: 'flex', justifyContent: 'center' }}>
            <canvas ref={canvasRef} style={{ background: 'white', maxWidth: '100%' }} />
          </div>
        )}
      </div>
    </div>
  );
}
