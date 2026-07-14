import React, { useEffect, useRef, useState } from 'react';

// Horizontal-scroll container with a proxy scrollbar that sticks to the bottom
// of the viewport. Wide boards are taller than the screen, so their native
// horizontal scrollbar sits out of sight at the bottom of the page — this
// keeps one always visible and two-way synced with the real container.
export default function StickyHScroll({ className = '', children }) {
  const contentRef = useRef(null);
  const barRef = useRef(null);
  const [scrollW, setScrollW] = useState(0);
  const [clientW, setClientW] = useState(0);

  // Re-measure on every render (cheap) + on resize, guarding state updates so
  // it can't loop.
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const measure = () => {
      setScrollW((p) => (p === el.scrollWidth ? p : el.scrollWidth));
      setClientW((p) => (p === el.clientWidth ? p : el.clientWidth));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    for (const child of el.children) ro.observe(child);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  });

  const syncFromContent = () => {
    if (barRef.current && contentRef.current) barRef.current.scrollLeft = contentRef.current.scrollLeft;
  };
  const syncFromBar = () => {
    if (barRef.current && contentRef.current) contentRef.current.scrollLeft = barRef.current.scrollLeft;
  };

  const needBar = scrollW > clientW + 1;

  return (
    <>
      <div className={className} ref={contentRef} onScroll={syncFromContent}>
        {children}
      </div>
      <div className={`hscroll-bar${needBar ? '' : ' off'}`} ref={barRef} onScroll={syncFromBar} aria-hidden="true">
        <div style={{ width: scrollW, height: 1 }} />
      </div>
    </>
  );
}
