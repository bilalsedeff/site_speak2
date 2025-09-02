import type { ComponentMetadata } from '@sitespeak/design-system'

// Editor component instance
export interface ComponentInstance {
  id: string
  componentName: string
  props: Record<string, any>
  children?: ComponentInstance[]
  position: {
    x: number
    y: number
  }
  size: {
    width: number
    height: number
  }
  styles?: Record<string, string>
  metadata: ComponentMetadata
}

// Editor component definition
export interface EditorComponent {
  name: string
  displayName: string
  category: 'layout' | 'content' | 'ui' | 'voice'
  icon: string
  metadata: ComponentMetadata
  defaultProps: Record<string, any>
  previewProps: Record<string, any>
}

// Drag and drop types
export interface DragItem {
  type: 'component' | 'instance'
  componentName?: string
  instanceId?: string
  metadata: ComponentMetadata
}

export interface DropResult {
  dropTarget: string
  position: { x: number; y: number }
  componentInstance?: ComponentInstance
}

// Editor state
export interface EditorState {
  // Canvas
  instances: ComponentInstance[]
  selectedInstanceId: string | null
  
  // UI State
  isPreviewMode: boolean
  showGrid: boolean
  zoomLevel: number
  
  // Contract
  contractData: {
    jsonLd: Record<string, any>[]
    actions: Record<string, any>
    ariaAudit: any
    sitemap: any
  }
  
  // Validation
  validationErrors: TemplateValidation[]
  contractPreviewVisible: boolean
}

// Template validation
export interface TemplateValidation {
  severity: 'error' | 'warning' | 'info'
  component: string
  instanceId: string
  property?: string
  message: string
  recommendation: string
  rule: string
}