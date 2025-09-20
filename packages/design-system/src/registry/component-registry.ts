import { componentRegistry } from '../utils/component-metadata'
import { ButtonMetadata } from '../components/Button'
import { CardMetadata } from '../components/Card'
import { VoiceWidgetMetadata } from '../components/VoiceWidget'

/**
 * Initialize and register all design system components
 * This ensures components are available in the component palette
 */
export function initializeComponentRegistry() {
  // Register all implemented components with their metadata
  componentRegistry.register(ButtonMetadata)
  componentRegistry.register(CardMetadata)
  componentRegistry.register(VoiceWidgetMetadata)
}

/**
 * Get all components formatted for the editor palette
 */
export function getEditorComponents() {
  return componentRegistry.getAll().map(metadata => ({
    name: metadata.name,
    displayName: metadata.name,
    category: metadata.category,
    icon: getComponentIcon(metadata.name),
    metadata,
    defaultProps: metadata.defaultProps || {},
    previewProps: generatePreviewProps(metadata),
  }))
}

/**
 * Get components by category for the editor palette
 */
export function getEditorComponentsByCategory(category: string) {
  if (category === 'all') {
    return getEditorComponents()
  }
  return componentRegistry.getByCategory(category as any).map(metadata => ({
    name: metadata.name,
    displayName: metadata.name,
    category: metadata.category,
    icon: getComponentIcon(metadata.name),
    metadata,
    defaultProps: metadata.defaultProps || {},
    previewProps: generatePreviewProps(metadata),
  }))
}

/**
 * Map component names to Lucide icons
 */
function getComponentIcon(componentName: string): string {
  const iconMap: Record<string, string> = {
    'Button': 'MousePointer',
    'Card': 'Square',
    'Text': 'Type',
    'Image': 'Image',
    'Container': 'Layout',
    'VoiceWidget': 'Mic',
    'Input': 'Edit3',
    'Select': 'ChevronDown',
    'Checkbox': 'CheckSquare',
    'Radio': 'Circle',
    'Textarea': 'FileText',
    'Link': 'ExternalLink',
    'Heading': 'Heading',
    'Paragraph': 'AlignLeft',
    'List': 'List',
    'Divider': 'Minus',
    'Spacer': 'Square',
  }

  return iconMap[componentName] || 'Layout'
}

/**
 * Generate appropriate preview props for a component
 */
function generatePreviewProps(metadata: any) {
  const defaultProps = metadata.defaultProps || {}

  // Component-specific preview props
  switch (metadata.name) {
    case 'Button':
      return {
        ...defaultProps,
        children: 'Preview',
        variant: 'outline',
        size: 'sm',
      }

    case 'Card':
      return {
        ...defaultProps,
        title: 'Preview Card',
        description: 'Sample content',
        padding: 'sm',
      }

    case 'VoiceWidget':
      return {
        ...defaultProps,
        size: 'sm',
        position: 'bottom-right',
        autoOpen: false,
      }

    default:
      // For unknown components, use defaults with minimal preview adjustments
      return {
        ...defaultProps,
        ...(defaultProps.children && { children: 'Preview' }),
        ...(defaultProps.text && { text: 'Sample text' }),
        ...(defaultProps.size && { size: 'sm' }),
      }
  }
}

/**
 * Get available component categories
 */
export function getComponentCategories() {
  const components = componentRegistry.getAll()
  const categories = new Set(components.map(c => c.category))

  return [
    { id: 'all', label: 'All Components', icon: 'Layout' },
    { id: 'ui', label: 'UI Components', icon: 'MousePointer' },
    { id: 'content', label: 'Content', icon: 'Type' },
    { id: 'layout', label: 'Layout', icon: 'Layout' },
    { id: 'voice', label: 'Voice AI', icon: 'Mic' },
    { id: 'form', label: 'Forms', icon: 'Edit3' },
  ].filter(category =>
    category.id === 'all' || categories.has(category.id as any)
  )
}

// Auto-initialize when imported
initializeComponentRegistry()