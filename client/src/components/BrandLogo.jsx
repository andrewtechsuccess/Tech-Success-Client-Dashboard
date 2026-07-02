import React from 'react';

// Tech Success brand mark — a green shield with a check. Inlined as SVG so it
// inherits crisp rendering at any size and needs no asset pipeline.
export default function BrandLogo({ size = 24, className = '' }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 56 56"
      width={size}
      height={size}
      fill="none"
      role="img"
      aria-label="Tech Success logo"
    >
      <g
        transform="translate(4 4)"
        stroke="#06964D"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        <path d="M24 2 L46 10 L46 26 C46 36 36 44 24 48 C12 44 2 36 2 26 L2 10 Z" />
        <path d="M14 24 L22 32 L36 16" strokeWidth="4" />
      </g>
    </svg>
  );
}
