import React from 'react'
import { motion } from 'framer-motion'
import type { ComponentInstance } from '../types/editor'

interface SelectionOverlayProps {
  instanceId: string
  instance: ComponentInstance
  onUpdate: (instanceId: string, updates: Partial<ComponentInstance>) => void
}

export function SelectionOverlay({
  instanceId,
  instance,
  onUpdate,
}: SelectionOverlayProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute pointer-events-none"
      style={{
        left: instance.position.x - 4,
        top: instance.position.y - 4,
        width: instance.size.width + 8,
        height: instance.size.height + 8,
      }}
    >
      {/* Selection border */}
      <div className="absolute inset-0 border-2 border-primary rounded" />
      
      {/* Resize handles */}
      <div 
        className="absolute -right-1 -bottom-1 w-3 h-3 bg-primary border border-background rounded-sm cursor-se-resize pointer-events-auto"
        onMouseDown={(e) => {
          e.preventDefault()
          const startX = e.clientX
          const startY = e.clientY
          const startWidth = instance.size.width
          const startHeight = instance.size.height

          const handleMouseMove = (e: MouseEvent) => {
            const deltaX = e.clientX - startX
            const deltaY = e.clientY - startY
            
            onUpdate(instanceId, {
              size: {
                width: Math.max(50, startWidth + deltaX),
                height: Math.max(30, startHeight + deltaY)
              }
            })
          }

          const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('mouseup', handleMouseUp)
          }

          document.addEventListener('mousemove', handleMouseMove)
          document.addEventListener('mouseup', handleMouseUp)
        }}
      />
    </motion.div>
  )
}