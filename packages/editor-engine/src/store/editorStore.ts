import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { EditorState, ComponentInstance, TemplateValidation } from '../types/editor'

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
  setContractPreviewVisible: (visible: boolean) => void

  // Validation
  addValidationError: (error: TemplateValidation) => void
  removeValidationError: (componentId: string, rule: string) => void
  clearValidationErrors: () => void

  // Actions
  undo: () => void
  redo: () => void
  clearCanvas: () => void
  exportTemplate: () => any
  importTemplate: (template: any) => void
}

type EditorStore = EditorState & EditorActions

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

export const useEditorStore = create<EditorStore>()(
  immer((set, get) => ({
    ...initialState,

    // Instance management
    addInstance: (instance) =>
      set((state) => {
        state.instances.push(instance)
        state.selectedInstanceId = instance.id
      }),

    updateInstance: (id, updates) =>
      set((state) => {
        const index = state.instances.findIndex((i) => i.id === id)
        if (index !== -1) {
          Object.assign(state.instances[index], updates)
        }
      }),

    removeInstance: (id) =>
      set((state) => {
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
        state.selectedInstanceId = id
      }),

    duplicateInstance: (id) =>
      set((state) => {
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
        Object.assign(state.contractData, contract)
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

    // Actions
    undo: () => {
      // TODO: Implement undo/redo with history stack
      console.log('Undo not implemented yet')
    },

    redo: () => {
      // TODO: Implement undo/redo with history stack
      console.log('Redo not implemented yet')
    },

    clearCanvas: () =>
      set((state) => {
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