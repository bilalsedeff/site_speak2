import React from 'react'
import { motion } from 'framer-motion'
import { useDrag } from 'react-dnd'

import type { ComponentInstance } from '../types/editor'

interface ComponentRendererProps {
  instance: ComponentInstance
  isSelected: boolean
  isPreviewMode: boolean
  onUpdate: (updates: Partial<ComponentInstance>) => void
}

export function ComponentRenderer({
  instance,
  isSelected,
  isPreviewMode,
  onUpdate,
}: ComponentRendererProps) {
  const [{ isDragging }, drag] = useDrag({
    type: 'instance',
    item: { type: 'instance', instanceId: instance.id, metadata: instance.metadata },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
    canDrag: !isPreviewMode,
  })

  // Render the actual component based on componentName
  const renderComponent = () => {
    const { componentName, props } = instance

    switch (componentName) {
      case 'Button':
        return (
          <button
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md touch-target"
            {...props}
          >
            {props['children'] || 'Button'}
          </button>
        )
      
      case 'Text':
        return (
          <div className="text-foreground max-reading-width" {...props}>
            {props['text'] || 'Sample text'}
          </div>
        )
      
      case 'Image':
        return (
          <img
            src={props['src'] || 'https://via.placeholder.com/300x200'}
            alt={props['alt'] || 'Sample image'}
            className="max-w-full h-auto rounded-lg"
            {...props}
          />
        )
      
      case 'Card':
        return (
          <div className="bg-card border border-border rounded-lg p-6 shadow-sm" {...props}>
            <h3 className="font-semibold mb-2 max-heading-width">
              {props['title'] || 'Card Title'}
            </h3>
            <p className="text-muted-foreground max-reading-width">
              {props['description'] || 'Card description text'}
            </p>
          </div>
        )
      
      case 'Container':
        return (
          <div 
            className="bg-background border-2 border-dashed border-muted-foreground/25 rounded-lg p-4 min-h-[100px] flex items-center justify-center"
            {...props}
          >
            <span className="text-muted-foreground text-sm">
              Drop components here
            </span>
          </div>
        )
      
      default:
        return (
          <div className="bg-muted border border-border rounded p-4 text-center">
            <span className="text-sm text-muted-foreground">
              Unknown component: {componentName}
            </span>
          </div>
        )
    }
  }

  return (
    <motion.div
      ref={drag}
      className={`
        relative cursor-pointer
        ${isSelected ? 'ring-2 ring-primary ring-offset-2' : ''}
        ${isDragging ? 'opacity-50' : ''}
        ${!isPreviewMode ? 'hover:ring-1 hover:ring-muted-foreground/50' : ''}
      `}
      style={{
        opacity: isDragging ? 0.5 : 1,
      }}
      animate={isSelected ? { scale: 1.02 } : { scale: 1 }}
      transition={{ duration: 0.15 }}
    >
      {renderComponent()}
      
      {/* Selection indicators */}
      {isSelected && !isPreviewMode && (
        <>
          {/* Component label */}
          <div className="absolute -top-6 left-0 bg-primary text-primary-foreground text-xs px-2 py-1 rounded text-nowrap">
            {instance.componentName}
          </div>
          
          {/* Resize handles */}
          <div className="absolute -inset-2 border-2 border-primary rounded pointer-events-none">
            <div className="absolute -right-2 -bottom-2 w-4 h-4 bg-primary rounded-sm cursor-se-resize pointer-events-auto" />
          </div>
        </>
      )}
    </motion.div>
  )
}