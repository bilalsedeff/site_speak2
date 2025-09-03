/**
 * Speculation Rules API implementation for instant navigations
 * Following Web Platform specification and performance best practices
 */
import { useEffect } from 'react'

interface SpeculationRule {
  source: 'list' | 'document'
  where?: { href_matches?: string; selector_matches?: string }
  eagerness?: 'conservative' | 'moderate' | 'immediate'
}

interface SpeculationRules {
  prerender?: SpeculationRule[]
  prefetch?: SpeculationRule[]
}

class SpeculationRulesManager {
  private rulesScript: HTMLScriptElement | null = null
  private isSupported: boolean

  constructor() {
    // Check if Speculation Rules API is supported
    this.isSupported = 'supports' in HTMLScriptElement && 
                      HTMLScriptElement.supports('speculationrules')
  }

  /**
   * Add speculation rules for instant navigation
   */
  addRules(rules: SpeculationRules): void {
    if (!this.isSupported) {
      console.warn('Speculation Rules API not supported')
      return
    }

    // Remove existing rules
    this.removeRules()

    // Create new script element
    this.rulesScript = document.createElement('script')
    this.rulesScript.type = 'speculationrules'
    this.rulesScript.textContent = JSON.stringify(rules, null, 2)

    // Append to head
    document.head.appendChild(this.rulesScript)

    console.log('Speculation Rules added:', rules)
  }

  /**
   * Remove current speculation rules
   */
  removeRules(): void {
    if (this.rulesScript && this.rulesScript.parentNode) {
      this.rulesScript.parentNode.removeChild(this.rulesScript)
      this.rulesScript = null
    }
  }

  /**
   * Check if API is supported
   */
  isApiSupported(): boolean {
    return this.isSupported
  }

  /**
   * Get prefetch/prerender recommendations based on current page
   */
  getRecommendations(currentPath: string): SpeculationRules {
    const rules: SpeculationRules = {}

    // Dashboard → Editor/Templates (likely next pages)
    if (currentPath === '/' || currentPath === '/dashboard') {
      rules.prefetch = [
        {
          source: 'list',
          eagerness: 'moderate',
          where: { href_matches: '/editor/*' }
        },
        {
          source: 'list', 
          eagerness: 'conservative',
          where: { href_matches: '/templates' }
        }
      ]
    }

    // Templates → Editor (high likelihood)
    else if (currentPath === '/templates') {
      rules.prerender = [
        {
          source: 'list',
          eagerness: 'moderate',
          where: { href_matches: '/editor/*' }
        }
      ]
      rules.prefetch = [
        {
          source: 'list',
          eagerness: 'conservative', 
          where: { href_matches: '/dashboard' }
        }
      ]
    }

    // Editor → Analytics/Templates (common workflow)
    else if (currentPath.startsWith('/editor')) {
      rules.prefetch = [
        {
          source: 'list',
          eagerness: 'conservative',
          where: { href_matches: '/analytics/*' }
        },
        {
          source: 'list',
          eagerness: 'conservative',
          where: { href_matches: '/templates' }
        }
      ]
    }

    // General navigation patterns
    rules.prefetch = [
      ...(rules.prefetch || []),
      {
        source: 'document',
        eagerness: 'conservative',
        where: { selector_matches: 'a[href^="/"]' }
      }
    ]

    return rules
  }

  /**
   * Auto-configure rules based on current route
   */
  autoConfigureRules(currentPath: string): void {
    const rules = this.getRecommendations(currentPath)
    this.addRules(rules)
  }

  /**
   * Configure rules for site builder (list → detail patterns)
   */
  configureSiteBuilderRules(): void {
    const rules: SpeculationRules = {
      // Prerender likely next pages
      prerender: [
        {
          source: 'list',
          eagerness: 'moderate',
        }
      ],
      // Prefetch resources for all internal links
      prefetch: [
        {
          source: 'document',
          eagerness: 'conservative',
          where: { selector_matches: 'a[href^="/"]' }
        }
      ]
    }

    this.addRules(rules)
  }

  /**
   * Configure rules for published sites (e-commerce patterns)
   */
  configurePublishedSiteRules(): void {
    const rules: SpeculationRules = {
      // Prerender high-value pages
      prerender: [
        {
          source: 'list',
          eagerness: 'moderate',
          where: { href_matches: '/product/*' }
        },
        {
          source: 'list',
          eagerness: 'conservative',
          where: { href_matches: '/checkout' }
        }
      ],
      // Prefetch category → product, product → cart flows
      prefetch: [
        {
          source: 'document',
          eagerness: 'moderate',
          where: { selector_matches: '.product-card a, .category-link' }
        },
        {
          source: 'document', 
          eagerness: 'conservative',
          where: { selector_matches: '.add-to-cart, .buy-now' }
        }
      ]
    }

    this.addRules(rules)
  }
}

// Global instance
export const speculationRules = new SpeculationRulesManager()

/**
 * React hook for managing speculation rules
 */
export function useSpeculationRules(currentPath: string) {
  useEffect(() => {
    speculationRules.autoConfigureRules(currentPath)
    
    return () => {
      speculationRules.removeRules()
    }
  }, [currentPath])

  return {
    isSupported: speculationRules.isApiSupported(),
    addRules: speculationRules.addRules.bind(speculationRules),
    removeRules: speculationRules.removeRules.bind(speculationRules),
  }
}

/**
 * Performance monitoring for speculation rules effectiveness
 */
export class SpeculationMetrics {
  private static observations: Array<{
    type: 'prefetch' | 'prerender'
    url: string
    timestamp: number
    wasUsed: boolean
    loadTime?: number
  }> = []

  static observeNavigation() {
    // Monitor navigation performance
    if ('performance' in window && 'getEntriesByType' in performance) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'navigation') {
            const navEntry = entry as PerformanceNavigationTiming
            
            // Check if this was a speculative load
            const wasSpeculative = navEntry.loadEventEnd - navEntry.fetchStart < 100
            
            if (wasSpeculative) {
              console.log('Fast navigation detected (likely prerender):', {
                url: navEntry.name,
                loadTime: navEntry.loadEventEnd - navEntry.fetchStart,
                ttfb: navEntry.responseStart - navEntry.requestStart
              })
            }
          }
        }
      })

      observer.observe({ entryTypes: ['navigation'] })
    }
  }

  static recordSpeculation(type: 'prefetch' | 'prerender', url: string) {
    this.observations.push({
      type,
      url,
      timestamp: Date.now(),
      wasUsed: false
    })
  }

  static recordUsage(url: string, loadTime: number) {
    const observation = this.observations.find(obs => obs.url === url)
    if (observation) {
      observation.wasUsed = true
      observation.loadTime = loadTime
    }
  }

  static getMetrics() {
    const prefetchHitRate = this.observations.filter(obs => 
      obs.type === 'prefetch' && obs.wasUsed
    ).length / this.observations.filter(obs => obs.type === 'prefetch').length

    const prerenderHitRate = this.observations.filter(obs => 
      obs.type === 'prerender' && obs.wasUsed  
    ).length / this.observations.filter(obs => obs.type === 'prerender').length

    return {
      prefetchHitRate: prefetchHitRate || 0,
      prerenderHitRate: prerenderHitRate || 0,
      totalObservations: this.observations.length
    }
  }
}

// Auto-start metrics collection
if (typeof window !== 'undefined') {
  SpeculationMetrics.observeNavigation()
}