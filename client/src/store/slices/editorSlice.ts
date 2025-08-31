import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { nanoid } from 'nanoid'


// Editor component types

export interface EditorComponent 
{
      id: string
      type: string
      props: Record<string, any>
      children?: EditorComponent[]
      parentId?: string
      position: { x: number; y: number }
      size: { width: number; height: number }
      zIndex: number
}

export interface EditorHistory {
  past: EditorComponent[][]
  present: EditorComponent[]
  future: EditorComponent[][]
}

interface EditorState {
  // Canvas state
  components: EditorComponent[]
  selectedComponentIds: string[]
  hoveredComponentId: string | null
  
  // History for undo/redo
  history: EditorHistory
  canUndo: boolean
  canRedo: boolean
  
  // View state
  zoom: number
  canvasOffset: { x: number; y: number }
  showGrid: boolean
  showRulers: boolean
  snapToGrid: boolean
  gridSize: number
  
  // Panels
  leftPanelWidth: number
  rightPanelWidth: number
  isLeftPanelOpen: boolean
  isRightPanelOpen: boolean
  
  // Mode
  mode: 'design' | 'preview' | 'responsive'
  device: 'desktop' | 'tablet' | 'mobile'
  
  // Clipboard
  clipboard: EditorComponent[]
  
  // Drag and drop
  isDragging: boolean
  draggedComponent: EditorComponent | null
  dropZone: string | null
  
  // Voice editing
  isVoiceEditing: boolean
  voiceTarget: string | null
}

export interface EditorHistory {
  past: EditorComponent[][]
  present: EditorComponent[]
  future: EditorComponent[][]
}

interface EditorState {
  // Canvas state
  components: EditorComponent[]
  selectedComponentIds: string[]
  hoveredComponentId: string | null
  
  // History for undo/redo
  history: EditorHistory
  canUndo: boolean
  canRedo: boolean
  
  // View state
  zoom: number
  canvasOffset: { x: number; y: number }
  showGrid: boolean
  showRulers: boolean
snapToGrid: boolean
  gridSize: number
  
  // Panels
  leftPanelWidth: number
  rightPanelWidth: number
  isLeftPanelOpen: boolean
  isRightPanelOpen: boolean
  
  // Mode
  mode: 'design' | 'preview' | 'responsive'
  device: 'desktop' | 'tablet' | 'mobile'
  
  // Clipboard
  clipboard: EditorComponent[]
  
  // Drag and drop
  isDragging: boolean
  draggedComponent: EditorComponent | null
  dropZone: string | null
  
  // Voice editing
  isVoiceEditing: boolean
  voiceTarget: string | null
}

const initialState: EditorState = {
  components: [],
  selectedComponentIds: [],
  hoveredComponentId: null,
  
  history: {
    past: [],
    present: [],
    future: [],
  },
  canUndo: false,
  canRedo: false,
  
  zoom: 1,
  canvasOffset: { x: 0, y: 0 },
  showGrid: false,
  showRulers: false,
  snapToGrid: true,
  gridSize: 10,
  
  leftPanelWidth: 300,
  rightPanelWidth: 320,
  isLeftPanelOpen: true,
  isRightPanelOpen: true,
  
  mode: 'design',
  device: 'desktop',
  
  clipboard: [],
  
  isDragging: false,
  draggedComponent: null,
  dropZone: null,
  
  isVoiceEditing: false,
  voiceTarget: null,
}

const editorSlice = createSlice({
  name: 'editor',
  initialState,
  reducers: {
    // Component management
    addComponent: (state, action: PayloadAction<Omit<EditorComponent, 'id'>>) => {
      const component: EditorComponent = {
        ...action.payload,
        id: nanoid(),
      }
      
      // Save current state to history
      state.history.past.push([...state.components])
      state.history.future = []
      
      state.components.push(component)
      state.selectedComponentIds = [component.id]
      
      // Update history flags
      state.canUndo = state.history.past.length > 0
      state.canRedo = false
    },
    
    updateComponent: (state, action: PayloadAction<{ id: string; updates: Partial<EditorComponent> }>) => {
      const { id, updates } = action.payload
      const index = state.components.findIndex(c => c.id === id)
      
      if (index !== -1) {
        // Only save to history for significant changes (not position/size during drag)
        const shouldSaveHistory = !updates.position && !updates.size
        
        if (shouldSaveHistory) {
          state.history.past.push([...state.components])
          state.history.future = []
        }
        
        state.components[index] = {
          ...state.components[index],
          ...updates,
        }
        
        if (shouldSaveHistory) {
          state.canUndo = state.history.past.length > 0
          state.canRedo = false
        }
      }
    },
    
    removeComponent: (state, action: PayloadAction<string>) => {
      const componentId = action.payload
      
      // Save current state to history
      state.history.past.push([...state.components])
      state.history.future = []
      
      // Remove component and its children recursively
      const removeRecursively = (id: string) => {
        const children = state.components.filter(c => c.parentId === id)
        children.forEach(child => removeRecursively(child.id))
        state.components = state.components.filter(c => c.id !== id)
      }
      
      removeRecursively(componentId)
      
      // Remove from selection
      state.selectedComponentIds = state.selectedComponentIds.filter(id => id !== componentId)
      
      // Update history flags
      state.canUndo = state.history.past.length > 0
      state.canRedo = false
    },
    
    duplicateComponent: (state, action: PayloadAction<string>) => {
      const componentId = action.payload
      const component = state.components.find(c => c.id === componentId)
      
      if (component) {
        // Save current state to history
        state.history.past.push([...state.components])
        state.history.future = []
        
        const duplicate: EditorComponent = {
          ...component,
          id: nanoid(),
          position: {
            x: component.position.x + 20,
            y: component.position.y + 20,
          },
        }
        
        state.components.push(duplicate)
        state.selectedComponentIds = [duplicate.id]
        
        // Update history flags
        state.canUndo = state.history.past.length > 0
        state.canRedo = false
      }
    },
    
    // Selection management
    selectComponent: (state, action: PayloadAction<string | string[]>) => {
      const ids = Array.isArray(action.payload) ? action.payload : [action.payload]
      state.selectedComponentIds = ids
    },
    
    addToSelection: (state, action: PayloadAction<string>) => {
      if (!state.selectedComponentIds.includes(action.payload)) {
        state.selectedComponentIds.push(action.payload)
      }
    },
    
    removeFromSelection: (state, action: PayloadAction<string>) => {
      state.selectedComponentIds = state.selectedComponentIds.filter(id => id !== action.payload)
    },
    
    clearSelection: (state) => {
      state.selectedComponentIds = []
    },
    
    setHoveredComponent: (state, action: PayloadAction<string | null>) => {
      state.hoveredComponentId = action.payload
    },
    
    // History management
    undo: (state) => {
      if (state.history.past.length > 0) {
        const previous = state.history.past.pop()!
        state.history.future.unshift([...state.components])
        state.components = previous
        
        state.canUndo = state.history.past.length > 0
        state.canRedo = true
      }
    },
    
    redo: (state) => {
      if (state.history.future.length > 0) {
        const next = state.history.future.shift()!
        state.history.past.push([...state.components])
        state.components = next
        
        state.canUndo = true
        state.canRedo = state.history.future.length > 0
      }
    },
    
    saveToHistory: (state) => {
      state.history.past.push([...state.components])
      state.history.future = []
      state.canUndo = true
      state.canRedo = false
    },
    
    // View controls
    setZoom: (state, action: PayloadAction<number>) => {
      state.zoom = Math.max(0.1, Math.min(5, action.payload))
    },
    
    setCanvasOffset: (state, action: PayloadAction<{ x: number; y: number }>) => {
      state.canvasOffset = action.payload
    },
    
    toggleGrid: (state) => {
      state.showGrid = !state.showGrid
    },
    
    toggleRulers: (state) => {
      state.showRulers = !state.showRulers
    },
    
    toggleSnapToGrid: (state) => {
      state.snapToGrid = !state.snapToGrid
    },
    
    setGridSize: (state, action: PayloadAction<number>) => {
      state.gridSize = action.payload
    },
    
    // Panel controls
    setLeftPanelWidth: (state, action: PayloadAction<number>) => {
      state.leftPanelWidth = Math.max(200, Math.min(600, action.payload))
    },
    
    setRightPanelWidth: (state, action: PayloadAction<number>) => {
      state.rightPanelWidth = Math.max(200, Math.min(600, action.payload))
    },
    
    toggleLeftPanel: (state) => {
      state.isLeftPanelOpen = !state.isLeftPanelOpen
    },
    
    toggleRightPanel: (state) => {
      state.isRightPanelOpen = !state.isRightPanelOpen
    },
    
    // Mode and device
    setMode: (state, action: PayloadAction<EditorState['mode']>) => {
      state.mode = action.payload
    },
    
    setDevice: (state, action: PayloadAction<EditorState['device']>) => {
      state.device = action.payload
    },
    
    // Clipboard operations
    copyToClipboard: (state, action: PayloadAction<string[]>) => {
      const componentIds = action.payload
      state.clipboard = state.components.filter(c => componentIds.includes(c.id))
    },
    
    pasteFromClipboard: (state, action: PayloadAction<{ x: number; y: number }>) => {
      if (state.clipboard.length > 0) {
        // Save current state to history
        state.history.past.push([...state.components])
        state.history.future = []
        
        const pastedComponents = state.clipboard.map((component, index) => ({
          ...component,
          id: nanoid(),
          position: {
            x: action.payload.x + (index * 20),
            y: action.payload.y + (index * 20),
          },
          parentId: undefined, // Remove parent relationships
        }))
        
        state.components.push(...pastedComponents)
        state.selectedComponentIds = pastedComponents.map(c => c.id)
        
        // Update history flags
        state.canUndo = state.history.past.length > 0
        state.canRedo = false
      }
    },
    
    // Drag and drop
    setDragging: (state, action: PayloadAction<{ isDragging: boolean; component?: EditorComponent }>) => {
      state.isDragging = action.payload.isDragging
      state.draggedComponent = action.payload.component || null
    },
    
    setDropZone: (state, action: PayloadAction<string | null>) => {
      state.dropZone = action.payload
    },
    
    // Voice editing
    setVoiceEditing: (state, action: PayloadAction<{ isEditing: boolean; target?: string }>) => {
      state.isVoiceEditing = action.payload.isEditing
      state.voiceTarget = action.payload.target || null
    },
    
    // Load components (from API)
    loadComponents: (state, action: PayloadAction<EditorComponent[]>) => {
      state.components = action.payload
      state.selectedComponentIds = []
      state.history = {
        past: [],
        present: action.payload,
        future: [],
      }
      state.canUndo = false
      state.canRedo = false
    },
    
    // Reset editor
    resetEditor: () => initialState,
  },
})

export const {
  addComponent,
  updateComponent,
  removeComponent,
  duplicateComponent,
  selectComponent,
  addToSelection,
  removeFromSelection,
  clearSelection,
  setHoveredComponent,
  undo,
  redo,
  saveToHistory,
  setZoom,
  setCanvasOffset,
  toggleGrid,
  toggleRulers,
  toggleSnapToGrid,
  setGridSize,
  setLeftPanelWidth,
  setRightPanelWidth,
  toggleLeftPanel,
  toggleRightPanel,
  setMode,
  setDevice,
  copyToClipboard,
  pasteFromClipboard,
  setDragging,
  setDropZone,
  setVoiceEditing,
  loadComponents,
  resetEditor,
} = editorSlice.actions

export default editorSlice.reducer
