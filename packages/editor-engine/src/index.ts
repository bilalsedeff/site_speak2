// Editor Engine - Drag-and-drop canvas with component palette and contract preview
export { EditorCanvas, EditorCanvasWithDnd } from './canvas/EditorCanvas'
export { ComponentPalette } from './palette/ComponentPalette'
export { ContractPreview } from './preview/ContractPreview'
export { TemplateLinter } from './linter/TemplateLinter' // ✅ Fully implemented template linter
export { useEditorStore } from './store/editorStore'

// Contract generation services and hooks
export { ContractGenerationService } from './services/ContractGenerationService'
export { useContractGeneration, useManualContractGeneration } from './hooks/useContractGeneration'

// Types
export type {
  EditorComponent,
  ComponentInstance,
  EditorState,
  DragItem,
  DropResult,
  ComponentMetadata,
  TemplateValidation
} from './types/editor'