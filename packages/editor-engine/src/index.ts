// Editor Engine - Drag-and-drop canvas with component palette and contract preview
export { EditorCanvas } from './canvas/EditorCanvas'
export { ComponentPalette } from './palette/ComponentPalette'
export { ContractPreview } from './preview/ContractPreview'
export { TemplateLinter } from './linter/TemplateLinter' // ✅ Fully implemented template linter
export { useEditorStore } from './store/editorStore'

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