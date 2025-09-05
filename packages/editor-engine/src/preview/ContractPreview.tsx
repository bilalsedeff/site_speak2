import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  FileText, 
  Code, 
  CheckCircle, 
  AlertCircle, 
  ExternalLink,
  Download,
  Eye,
  EyeOff 
} from 'lucide-react'

import { useEditorStore } from '../store/editorStore'

type PreviewTab = 'overview' | 'jsonld' | 'actions' | 'aria' | 'sitemap'

export function ContractPreview() {
  const [activeTab, setActiveTab] = useState<PreviewTab>('overview')
  const [isMinified, setIsMinified] = useState(false)
  
  // Tab components access editor store directly

  const tabs = [
    { id: 'overview' as const, label: 'Overview', icon: FileText },
    { id: 'jsonld' as const, label: 'JSON-LD', icon: Code },
    { id: 'actions' as const, label: 'Actions', icon: Code },
    { id: 'aria' as const, label: 'ARIA', icon: CheckCircle },
    { id: 'sitemap' as const, label: 'Sitemap', icon: ExternalLink },
  ]

  return (
    <div className="contract-preview h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-lg max-heading-width">
            Site Contract Preview
          </h3>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIsMinified(!isMinified)}
              className="p-2 hover:bg-muted rounded-lg touch-target-ios"
              title={isMinified ? 'Show formatted' : 'Show minified'}
            >
              {isMinified ? (
                <Eye className="h-4 w-4" />
              ) : (
                <EyeOff className="h-4 w-4" />
              )}
            </button>
            
            <button
              onClick={() => downloadContract()}
              className="p-2 hover:bg-muted rounded-lg touch-target-ios"
              title="Download contract"
            >
              <Download className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-1 overflow-x-auto">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`
                inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-lg
                touch-target-ios whitespace-nowrap transition-colors
                ${activeTab === id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }
              `}
            >
              <Icon className="h-4 w-4 mr-2" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="p-4"
          >
            {activeTab === 'overview' && <OverviewTab />}
            {activeTab === 'jsonld' && <JsonLdTab minified={isMinified} />}
            {activeTab === 'actions' && <ActionsTab minified={isMinified} />}
            {activeTab === 'aria' && <AriaTab />}
            {activeTab === 'sitemap' && <SitemapTab />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

// Overview Tab Component
function OverviewTab() {
  const { instances, validationErrors } = useEditorStore()
  
  const stats = {
    totalComponents: instances.length,
    validComponents: instances.length - validationErrors.length,
    errorCount: validationErrors.filter(e => e.severity === 'error').length,
    warningCount: validationErrors.filter(e => e.severity === 'warning').length,
  }

  return (
    <div className="space-y-6">
      {/* Statistics */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-muted/50 rounded-lg p-4">
          <div className="text-sm text-muted-foreground">Components</div>
          <div className="text-2xl font-bold">{stats.totalComponents}</div>
        </div>
        
        <div className="bg-muted/50 rounded-lg p-4">
          <div className="text-sm text-muted-foreground">Valid</div>
          <div className="text-2xl font-bold text-green-600">{stats.validComponents}</div>
        </div>
        
        <div className="bg-muted/50 rounded-lg p-4">
          <div className="text-sm text-muted-foreground">Errors</div>
          <div className="text-2xl font-bold text-red-600">{stats.errorCount}</div>
        </div>
        
        <div className="bg-muted/50 rounded-lg p-4">
          <div className="text-sm text-muted-foreground">Warnings</div>
          <div className="text-2xl font-bold text-yellow-600">{stats.warningCount}</div>
        </div>
      </div>

      {/* Contract Status */}
      <div className="space-y-3">
        <h4 className="font-medium">Contract Status</h4>
        
        <div className="space-y-2">
          <div className="flex items-center space-x-3">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <span className="text-sm">JSON-LD structured data</span>
          </div>
          
          <div className="flex items-center space-x-3">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <span className="text-sm">Action manifest generated</span>
          </div>
          
          <div className="flex items-center space-x-3">
            <AlertCircle className="h-5 w-5 text-yellow-600" />
            <span className="text-sm">ARIA audit in progress</span>
          </div>
          
          <div className="flex items-center space-x-3">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <span className="text-sm">Sitemap ready</span>
          </div>
        </div>
      </div>

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-medium">Validation Issues</h4>
          
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {validationErrors.map((error, index) => (
              <div
                key={index}
                className={`p-3 rounded-lg border ${
                  error.severity === 'error'
                    ? 'bg-red-50 border-red-200 text-red-800 dark:bg-red-950 dark:border-red-800 dark:text-red-200'
                    : 'bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-950 dark:border-yellow-800 dark:text-yellow-200'
                }`}
              >
                <div className="flex items-start space-x-2">
                  {error.severity === 'error' ? (
                    <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{error.message}</div>
                    {error.recommendation && (
                      <div className="text-xs mt-1 opacity-75">
                        {error.recommendation}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// JSON-LD Tab Component
function JsonLdTab({ minified }: { minified: boolean }) {
  const { contractData } = useEditorStore()
  
  const jsonLdOutput = JSON.stringify(contractData.jsonLd, null, minified ? 0 : 2)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium">Structured Data (JSON-LD)</h4>
        <span className="text-xs text-muted-foreground">
          Schema.org compliant
        </span>
      </div>
      
      <div className="bg-muted rounded-lg p-4 font-mono text-sm overflow-x-auto">
        <pre className="whitespace-pre-wrap max-reading-width">
          {jsonLdOutput || '// No JSON-LD data generated yet'}
        </pre>
      </div>
    </div>
  )
}

// Actions Tab Component
function ActionsTab({ minified }: { minified: boolean }) {
  const { contractData } = useEditorStore()
  
  const actionsOutput = JSON.stringify(contractData.actions, null, minified ? 0 : 2)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium">Action Manifest</h4>
        <span className="text-xs text-muted-foreground">
          Deterministic actions
        </span>
      </div>
      
      <div className="bg-muted rounded-lg p-4 font-mono text-sm overflow-x-auto">
        <pre className="whitespace-pre-wrap max-reading-width">
          {actionsOutput || '// No actions defined yet'}
        </pre>
      </div>
    </div>
  )
}

// ARIA Tab Component
function AriaTab() {
  return (
    <div className="space-y-4">
      <h4 className="font-medium">ARIA Accessibility Audit</h4>
      
      <div className="empty-state">
        <CheckCircle className="empty-state-icon" />
        <h3 className="empty-state-title">ARIA Audit</h3>
        <p className="empty-state-description">
          Accessibility audit will be generated when components are added
        </p>
      </div>
    </div>
  )
}

// Sitemap Tab Component  
function SitemapTab() {
  return (
    <div className="space-y-4">
      <h4 className="font-medium">XML Sitemap</h4>
      
      <div className="bg-muted rounded-lg p-4 font-mono text-sm overflow-x-auto">
        <pre className="whitespace-pre-wrap max-reading-width">
{`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`}
        </pre>
      </div>
    </div>
  )
}

// Download contract function
function downloadContract() {
  // This would generate and download the full contract
  console.log('Downloading site contract...')
}