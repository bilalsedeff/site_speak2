import { useState, useCallback } from 'react'
import { useParams } from 'wouter'
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import { EditorCanvasWithDnd, ComponentPalette, ContractPreview, useEditorStore } from '@sitespeak/editor-engine'

// Type definitions
interface ComponentUpdates {
  style?: Record<string, unknown>;
  content?: string;
  props?: Record<string, unknown>;
  position?: { x: number; y: number };
}
import { Button } from '@/components/ui/Button'
import { 
  Layers, 
  Settings, 
  Eye, 
  EyeOff, 
  Grid3X3, 
  ZoomIn, 
  ZoomOut, 
  Undo, 
  Redo,
  Play,
  FileText,
  Smartphone,
  Tablet,
  Monitor
} from 'lucide-react'

/**
 * Enhanced Editor Page following UI/UX guidelines:
 * - 3-column responsive layout
 * - Touch target compliance (44pt minimum)
 * - Contract preview integration
 * - Voice editing capabilities
 */
export function Editor() {
  const { siteId } = useParams()
  const [showContractPreview, setShowContractPreview] = useState(false)
  const [activeTab, setActiveTab] = useState<'components' | 'layers' | 'settings'>('components')
  
  const {
    isPreviewMode,
    showGrid,
    zoomLevel,
    selectedInstanceId,
    validationErrors,
    setPreviewMode,
    setShowGrid,
    setZoomLevel,
    undo,
    redo
  } = useEditorStore()

  const handleZoomIn = useCallback(() => {
    setZoomLevel(Math.min(zoomLevel + 0.1, 3))
  }, [zoomLevel, setZoomLevel])

  const handleZoomOut = useCallback(() => {
    setZoomLevel(Math.max(zoomLevel - 0.1, 0.1))
  }, [zoomLevel, setZoomLevel])

  const handleInstanceSelect = useCallback((instanceId: string | null) => {
    console.log('Selected instance:', instanceId)
  }, [])

  const handleInstanceUpdate = useCallback((instanceId: string, updates: ComponentUpdates) => {
    console.log('Updated instance:', instanceId, updates)
  }, [])

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="flex h-screen bg-background">
        {/* Left Panel - Component Palette */}
        <div className="w-80 bg-card border-r border-border flex flex-col">
          {/* Panel Header */}
          <div className="p-4 border-b border-border">
            <div className="flex items-center space-x-2 mb-4">
              <h2 className="font-semibold text-lg max-heading-width">
                Site Builder
              </h2>
              {siteId && (
                <span className="text-xs text-muted-foreground px-2 py-1 bg-muted rounded">
                  {siteId}
                </span>
              )}
            </div>
            
            {/* Tab Navigation */}
            <div className="flex space-x-1">
              {[
                { id: 'components' as const, label: 'Components', icon: Layers },
                { id: 'layers' as const, label: 'Layers', icon: Layers },
                { id: 'settings' as const, label: 'Settings', icon: Settings }
              ].map(({ id, label, icon: Icon }) => (
                <Button
                  key={id}
                  variant={activeTab === id ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setActiveTab(id)}
                  className="touch-target-ios" // 44pt minimum
                >
                  <Icon className="h-4 w-4 mr-2" aria-hidden="true" />
                  {label}
                </Button>
              ))}
            </div>
          </div>

          {/* Panel Content */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {activeTab === 'components' && (
              <div className="p-4">
                <ComponentPalette />
              </div>
            )}
            
            {activeTab === 'layers' && (
              <div className="p-4">
                <div className="empty-state">
                  <Layers className="empty-state-icon" />
                  <h3 className="empty-state-title">Layer Panel</h3>
                  <p className="empty-state-description">
                    Manage component hierarchy and visibility
                  </p>
                </div>
              </div>
            )}
            
            {activeTab === 'settings' && (
              <div className="p-4 space-y-4">
                <div className="form-group">
                  <label className="form-label">Grid Settings</label>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowGrid(!showGrid)}
                      className="touch-target"
                    >
                      <Grid3X3 className="h-4 w-4 mr-2" />
                      {showGrid ? 'Hide Grid' : 'Show Grid'}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Center - Canvas */}
        <div className="flex-1 flex flex-col">
          {/* Toolbar */}
          <div className="h-14 bg-card border-b border-border flex items-center justify-between px-4">
            {/* Left Controls */}
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={undo}
                className="touch-target"
                aria-label="Undo"
              >
                <Undo className="h-4 w-4" />
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={redo}
                className="touch-target"
                aria-label="Redo"
              >
                <Redo className="h-4 w-4" />
              </Button>
              
              <div className="w-px h-6 bg-border" />
              
              <Button
                variant="outline"
                size="sm"
                onClick={handleZoomOut}
                className="touch-target"
                aria-label="Zoom out"
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              
              <span className="text-sm font-medium min-w-[4rem] text-center">
                {Math.round(zoomLevel * 100)}%
              </span>
              
              <Button
                variant="outline"
                size="sm"
                onClick={handleZoomIn}
                className="touch-target"
                aria-label="Zoom in"
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>

            {/* Center - Device Toggle */}
            <div className="flex items-center space-x-1 bg-muted rounded-lg p-1">
              {[
                { icon: Monitor, label: 'Desktop', device: 'desktop' },
                { icon: Tablet, label: 'Tablet', device: 'tablet' },
                { icon: Smartphone, label: 'Mobile', device: 'mobile' }
              ].map(({ icon: Icon, label, device }) => (
                <Button
                  key={device}
                  variant="ghost"
                  size="sm"
                  className="touch-target-ios data-[state=active]:bg-background"
                  aria-label={`Switch to ${label} view`}
                >
                  <Icon className="h-4 w-4" />
                </Button>
              ))}
            </div>

            {/* Right Controls */}
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowContractPreview(!showContractPreview)}
                className="touch-target"
              >
                <FileText className="h-4 w-4 mr-2" />
                Contract
              </Button>
              
              <Button
                variant={isPreviewMode ? "default" : "outline"}
                size="sm"
                onClick={() => setPreviewMode(!isPreviewMode)}
                className="touch-target"
              >
                {isPreviewMode ? (
                  <>
                    <EyeOff className="h-4 w-4 mr-2" />
                    Exit Preview
                  </>
                ) : (
                  <>
                    <Eye className="h-4 w-4 mr-2" />
                    Preview
                  </>
                )}
              </Button>
              
              <Button
                variant="default"
                size="sm"
                className="touch-target"
              >
                <Play className="h-4 w-4 mr-2" />
                Publish
              </Button>
            </div>
          </div>

          {/* Canvas */}
          <div className="flex-1 relative overflow-hidden">
            <EditorCanvasWithDnd
              className="w-full h-full"
              showGrid={showGrid}
              onInstanceSelect={handleInstanceSelect}
              onInstanceUpdate={handleInstanceUpdate}
            />
            
            {/* Validation Errors Overlay */}
            {validationErrors.length > 0 && (
              <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10">
                <div className="bg-destructive text-destructive-foreground px-4 py-2 rounded-lg shadow-lg">
                  <div className="text-sm font-medium">
                    {validationErrors.length} validation error{validationErrors.length > 1 ? 's' : ''}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Properties & Contract Preview */}
        {(selectedInstanceId || showContractPreview) && (
          <div className="w-80 bg-card border-l border-border flex flex-col">
            <div className="p-4 border-b border-border">
              <h3 className="font-semibold text-lg max-heading-width">
                {showContractPreview ? 'Site Contract' : 'Properties'}
              </h3>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {showContractPreview ? (
                <ContractPreview />
              ) : selectedInstanceId ? (
                <div className="p-4">
                  <div className="form-group">
                    <label className="form-label">Component Properties</label>
                    <p className="text-sm text-muted-foreground">
                      Configure the selected component
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-4">
                  <div className="empty-state">
                    <Settings className="empty-state-icon" />
                    <h3 className="empty-state-title">No Selection</h3>
                    <p className="empty-state-description">
                      Select a component to edit its properties
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </DndProvider>
  )
}

export default Editor