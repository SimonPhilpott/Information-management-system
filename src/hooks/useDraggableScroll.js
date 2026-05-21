import { useState, useRef } from 'react';

/**
 * Custom hook to enable mouse-draggable horizontal scrolling for containers.
 * Also supports touch scrolling via native overflow-x: auto.
 * 
 * @returns {Object} { scrollRef, onMouseDown, onMouseLeave, onMouseUp, onMouseMove, isDragging }
 */
export function useDraggableScroll() {
  const scrollRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hasDragged, setHasDragged] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const onMouseDown = (e) => {
    if (!scrollRef.current) return;
    setHasDragged(false);
    setStartX(e.pageX - scrollRef.current.offsetLeft);
    setScrollLeft(scrollRef.current.scrollLeft);
  };

  const onMouseLeave = () => {
    setIsDragging(false);
  };

  const onMouseUp = () => {
    // Small delay to ensure onClick handlers can check isDragging
    setTimeout(() => {
      setIsDragging(false);
    }, 50);
  };

  const onMouseMove = (e) => {
    if (!scrollRef.current || e.buttons !== 1) return;
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX) * 2; // Scroll speed multiplier
    
    // Only consider it a drag if we've moved more than 5px
    if (Math.abs(x - startX) > 5) {
      if (!isDragging) setIsDragging(true);
      setHasDragged(true);
      e.preventDefault();
      scrollRef.current.scrollLeft = scrollLeft - walk;
    }
  };

  return {
    scrollRef,
    isDragging,
    hasDragged,
    handlers: {
      onMouseDown,
      onMouseLeave,
      onMouseUp,
      onMouseMove
    }
  };
}
