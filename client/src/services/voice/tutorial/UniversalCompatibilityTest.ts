/**
 * UniversalCompatibilityTest - Comprehensive testing for universal website compatibility
 *
 * Tests the voice tutorial system across different website structures, layouts,
 * and environments to ensure universal compatibility.
 */

import type { VoiceTutorialSystem } from './index'
import type { AudioWorkletIntegrationService } from '../AudioWorkletIntegrationService'

// Website structure simulation types
export interface WebsiteStructure {
  name: string
  type: 'ecommerce' | 'blog' | 'landing' | 'dashboard' | 'form' | 'documentation' | 'news' | 'portfolio'
  elements: {
    buttons: number
    forms: number
    navigation: number
    modals: number
    iframes: number
    shadowDom: boolean
    dynamicContent: boolean
  }
  frameworks: string[]
  characteristics: {
    spa: boolean
    ssr: boolean
    pwa: boolean
    hasServiceWorker: boolean
    hasCustomElements: boolean
  }
  challenges: string[]
}

export interface CompatibilityTestResult {
  websiteType: string
  passed: boolean
  score: number // 0-100
  details: {
    tutorialLaunch: boolean
    voiceRecognition: boolean
    contextualHelp: boolean
    accessibility: boolean
    performance: boolean
    uiRendering: boolean
    navigation: boolean
    errorHandling: boolean
  }
  issues: Array<{
    severity: 'low' | 'medium' | 'high' | 'critical'
    component: string
    description: string
    suggestion?: string
  }>
  metrics: {
    launchTime: number
    responseTime: number
    memoryUsage: number
    errorCount: number
  }
}

export interface UniversalCompatibilityReport {
  overallCompatibility: number
  testedWebsites: number
  passedTests: number
  failedTests: number
  results: CompatibilityTestResult[]
  recommendations: string[]
  criticalIssues: Array<{
    issue: string
    affectedSites: string[]
    priority: number
  }>
}

// Simulated website structures for testing
const WEBSITE_STRUCTURES: WebsiteStructure[] = [
  {
    name: 'Modern E-commerce (React)',
    type: 'ecommerce',
    elements: {
      buttons: 25,
      forms: 3,
      navigation: 2,
      modals: 5,
      iframes: 1,
      shadowDom: false,
      dynamicContent: true
    },
    frameworks: ['React', 'Redux', 'React Router'],
    characteristics: {
      spa: true,
      ssr: false,
      pwa: true,
      hasServiceWorker: true,
      hasCustomElements: false
    },
    challenges: ['Dynamic routing', 'Virtual scrolling', 'Lazy loading', 'State management']
  },
  {
    name: 'WordPress Blog',
    type: 'blog',
    elements: {
      buttons: 8,
      forms: 2,
      navigation: 1,
      modals: 1,
      iframes: 2,
      shadowDom: false,
      dynamicContent: false
    },
    frameworks: ['jQuery', 'WordPress'],
    characteristics: {
      spa: false,
      ssr: true,
      pwa: false,
      hasServiceWorker: false,
      hasCustomElements: false
    },
    challenges: ['Plugin conflicts', 'Legacy JavaScript', 'SEO optimization']
  },
  {
    name: 'Vue.js Dashboard',
    type: 'dashboard',
    elements: {
      buttons: 40,
      forms: 8,
      navigation: 3,
      modals: 10,
      iframes: 0,
      shadowDom: false,
      dynamicContent: true
    },
    frameworks: ['Vue.js', 'Vuex', 'Vue Router'],
    characteristics: {
      spa: true,
      ssr: false,
      pwa: false,
      hasServiceWorker: false,
      hasCustomElements: true
    },
    challenges: ['Real-time data', 'Chart components', 'Complex forms', 'Permission levels']
  },
  {
    name: 'Angular Enterprise App',
    type: 'form',
    elements: {
      buttons: 60,
      forms: 15,
      navigation: 4,
      modals: 8,
      iframes: 3,
      shadowDom: true,
      dynamicContent: true
    },
    frameworks: ['Angular', 'RxJS', 'Angular Material'],
    characteristics: {
      spa: true,
      ssr: true,
      pwa: true,
      hasServiceWorker: true,
      hasCustomElements: true
    },
    challenges: ['Shadow DOM', 'Micro frontends', 'Complex routing', 'Enterprise security']
  },
  {
    name: 'Static Landing Page',
    type: 'landing',
    elements: {
      buttons: 5,
      forms: 1,
      navigation: 1,
      modals: 0,
      iframes: 0,
      shadowDom: false,
      dynamicContent: false
    },
    frameworks: ['Vanilla JS'],
    characteristics: {
      spa: false,
      ssr: true,
      pwa: false,
      hasServiceWorker: false,
      hasCustomElements: false
    },
    challenges: ['Minimal JavaScript', 'Performance optimization', 'SEO requirements']
  },
  {
    name: 'Shopify Store',
    type: 'ecommerce',
    elements: {
      buttons: 20,
      forms: 4,
      navigation: 2,
      modals: 3,
      iframes: 1,
      shadowDom: false,
      dynamicContent: true
    },
    frameworks: ['Liquid', 'Shopify Scripts'],
    characteristics: {
      spa: false,
      ssr: true,
      pwa: false,
      hasServiceWorker: false,
      hasCustomElements: false
    },
    challenges: ['Template constraints', 'Third-party apps', 'Payment processing']
  },
  {
    name: 'Next.js Documentation',
    type: 'documentation',
    elements: {
      buttons: 12,
      forms: 1,
      navigation: 2,
      modals: 2,
      iframes: 0,
      shadowDom: false,
      dynamicContent: true
    },
    frameworks: ['Next.js', 'React', 'MDX'],
    characteristics: {
      spa: true,
      ssr: true,
      pwa: true,
      hasServiceWorker: true,
      hasCustomElements: false
    },
    challenges: ['Code highlighting', 'Search functionality', 'Markdown rendering']
  },
  {
    name: 'Legacy Corporate Site',
    type: 'portfolio',
    elements: {
      buttons: 15,
      forms: 2,
      navigation: 1,
      modals: 1,
      iframes: 5,
      shadowDom: false,
      dynamicContent: false
    },
    frameworks: ['jQuery', 'Bootstrap 3'],
    characteristics: {
      spa: false,
      ssr: true,
      pwa: false,
      hasServiceWorker: false,
      hasCustomElements: false
    },
    challenges: ['Legacy code', 'Browser compatibility', 'Security constraints']
  }
]

export class UniversalCompatibilityTest {
  private tutorialSystem: VoiceTutorialSystem | null = null
  private audioService: AudioWorkletIntegrationService | null = null
  private testResults: CompatibilityTestResult[] = []

  constructor(
    tutorialSystem: VoiceTutorialSystem,
    audioService: AudioWorkletIntegrationService
  ) {
    this.tutorialSystem = tutorialSystem
    this.audioService = audioService
  }

  /**
   * Run comprehensive compatibility tests
   */
  async runCompatibilityTests(): Promise<UniversalCompatibilityReport> {
    console.log('Starting universal compatibility tests...')

    this.testResults = []

    for (const websiteStructure of WEBSITE_STRUCTURES) {
      console.log(`Testing: ${websiteStructure.name}`)

      try {
        const result = await this.testWebsiteStructure(websiteStructure)
        this.testResults.push(result)
      } catch (error) {
        console.error(`Test failed for ${websiteStructure.name}:`, error)
        this.testResults.push(this.createFailedResult(websiteStructure, error))
      }
    }

    return this.generateReport()
  }

  /**
   * Test specific website structure
   */
  private async testWebsiteStructure(structure: WebsiteStructure): Promise<CompatibilityTestResult> {
    const startTime = Date.now()

    // Simulate website environment
    await this.simulateWebsiteEnvironment(structure)

    const result: CompatibilityTestResult = {
      websiteType: structure.name,
      passed: false,
      score: 0,
      details: {
        tutorialLaunch: false,
        voiceRecognition: false,
        contextualHelp: false,
        accessibility: false,
        performance: false,
        uiRendering: false,
        navigation: false,
        errorHandling: false
      },
      issues: [],
      metrics: {
        launchTime: 0,
        responseTime: 0,
        memoryUsage: 0,
        errorCount: 0
      }
    }

    // Test tutorial launch
    result.details.tutorialLaunch = await this.testTutorialLaunch(structure)
    if (!result.details.tutorialLaunch) {
      result.issues.push({
        severity: 'critical',
        component: 'TutorialSystem',
        description: 'Failed to launch tutorial system',
        suggestion: 'Check initialization dependencies and error handling'
      })
    }

    // Test voice recognition
    result.details.voiceRecognition = await this.testVoiceRecognition(structure)
    if (!result.details.voiceRecognition) {
      result.issues.push({
        severity: 'high',
        component: 'VoiceEngine',
        description: 'Voice recognition not functioning',
        suggestion: 'Verify AudioWorklet compatibility and permissions'
      })
    }

    // Test contextual help
    result.details.contextualHelp = await this.testContextualHelp(structure)
    if (!result.details.contextualHelp) {
      result.issues.push({
        severity: 'medium',
        component: 'ContextualHelp',
        description: 'Contextual help not adapting to page structure',
        suggestion: 'Improve DOM analysis and element detection'
      })
    }

    // Test accessibility
    result.details.accessibility = await this.testAccessibility(structure)
    if (!result.details.accessibility) {
      result.issues.push({
        severity: 'high',
        component: 'Accessibility',
        description: 'Accessibility features not working correctly',
        suggestion: 'Review ARIA labels and keyboard navigation'
      })
    }

    // Test performance
    result.details.performance = await this.testPerformance(structure)
    if (!result.details.performance) {
      result.issues.push({
        severity: 'medium',
        component: 'Performance',
        description: 'Performance below target thresholds',
        suggestion: 'Optimize initialization and reduce memory usage'
      })
    }

    // Test UI rendering
    result.details.uiRendering = await this.testUIRendering(structure)
    if (!result.details.uiRendering) {
      result.issues.push({
        severity: 'medium',
        component: 'UI',
        description: 'UI components not rendering correctly',
        suggestion: 'Check CSS conflicts and z-index issues'
      })
    }

    // Test navigation
    result.details.navigation = await this.testNavigation(structure)
    if (!result.details.navigation) {
      result.issues.push({
        severity: 'medium',
        component: 'Navigation',
        description: 'Navigation commands not working',
        suggestion: 'Improve element selection and routing detection'
      })
    }

    // Test error handling
    result.details.errorHandling = await this.testErrorHandling(structure)
    if (!result.details.errorHandling) {
      result.issues.push({
        severity: 'low',
        component: 'ErrorHandling',
        description: 'Error handling could be improved',
        suggestion: 'Add more robust error recovery mechanisms'
      })
    }

    // Calculate metrics
    result.metrics.launchTime = Date.now() - startTime
    result.metrics.responseTime = await this.measureResponseTime(structure)
    result.metrics.memoryUsage = this.estimateMemoryUsage()
    result.metrics.errorCount = result.issues.filter(i => i.severity === 'critical' || i.severity === 'high').length

    // Calculate overall score
    const passedTests = Object.values(result.details).filter(Boolean).length
    result.score = (passedTests / Object.keys(result.details).length) * 100
    result.passed = result.score >= 80 && result.issues.filter(i => i.severity === 'critical').length === 0

    return result
  }

  /**
   * Simulate website environment
   */
  private async simulateWebsiteEnvironment(structure: WebsiteStructure): Promise<void> {
    // Simulate DOM structure
    this.createSimulatedDOM(structure)

    // Simulate framework environment
    await this.simulateFrameworkEnvironment(structure)

    // Simulate content loading
    if (structure.elements.dynamicContent) {
      await this.simulateDynamicContent()
    }
  }

  private createSimulatedDOM(structure: WebsiteStructure): void {
    // Clear existing content
    const testContainer = document.getElementById('compatibility-test-container')
    if (testContainer) {
      testContainer.remove()
    }

    // Create test container
    const container = document.createElement('div')
    container.id = 'compatibility-test-container'
    container.style.cssText = 'position: absolute; top: -9999px; left: -9999px; width: 1000px; height: 1000px;'

    // Add buttons
    for (let i = 0; i < structure.elements.buttons; i++) {
      const button = document.createElement('button')
      button.textContent = `Button ${i + 1}`
      button.className = `test-button test-button-${i}`
      container.appendChild(button)
    }

    // Add forms
    for (let i = 0; i < structure.elements.forms; i++) {
      const form = document.createElement('form')
      form.className = `test-form test-form-${i}`

      const input = document.createElement('input')
      input.type = 'text'
      input.placeholder = `Input ${i + 1}`
      form.appendChild(input)

      const submit = document.createElement('button')
      submit.type = 'submit'
      submit.textContent = 'Submit'
      form.appendChild(submit)

      container.appendChild(form)
    }

    // Add navigation
    for (let i = 0; i < structure.elements.navigation; i++) {
      const nav = document.createElement('nav')
      nav.className = `test-nav test-nav-${i}`

      const ul = document.createElement('ul')
      for (let j = 0; j < 5; j++) {
        const li = document.createElement('li')
        const a = document.createElement('a')
        a.href = `#test-link-${i}-${j}`
        a.textContent = `Nav Link ${j + 1}`
        li.appendChild(a)
        ul.appendChild(li)
      }
      nav.appendChild(ul)
      container.appendChild(nav)
    }

    // Add Shadow DOM if supported
    if (structure.elements.shadowDom && 'attachShadow' in Element.prototype) {
      const shadowHost = document.createElement('div')
      shadowHost.className = 'shadow-host'
      const shadow = shadowHost.attachShadow({ mode: 'open' })

      const shadowButton = document.createElement('button')
      shadowButton.textContent = 'Shadow DOM Button'
      shadow.appendChild(shadowButton)

      container.appendChild(shadowHost)
    }

    document.body.appendChild(container)
  }

  private async simulateFrameworkEnvironment(structure: WebsiteStructure): Promise<void> {
    // Simulate framework-specific behaviors
    if (structure.frameworks.includes('React')) {
      // Simulate React-specific DOM mutations
      await this.simulateReactEnvironment()
    }

    if (structure.frameworks.includes('Vue.js')) {
      // Simulate Vue-specific reactivity
      await this.simulateVueEnvironment()
    }

    if (structure.frameworks.includes('Angular')) {
      // Simulate Angular-specific behaviors
      await this.simulateAngularEnvironment()
    }
  }

  private async simulateReactEnvironment(): Promise<void> {
    // Simulate React fiber reconciliation delays
    await new Promise(resolve => setTimeout(resolve, 50))

    // Simulate virtual DOM updates
    const buttons = document.querySelectorAll('.test-button')
    buttons.forEach((button, index) => {
      if (index % 2 === 0) {
        button.setAttribute('data-react-updated', 'true')
      }
    })
  }

  private async simulateVueEnvironment(): Promise<void> {
    // Simulate Vue reactivity delays
    await new Promise(resolve => setTimeout(resolve, 30))

    // Simulate v-model updates
    const inputs = document.querySelectorAll('input')
    inputs.forEach(input => {
      input.setAttribute('data-vue-model', 'test')
    })
  }

  private async simulateAngularEnvironment(): Promise<void> {
    // Simulate Angular change detection
    await new Promise(resolve => setTimeout(resolve, 40))

    // Simulate Angular directives
    const elements = document.querySelectorAll('[class*="test-"]')
    elements.forEach(el => {
      el.setAttribute('ng-reflect-test', 'true')
    })
  }

  private async simulateDynamicContent(): Promise<void> {
    // Simulate dynamic content loading
    await new Promise(resolve => setTimeout(resolve, 100))

    // Add dynamic elements
    const container = document.getElementById('compatibility-test-container')
    if (container) {
      const dynamicDiv = document.createElement('div')
      dynamicDiv.className = 'dynamic-content'
      dynamicDiv.innerHTML = '<button>Dynamic Button</button><p>Dynamic content loaded</p>'
      container.appendChild(dynamicDiv)
    }
  }

  /**
   * Individual test methods
   */
  private async testTutorialLaunch(structure: WebsiteStructure): Promise<boolean> {
    try {
      if (!this.tutorialSystem) {return false}

      const sessionId = await this.tutorialSystem.startOnboarding({
        websiteType: structure.type,
        framework: structure.frameworks[0]
      })

      return typeof sessionId === 'string' && sessionId.length > 0
    } catch (error) {
      console.error('Tutorial launch test failed:', error)
      return false
    }
  }

  private async testVoiceRecognition(_structure: WebsiteStructure): Promise<boolean> {
    try {
      if (!this.audioService) {return false}

      const status = this.audioService.getStatus()
      return status.mode !== 'disabled' && status.healthScore > 0
    } catch (error) {
      console.error('Voice recognition test failed:', error)
      return false
    }
  }

  private async testContextualHelp(structure: WebsiteStructure): Promise<boolean> {
    try {
      if (!this.tutorialSystem) {return false}

      // Test if contextual help can analyze the simulated DOM
      await this.tutorialSystem.updateUserContext({
        pageType: structure.type,
        domElements: {
          buttons: structure.elements.buttons,
          forms: structure.elements.forms
        }
      })

      const help = await this.tutorialSystem.requestHelp()
      return Array.isArray(help) && help.length > 0
    } catch (error) {
      console.error('Contextual help test failed:', error)
      return false
    }
  }

  private async testAccessibility(_structure: WebsiteStructure): Promise<boolean> {
    try {
      // Check for accessibility features
      const hasAriaLabels = document.querySelectorAll('[aria-label]').length > 0
      const hasRoles = document.querySelectorAll('[role]').length > 0

      // Test keyboard navigation
      const focusableElements = document.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )

      return hasAriaLabels && hasRoles && focusableElements.length > 0
    } catch (error) {
      console.error('Accessibility test failed:', error)
      return false
    }
  }

  private async testPerformance(_structure: WebsiteStructure): Promise<boolean> {
    try {
      const startTime = performance.now()

      // Simulate tutorial operations
      if (this.tutorialSystem) {
        // Basic availability check
        this.tutorialSystem.getSystemStatus()
        this.tutorialSystem.getAvailableTutorials()
      }

      const endTime = performance.now()
      const duration = endTime - startTime

      // Performance thresholds
      const maxLaunchTime = 200 // ms
      const memoryUsage = this.estimateMemoryUsage()
      const maxMemoryUsage = 50 // MB

      return duration < maxLaunchTime && memoryUsage < maxMemoryUsage
    } catch (error) {
      console.error('Performance test failed:', error)
      return false
    }
  }

  private async testUIRendering(_structure: WebsiteStructure): Promise<boolean> {
    try {
      // Test if UI components can render without conflicts
      const container = document.getElementById('compatibility-test-container')
      if (!container) {return false}

      // Simulate tutorial UI rendering
      const testModal = document.createElement('div')
      testModal.className = 'tutorial-test-modal'
      testModal.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        z-index: 10000;
        background: white;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      `
      testModal.innerHTML = '<p>Test tutorial modal</p><button>Test Button</button>'

      document.body.appendChild(testModal)

      // Check if modal is visible and properly positioned
      const rect = testModal.getBoundingClientRect()
      const isVisible = rect.width > 0 && rect.height > 0
      const isOnScreen = rect.top >= 0 && rect.left >= 0

      // Cleanup
      testModal.remove()

      return isVisible && isOnScreen
    } catch (error) {
      console.error('UI rendering test failed:', error)
      return false
    }
  }

  private async testNavigation(_structure: WebsiteStructure): Promise<boolean> {
    try {
      // Test if navigation elements can be detected and interacted with
      const navElements = document.querySelectorAll('nav, [role="navigation"]')
      const links = document.querySelectorAll('a[href]')
      const buttons = document.querySelectorAll('button')

      // Check if elements are detectable
      const hasNavigation = navElements.length > 0 || links.length > 0
      const hasInteraction = buttons.length > 0

      // Test click simulation
      if (buttons.length > 0) {
        const testButton = buttons[0] as HTMLElement
        const clickEvent = new MouseEvent('click', { bubbles: true })
        testButton.dispatchEvent(clickEvent)
      }

      return hasNavigation && hasInteraction
    } catch (error) {
      console.error('Navigation test failed:', error)
      return false
    }
  }

  private async testErrorHandling(_structure: WebsiteStructure): Promise<boolean> {
    try {
      // Test error handling by simulating errors
      let errorsCaught = 0

      // Test with invalid commands
      try {
        if (this.tutorialSystem) {
          await this.tutorialSystem.processVoiceCommand('invalid-session', 'invalid command', 0.5)
        }
      } catch (error) {
        errorsCaught++
      }

      // Test with invalid help requests
      try {
        if (this.tutorialSystem) {
          await this.tutorialSystem.requestHelp('nonexistent feature')
        }
        errorsCaught++
      } catch (error) {
        // Expected to handle gracefully
      }

      // Error handling is good if errors are caught and handled gracefully
      return errorsCaught > 0
    } catch (error) {
      console.error('Error handling test failed:', error)
      return false
    }
  }

  private async measureResponseTime(structure: WebsiteStructure): Promise<number> {
    const startTime = performance.now()

    try {
      // Simulate user interaction
      if (this.tutorialSystem) {
        await this.tutorialSystem.updateUserContext({
          pageType: structure.type
        })
      }
    } catch (error) {
      // Response time includes error handling time
    }

    return performance.now() - startTime
  }

  private estimateMemoryUsage(): number {
    // Rough estimation of memory usage using Performance Memory API
    const hasMemoryAPI = (perf: Performance): perf is Performance & { memory: { usedJSHeapSize: number } } => {
      return 'memory' in perf && 
        typeof ((perf as unknown as { memory?: { usedJSHeapSize?: unknown } }).memory?.usedJSHeapSize) === 'number';
    };
    
    if (hasMemoryAPI(performance)) {
      return performance.memory.usedJSHeapSize / (1024 * 1024); // Convert to MB
    }
    return 0; // Fallback if memory API not available
  }

  private createFailedResult(structure: WebsiteStructure, error: any): CompatibilityTestResult {
    return {
      websiteType: structure.name,
      passed: false,
      score: 0,
      details: {
        tutorialLaunch: false,
        voiceRecognition: false,
        contextualHelp: false,
        accessibility: false,
        performance: false,
        uiRendering: false,
        navigation: false,
        errorHandling: false
      },
      issues: [
        {
          severity: 'critical',
          component: 'System',
          description: `Test failed with error: ${error?.message || 'Unknown error'}`,
          suggestion: 'Check system initialization and dependencies'
        }
      ],
      metrics: {
        launchTime: 0,
        responseTime: 0,
        memoryUsage: 0,
        errorCount: 1
      }
    }
  }

  private generateReport(): UniversalCompatibilityReport {
    const passedTests = this.testResults.filter(result => result.passed).length
    const failedTests = this.testResults.length - passedTests
    const overallCompatibility = this.testResults.length > 0
      ? this.testResults.reduce((sum, result) => sum + result.score, 0) / this.testResults.length
      : 0

    // Collect critical issues
    const criticalIssues = this.testResults
      .flatMap(result => result.issues.filter(issue => issue.severity === 'critical'))
      .reduce((acc, issue) => {
        const existing = acc.find(item => item.issue === issue.description)
        if (existing) {
          existing.affectedSites.push(this.testResults.find(r => r.issues.includes(issue))?.websiteType || 'Unknown')
        } else {
          acc.push({
            issue: issue.description,
            affectedSites: [this.testResults.find(r => r.issues.includes(issue))?.websiteType || 'Unknown'],
            priority: 1
          })
        }
        return acc
      }, [] as Array<{ issue: string; affectedSites: string[]; priority: number }>)

    // Generate recommendations
    const recommendations = this.generateRecommendations()

    return {
      overallCompatibility,
      testedWebsites: this.testResults.length,
      passedTests,
      failedTests,
      results: this.testResults,
      recommendations,
      criticalIssues
    }
  }

  private generateRecommendations(): string[] {
    const recommendations: string[] = []

    // Analyze common issues
    const commonIssues = this.testResults
      .flatMap(result => result.issues)
      .reduce((acc, issue) => {
        acc[issue.component] = (acc[issue.component] || 0) + 1
        return acc
      }, {} as Record<string, number>)

    // Generate recommendations based on issues
    Object.entries(commonIssues).forEach(([component, count]) => {
      if (count >= this.testResults.length * 0.5) {
        switch (component) {
          case 'VoiceEngine':
            recommendations.push('Improve voice engine compatibility across different browser environments')
            break
          case 'Accessibility':
            recommendations.push('Enhance accessibility features for better universal support')
            break
          case 'Performance':
            recommendations.push('Optimize performance for slower devices and networks')
            break
          case 'UI':
            recommendations.push('Improve UI component compatibility with different CSS frameworks')
            break
        }
      }
    })

    // Performance recommendations
    const avgLaunchTime = this.testResults.reduce((sum, result) => sum + result.metrics.launchTime, 0) / this.testResults.length
    if (avgLaunchTime > 200) {
      recommendations.push('Optimize tutorial launch time for better user experience')
    }

    // Error handling recommendations
    const avgErrors = this.testResults.reduce((sum, result) => sum + result.metrics.errorCount, 0) / this.testResults.length
    if (avgErrors > 1) {
      recommendations.push('Implement more robust error handling and graceful degradation')
    }

    return recommendations
  }

  /**
   * Cleanup test environment
   */
  cleanup(): void {
    // Remove test containers
    const testContainer = document.getElementById('compatibility-test-container')
    if (testContainer) {
      testContainer.remove()
    }

    // Clean up any test modals
    const testModals = document.querySelectorAll('.tutorial-test-modal')
    testModals.forEach(modal => modal.remove())

    // Reset test results
    this.testResults = []
  }
}

// Factory function
export function createUniversalCompatibilityTest(
  tutorialSystem: VoiceTutorialSystem,
  audioService: AudioWorkletIntegrationService
): UniversalCompatibilityTest {
  return new UniversalCompatibilityTest(tutorialSystem, audioService)
}

// Utility function to run quick compatibility check
export async function runQuickCompatibilityCheck(
  tutorialSystem: VoiceTutorialSystem,
  audioService: AudioWorkletIntegrationService
): Promise<boolean> {
  const tester = createUniversalCompatibilityTest(tutorialSystem, audioService)

  try {
    const report = await tester.runCompatibilityTests()
    return report.overallCompatibility >= 80 && report.criticalIssues.length === 0
  } catch (error) {
    console.error('Quick compatibility check failed:', error)
    return false
  } finally {
    tester.cleanup()
  }
}