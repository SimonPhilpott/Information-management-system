import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Hook to track mouse position and calculate optimal positioning to stay on screen.
 */
export function useCursorFollow() {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [alignment, setAlignment] = useState('bottom-right');

  useEffect(() => {
    const handleMouseMove = (e) => {
      const { clientX: x, clientY: y } = e;
      const { innerWidth: width, innerHeight: height } = window;

      // Determine alignment based on cursor position relative to screen edges
      const vertical = y > height / 2 ? 'top' : 'bottom';
      const horizontal = x > width / 2 ? 'left' : 'right';
      
      setPosition({ x, y });
      setAlignment(`${vertical}-${horizontal}`);
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return { position, alignment };
}

/**
 * CursorTooltip: High-fidelity floating text block that follows the cursor.
 */
export const CursorTooltip = React.forwardRef(({ text, content, isVisible }, ref) => {
  const { position } = useCursorFollow();
  const internalRef = useRef(null);
  const boxRef = ref || internalRef;
  const [coords, setCoords] = useState({ x: 0, y: 0, opacity: 0 });

  useEffect(() => {
    if (!isVisible || !boxRef.current) return;

    const box = boxRef.current.getBoundingClientRect();
    const offset = 12; 
    const { innerWidth: width, innerHeight: height } = window;

    let targetX = position.x + offset;
    let targetY = position.y + offset;

    if (targetX + box.width > width - 20) {
      targetX = position.x - box.width - offset;
    }

    if (targetX < 10) {
      targetX = position.x + offset;
    }

    if (targetY + box.height > height - 20) {
      targetY = position.y - box.height - offset;
    }

    targetX = Math.max(10, Math.min(width - box.width - 10, targetX));
    targetY = Math.max(10, Math.min(height - box.height - 10, targetY));

    setCoords({ x: targetX, y: targetY, opacity: 1 });
  }, [position, isVisible, boxRef]);

  if (!isVisible) return null;

  const portalContent = (
    <motion.div
      key="cursor-tooltip"
      ref={boxRef}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: coords.opacity, scale: 1 }}
      transition={{ duration: 0.1, ease: 'easeOut' }}
      style={{
        position: 'fixed',
        left: coords.x,
        top: coords.y,
        zIndex: 2147483647,
        pointerEvents: 'none'
      }}
    >
      <div style={{
        padding: '10px 14px',
        background: 'var(--bg-secondary)',
        backdropFilter: 'blur(30px)',
        border: '1px solid var(--glass-border)',
        borderRadius: 'var(--radius-md)',
        color: 'var(--text-primary)',
        fontSize: '11px',
        fontWeight: 600,
        boxShadow: 'var(--shadow-lg)',
        maxWidth: '480px',
        lineHeight: 1.5,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word'
      }}>
        {content || text}
      </div>
    </motion.div>
  );

  return createPortal(portalContent, document.body);
});

CursorTooltip.displayName = 'CursorTooltip';

/**
 * CursorPopover: Advanced hover window supporting rich content and dynamic dashboards.
 */
export const CursorPopover = React.forwardRef(({ isVisible, children, title }, ref) => {
  const { position, alignment } = useCursorFollow();
  const internalRef = useRef(null);
  const boxRef = ref || internalRef;

  const getStyle = () => {
    const offset = 12;
    const [v, h] = alignment.split('-');
    
    return {
      position: 'fixed',
      left: position.x,
      top: position.y,
      zIndex: 2147483647, // Max z-index for portal
      pointerEvents: 'none',
      transform: `translate(${h === 'left' ? `calc(-100% - ${offset}px)` : `${offset}px`}, ${v === 'top' ? `calc(-100% - ${offset}px)` : `${offset}px`})`
    };
  };

  if (!isVisible) return null;

  const portalContent = (
    <motion.div
      key="cursor-popover"
      ref={boxRef}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      style={getStyle()}
    >
      <div style={{
        width: '480px',
        background: 'var(--bg-secondary)',
        backdropFilter: 'blur(40px)',
        border: '1px solid var(--glass-border)',
        borderRadius: 'var(--radius-xl)',
        boxShadow: 'var(--shadow-xl)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {title && (
          <header style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--glass-border)',
            background: 'rgba(255, 255, 255, 0.02)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <div style={{ width: '4px', height: '12px', background: 'var(--accent-indigo)', borderRadius: '2px' }} />
            <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)' }}>
              {title}
            </span>
          </header>
        )}
        <div style={{ padding: '16px' }}>
          {children}
        </div>
        <footer style={{
          padding: '8px 16px',
          background: 'rgba(0,0,0,0.1)',
          fontSize: '9px',
          color: 'var(--text-muted)',
          textAlign: 'right',
          borderTop: '1px solid var(--glass-border)'
        }}>
          System Intelligence Hover Protocol v1.0
        </footer>
      </div>
    </motion.div>
  );

  return createPortal(portalContent, document.body);
});

CursorPopover.displayName = 'CursorPopover';

/**
 * Tooltip: Simple wrapper to add premium cursor-following hover text to any element.
 */
export const Tooltip = React.forwardRef(({ children, text, content, delay = 0 }, ref) => {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef(null);

  const handleEnter = () => {
    if (delay > 0) {
      timeoutRef.current = setTimeout(() => setIsVisible(true), delay);
    } else {
      setIsVisible(true);
    }
  };

  const handleLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsVisible(false);
  };

  if (!text && !content) return children;

  return (
    <span 
      ref={ref}
      className="tooltip-trigger-wrapper"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      style={{ display: 'inline-block', width: '100%' }}
    >
      {children}
      <CursorTooltip text={text} content={content} isVisible={isVisible} />
    </span>
  );
});

Tooltip.displayName = 'Tooltip';
