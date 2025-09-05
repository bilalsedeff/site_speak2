import React, { useMemo, useCallback, useRef } from 'react'
import { DndProvider, useDrop } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import { motion, AnimatePresence } from 'framer-motion'

import { useEditorStore } from '../store/editorStore'
import { ComponentRenderer } from './ComponentRenderer'
import { SelectionOverlay } from './SelectionOverlay'
import { GridOverlay } from './GridOverlay'
import type { DragItem, ComponentInstance } from '../types/editor'

interface EditorCanvasProps {
  className?: string
  showGrid?: boolean
  onInstanceSelect?: (instanceId: string | null) => void
  onInstanceUpdate?: (instanceId: string, updates: Partial<ComponentInstance>) => void
}

export function EditorCanvas({
  className = '',
  showGrid = true,
  onInstanceSelect,
  onInstanceUpdate,
}: EditorCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const {
    instances,
    selectedInstanceId,
    zoomLevel,
    isPreviewMode,
    addInstance,
    updateInstance,
    selectInstance,
    removeInstance,
  } = useEditorStore()

  // Drop handler for canvas
  const [{ isOver, canDrop }, drop] = useDrop({
    accept: ['component', 'instance'],
    drop: (item: DragItem, monitor) => {
      if (!canvasRef.current) {return}

      const clientOffset = monitor.getClientOffset()
      if (!clientOffset) {return}

      const canvasRect = canvasRef.current.getBoundingClientRect()
      const position = {
        x: (clientOffset.x - canvasRect.left) / zoomLevel,
        y: (clientOffset.y - canvasRect.top) / zoomLevel,
      }

      if (item.type === 'component' && item.componentName) {
        // Create new instance from component
        const newInstance: ComponentInstance = {
          id: `${item.componentName}-${Date.now()}`,
          componentName: item.componentName,
          props: { ...item.metadata.defaultProps },
          position,
          size: { width: 200, height: 100 },
          metadata: item.metadata,
        }

        addInstance(newInstance)
        selectInstance(newInstance.id)
        onInstanceSelect?.(newInstance.id)
      } else if (item.type === 'instance' && item.instanceId) {
        // Move existing instance
        updateInstance(item.instanceId, { position })
        onInstanceUpdate?.(item.instanceId, { position })
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  })

  // Attach drop ref to canvas
  drop(canvasRef)

  // Handle canvas click (deselect)
  const handleCanvasClick = useCallback(
    (event: React.MouseEvent) => {
      if (event.target === event.currentTarget) {
        selectInstance(null)
        onInstanceSelect?.(null)
      }
    },
    [selectInstance, onInstanceSelect]
  )

  // Handle instance click
  const handleInstanceClick = useCallback(
    (instanceId: string, event: React.MouseEvent) => {
      event.stopPropagation()
      selectInstance(instanceId)
      onInstanceSelect?.(instanceId)
    },
    [selectInstance, onInstanceSelect]
  )

  // Handle instance update
  const handleInstanceUpdate = useCallback(
    (instanceId: string, updates: Partial<ComponentInstance>) => {
      updateInstance(instanceId, updates)
      onInstanceUpdate?.(instanceId, updates)
    },
    [updateInstance, onInstanceUpdate]
  )

  // Handle delete key
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Delete' && selectedInstanceId) {
        removeInstance(selectedInstanceId)
        selectInstance(null)
        onInstanceSelect?.(null)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [selectedInstanceId, removeInstance, selectInstance, onInstanceSelect])

  const canvasStyle = useMemo(
    () => ({
      transform: `scale(${zoomLevel})`,
      transformOrigin: 'top left',
    }),
    [zoomLevel]
  )

  return (
    <div className={`editor-canvas relative overflow-hidden ${className}`}>
      {/* Canvas container */}
      <div
        ref={canvasRef}
        className={`
          relative w-full h-full bg-white
          ${canDrop && isOver ? 'drop-zone active' : canDrop ? 'drop-zone' : ''}
          ${isPreviewMode ? 'pointer-events-none' : 'cursor-crosshair'}
        `}
        style={canvasStyle}
        onClick={handleCanvasClick}
      >
        {/* Grid overlay */}
        {showGrid && !isPreviewMode && (
          <GridOverlay zoomLevel={zoomLevel} />
        )}

        {/* Component instances */}
        <AnimatePresence>
          {instances.map((instance) => (
            <motion.div
              key={instance.id}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.2 }}
              className="absolute"
              style={{
                left: instance.position.x,
                top: instance.position.y,
                width: instance.size.width,
                height: instance.size.height,
              }}
              onClick={(e) => handleInstanceClick(instance.id, e)}
            >
              <ComponentRenderer
                instance={instance}
                isSelected={selectedInstanceId === instance.id}
                isPreviewMode={isPreviewMode}
                onUpdate={(updates) => handleInstanceUpdate(instance.id, updates)}
              />
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Selection overlay */}
        {selectedInstanceId && !isPreviewMode && (
          <SelectionOverlay
            instanceId={selectedInstanceId}
            instance={instances.find(i => i.id === selectedInstanceId)!}
            onUpdate={handleInstanceUpdate}
          />
        )}

        {/* Drop indicator */}
        {canDrop && isOver && (
          <div className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary rounded-lg flex items-center justify-center">
            <div className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium">
              Drop component here
            </div>
          </div>
        )}

        {/* Empty state */}
        {instances.length === 0 && !canDrop && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <div className="w-16 h-16 mx-auto mb-4 opacity-20">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/>
                </svg>
              </div>
              <h3 className="font-medium mb-1">Start Building</h3>
              <p className="text-sm max-reading-width">
                Drag components from the palette to start building your page
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Canvas controls */}
      {!isPreviewMode && (
        <div className="absolute top-4 left-4 flex items-center space-x-2">
          <div className="bg-card border border-border rounded-lg px-3 py-1 text-xs font-medium">
            {Math.round(zoomLevel * 100)}%
          </div>
          <div className="bg-card border border-border rounded-lg px-3 py-1 text-xs">
            {instances.length} components
          </div>
        </div>
      )}
    </div>
  )
}

// Wrap in DndProvider for convenience
export function EditorCanvasWithDnd(props: EditorCanvasProps) {
  return (
    <DndProvider backend={HTML5Backend}>
      <EditorCanvas {...props} />
    </DndProvider>
  )
}