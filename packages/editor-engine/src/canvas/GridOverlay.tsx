import React from 'react'

interface GridOverlayProps {
  zoomLevel: number
  gridSize?: number
}

export function GridOverlay({ zoomLevel, gridSize = 20 }: GridOverlayProps) {
  const effectiveGridSize = gridSize * zoomLevel

  return (
    <div
      className="absolute inset-0 pointer-events-none opacity-30"
      style={{
        backgroundImage: `
          linear-gradient(to right, hsl(var(--border)) 1px, transparent 1px),
          linear-gradient(to bottom, hsl(var(--border)) 1px, transparent 1px)
        `,
        backgroundSize: `${effectiveGridSize}px ${effectiveGridSize}px`,
      }}
    />
  )
}