import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { EditorState, ComponentInstance, TemplateValidation } from '../types/editor'

// History state for undo/redo functionality
interface HistoryState {
  past: EditorState[]
  present: EditorState
  future: EditorState[]
}

interface EditorActions {
  // Instance management
  addInstance: (instance: ComponentInstance) => void
  updateInstance: (id: string, updates: Partial<ComponentInstance>) => void
  removeInstance: (id: string) => void
  selectInstance: (id: string | null) => void
  duplicateInstance: (id: string) => void

  // UI state
  setPreviewMode: (enabled: boolean) => void
  setShowGrid: (enabled: boolean) => void
  setZoomLevel: (level: number) => void

  // Contract management
  updateContract: (contract: Partial<EditorState['contractData']>) => void
  setContractData: (contract: EditorState['contractData']) => void
  setContractPreviewVisible: (visible: boolean) => void

  // Validation
  addValidationError: (error: TemplateValidation) => void
  removeValidationError: (componentId: string, rule: string) => void
  clearValidationErrors: () => void

  // History management
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
  saveToHistory: () => void

  // Actions
  clearCanvas: () => void
  exportTemplate: () => any
  importTemplate: (template: any) => void
}

type EditorStore = EditorState & EditorActions & {
  history: HistoryState
}

const initialState: EditorState = {
  instances: [],
  selectedInstanceId: null,
  isPreviewMode: false,
  showGrid: true,
  zoomLevel: 1,
  contractData: {
    jsonLd: [],
    actions: {},
    ariaAudit: null,
    sitemap: null,
  },
  validationErrors: [],
  contractPreviewVisible: false,
}

// Configuration for history management
const HISTORY_CONFIG = {
  maxHistorySize: 50, // Maximum number of states to keep in history
  includeUIState: false, // Whether to include UI state (preview mode, zoom, etc.) in history
} as const

// Helper function to create a deep copy of editor state for history
const createStateSnapshot = (state: EditorState, includeUIState = false): EditorState => {
  const snapshot = {
    instances: JSON.parse(JSON.stringify(state.instances)),
    contractData: JSON.parse(JSON.stringify(state.contractData)),
    validationErrors: JSON.parse(JSON.stringify(state.validationErrors)),
    selectedInstanceId: null, // Always reset selection in history
    // UI state (conditionally included)
    isPreviewMode: includeUIState ? state.isPreviewMode : false,
    showGrid: includeUIState ? state.showGrid : true,
    zoomLevel: includeUIState ? state.zoomLevel : 1,
    contractPreviewVisible: includeUIState ? state.contractPreviewVisible : false,
  }
  return snapshot
}

// Helper function to check if two states are significantly different (to avoid saving identical states)
const statesAreDifferent = (state1: EditorState, state2: EditorState): boolean => {
  // Compare instances
  if (state1.instances.length !== state2.instances.length) {return true}

  // Deep compare instances
  for (let i = 0; i < state1.instances.length; i++) {
    const inst1 = state1.instances[i]
    const inst2 = state2.instances[i]
    if (!inst1 || !inst2) {return true}

    if (
      inst1.id !== inst2.id ||
      inst1.componentName !== inst2.componentName ||
      JSON.stringify(inst1.props) !== JSON.stringify(inst2.props) ||
      JSON.stringify(inst1.position) !== JSON.stringify(inst2.position) ||
      JSON.stringify(inst1.size) !== JSON.stringify(inst2.size) ||
      JSON.stringify(inst1.styles) !== JSON.stringify(inst2.styles)
    ) {
      return true
    }
  }

  // Compare contract data
  if (JSON.stringify(state1.contractData) !== JSON.stringify(state2.contractData)) {
    return true
  }

  return false
}

export const useEditorStore = create<EditorStore>()(
  immer((set, get) => ({
    ...initialState,

    // Initialize history
    history: {
      past: [],
      present: createStateSnapshot(initialState),
      future: [],
    },

    // Instance management
    addInstance: (instance) =>
      set((state) => {
        // Save current state to history before making changes
        get().saveToHistory()

        state.instances.push(instance)
        state.selectedInstanceId = instance.id
      }),

    updateInstance: (id, updates) =>
      set((state) => {
        // Save to history before making changes
        get().saveToHistory()

        const index = state.instances.findIndex((i) => i.id === id)
        if (index !== -1) {
          const instance = state.instances[index]
          if (instance) {
            Object.assign(instance, updates)
          }
        }
      }),

    removeInstance: (id) =>
      set((state) => {
        // Save to history before making changes
        get().saveToHistory()

        state.instances = state.instances.filter((i) => i.id !== id)
        if (state.selectedInstanceId === id) {
          state.selectedInstanceId = null
        }
        // Remove validation errors for this instance
        state.validationErrors = state.validationErrors.filter(
          (error) => error.instanceId !== id
        )
      }),

    selectInstance: (id) =>
      set((state) => {
        // Selection changes don't need to be saved to history
        state.selectedInstanceId = id
      }),

    duplicateInstance: (id) =>
      set((state) => {
        // Save to history before making changes
        get().saveToHistory()

        const instance = state.instances.find((i) => i.id === id)
        if (instance) {
          const newInstance: ComponentInstance = {
            ...instance,
            id: `${instance.componentName}-${Date.now()}`,
            position: {
              x: instance.position.x + 20,
              y: instance.position.y + 20,
            },
          }
          state.instances.push(newInstance)
          state.selectedInstanceId = newInstance.id
        }
      }),

    // UI state
    setPreviewMode: (enabled) =>
      set((state) => {
        state.isPreviewMode = enabled
        if (enabled) {
          state.selectedInstanceId = null
        }
      }),

    setShowGrid: (enabled) =>
      set((state) => {
        state.showGrid = enabled
      }),

    setZoomLevel: (level) =>
      set((state) => {
        state.zoomLevel = Math.max(0.1, Math.min(3, level))
      }),

    // Contract management
    updateContract: (contract) =>
      set((state) => {
        // Save to history before making changes
        get().saveToHistory()

        Object.assign(state.contractData, contract)
      }),

    setContractData: (contract) =>
      set((state) => {
        // Don't save to history for contract data updates (they're generated, not user actions)
        state.contractData = contract
      }),

    setContractPreviewVisible: (visible) =>
      set((state) => {
        state.contractPreviewVisible = visible
      }),

    // Validation
    addValidationError: (error) =>
      set((state) => {
        // Remove existing error with same instanceId and rule
        state.validationErrors = state.validationErrors.filter(
          (e) => !(e.instanceId === error.instanceId && e.rule === error.rule)
        )
        state.validationErrors.push(error)
      }),

    removeValidationError: (instanceId, rule) =>
      set((state) => {
        state.validationErrors = state.validationErrors.filter(
          (error) => !(error.instanceId === instanceId && error.rule === rule)
        )
      }),

    clearValidationErrors: () =>
      set((state) => {
        state.validationErrors = []
      }),

    // History management
    undo: () =>
      set((state) => {
        const { past, present, future } = state.history

        if (past.length === 0) {
          return // Nothing to undo
        }

        const previous = past[past.length - 1]!
        const newPast = past.slice(0, past.length - 1)

        // Update history
        state.history = {
          past: newPast,
          present: previous,
          future: [present, ...future],
        }

        // Restore the previous state
        Object.assign(state, previous)
      }),

    redo: () =>
      set((state) => {
        const { past, present, future } = state.history

        if (future.length === 0) {
          return // Nothing to redo
        }

        const next = future[0]!
        const newFuture = future.slice(1)

        // Update history
        state.history = {
          past: [...past, present],
          present: next,
          future: newFuture,
        }

        // Restore the next state
        Object.assign(state, next)
      }),

    canUndo: () => {
      const state = get()
      return state.history.past.length > 0
    },

    canRedo: () => {
      const state = get()
      return state.history.future.length > 0
    },

    saveToHistory: () =>
      set((state) => {
        const currentSnapshot = createStateSnapshot(state, HISTORY_CONFIG.includeUIState)

        // Check if the current state is different from the last saved state
        if (!statesAreDifferent(currentSnapshot, state.history.present)) {
          return // No significant changes, don't save to history
        }

        const { past, present } = state.history

        // Add current state to past
        const newPast = [...past, present]

        // Limit history size
        if (newPast.length > HISTORY_CONFIG.maxHistorySize) {
          newPast.shift() // Remove oldest state
        }

        // Update history and clear future (new changes invalidate redo stack)
        state.history = {
          past: newPast,
          present: currentSnapshot,
          future: [],
        }
      }),

    // Actions

    clearCanvas: () =>
      set((state) => {
        // Save to history before clearing canvas
        get().saveToHistory()

        state.instances = []
        state.selectedInstanceId = null
        state.validationErrors = []
        state.contractData = {
          jsonLd: [],
          actions: {},
          ariaAudit: null,
          sitemap: null,
        }
      }),

    exportTemplate: () => {
      const state = get()
      return {
        version: '1.0.0',
        instances: state.instances,
        contractData: state.contractData,
        metadata: {
          exportedAt: new Date().toISOString(),
          instanceCount: state.instances.length,
          validationErrors: state.validationErrors.length,
        },
      }
    },

    importTemplate: (template) =>
      set((state) => {
        // Save to history before importing template
        get().saveToHistory()

        if (template.instances) {
          state.instances = template.instances
        }
        if (template.contractData) {
          state.contractData = template.contractData
        }
        state.selectedInstanceId = null
        state.validationErrors = []
      }),
  }))
)