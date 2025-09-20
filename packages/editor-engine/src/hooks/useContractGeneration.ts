import { useEffect, useCallback, useRef } from 'react'
import { useEditorStore } from '../store/editorStore'
import { ContractGenerationService } from '../services/ContractGenerationService'

interface UseContractGenerationOptions {
  baseUrl?: string
  autoGenerate?: boolean
  debounceMs?: number
  strict?: boolean
}

interface ContractGenerationResult {
  isGenerating: boolean
  lastGenerated: Date | null
  generateContract: () => Promise<void>
  error: string | null
}

/**
 * Hook for automatic contract generation based on editor state
 */
export function useContractGeneration(
  options: UseContractGenerationOptions = {}
): ContractGenerationResult {
  const {
    baseUrl = 'https://preview.sitespeak.ai',
    autoGenerate = true,
    debounceMs = 1000,
    strict = false
  } = options

  const {
    instances,
    setContractData,
    validationErrors,
    clearValidationErrors
  } = useEditorStore()

  const serviceRef = useRef<ContractGenerationService | null>(null)
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isGeneratingRef = useRef(false)
  const lastGeneratedRef = useRef<Date | null>(null)
  const errorRef = useRef<string | null>(null)

  // Initialize service
  useEffect(() => {
    serviceRef.current = new ContractGenerationService({
      baseUrl,
      strict
    })
  }, [baseUrl, strict])

  // Generate contract
  const generateContract = useCallback(async (): Promise<void> => {
    if (!serviceRef.current || isGeneratingRef.current) {
      return
    }

    try {
      isGeneratingRef.current = true
      errorRef.current = null

      // Clear previous validation errors
      clearValidationErrors()

      if (instances.length === 0) {
        // No components, set empty contract
        setContractData({
          jsonLd: [],
          actions: {},
          ariaAudit: {},
          sitemap: {}
        })
        lastGeneratedRef.current = new Date()
        return
      }

      // Generate contract from current instances
      const contract = await serviceRef.current.generateContract(
        instances,
        'Editor Preview',
        '/'
      )

      // Update editor store with generated contract
      setContractData({
        jsonLd: contract.jsonLd.entities.map(entity => entity.data),
        actions: contract.actions,
        ariaAudit: {
          version: '1.0.0',
          lastUpdated: contract.generatedAt,
          components: instances.reduce((acc, instance) => {
            acc[instance.componentName] = {
              instanceCount: instances.filter(i => i.componentName === instance.componentName).length,
              ariaCompliant: validationErrors.filter(e => e.instanceId === instance.id).length === 0
            }
            return acc
          }, {} as Record<string, any>)
        },
        sitemap: contract.sitemap
      })

      lastGeneratedRef.current = new Date()

      if (process.env['NODE_ENV'] === 'development') {
        console.log('Contract generated successfully:', {
          jsonLdEntities: contract.jsonLd.entities.length,
          actionCount: Object.keys(contract.actions.actions).length,
          sitemapEntries: contract.sitemap.entries.length,
          validationIssues: contract.jsonLd.validation.invalid +
                           contract.sitemap.validationIssues.length
        })
      }

    } catch (error) {
      errorRef.current = error instanceof Error ? error.message : 'Contract generation failed'
      console.error('Contract generation failed:', error)
    } finally {
      isGeneratingRef.current = false
    }
  }, [instances, setContractData, clearValidationErrors, validationErrors])

  // Debounced auto-generation
  const debouncedGenerate = useCallback(() => {
    if (!autoGenerate) {return}

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current)
    }

    debounceTimeoutRef.current = setTimeout(() => {
      generateContract()
    }, debounceMs)
  }, [autoGenerate, debounceMs, generateContract])

  // Auto-generate when instances change
  useEffect(() => {
    if (autoGenerate) {
      debouncedGenerate()
    }

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current)
      }
    }
  }, [instances, debouncedGenerate, autoGenerate])

  // Update service base URL when it changes
  useEffect(() => {
    if (serviceRef.current && baseUrl) {
      serviceRef.current.updateBaseUrl(baseUrl)
    }
  }, [baseUrl])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current)
      }
    }
  }, [])

  return {
    isGenerating: isGeneratingRef.current,
    lastGenerated: lastGeneratedRef.current,
    generateContract,
    error: errorRef.current
  }
}

/**
 * Hook for manual contract generation with more control
 */
export function useManualContractGeneration(baseUrl?: string) {
  const { instances } = useEditorStore()
  const serviceRef = useRef<ContractGenerationService | null>(null)

  useEffect(() => {
    serviceRef.current = new ContractGenerationService({
      baseUrl: baseUrl || 'https://preview.sitespeak.ai',
      strict: false
    })
  }, [baseUrl])

  const generateJsonLd = useCallback(async () => {
    if (!serviceRef.current) {return null}
    return serviceRef.current.generateJsonLdOnly(instances)
  }, [instances])

  const generateActions = useCallback(async () => {
    if (!serviceRef.current) {return null}
    return serviceRef.current.generateActionsOnly(instances)
  }, [instances])

  const generateFullContract = useCallback(async () => {
    if (!serviceRef.current) {return null}
    return serviceRef.current.generateContract(instances, 'Preview', '/')
  }, [instances])

  return {
    generateJsonLd,
    generateActions,
    generateFullContract,
    hasInstances: instances.length > 0
  }
}