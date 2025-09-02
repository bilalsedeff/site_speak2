import React from 'react'
import { useDrag } from 'react-dnd'
import { 
  Type, 
  Square, 
  Image, 
  MousePointer, 
  Layout,
  Mic,
  BarChart3
} from 'lucide-react'

import type { EditorComponent } from '../types/editor'

// Available components for the palette
const COMPONENT_PALETTE: EditorComponent[] = [
  {
    name: 'Button',
    displayName: 'Button',
    category: 'ui',
    icon: 'MousePointer',
    metadata: {
      name: 'Button',
      version: '1.0.0',
      description: 'Interactive button component',
      category: 'ui',
      tags: ['interactive', 'form', 'action'],
      props: {},
      requiredProps: [],
      defaultProps: { children: 'Click me', variant: 'default' },
      variants: {},
    },
    defaultProps: { 
      children: 'Click me',
      variant: 'default',
      size: 'default'
    },
    previewProps: { 
      children: 'Preview Button',
      variant: 'outline'
    },
  },
  {
    name: 'Text',
    displayName: 'Text',
    category: 'content',
    icon: 'Type',
    metadata: {
      name: 'Text',
      version: '1.0.0',
      description: 'Text content component',
      category: 'content',
      tags: ['text', 'content'],
      props: {},
      requiredProps: [],
      defaultProps: { text: 'Sample text' },
      variants: {},
    },
    defaultProps: { 
      text: 'Your text here',
      fontSize: 'base',
      fontWeight: 'normal'
    },
    previewProps: { 
      text: 'Sample Text'
    },
  },
  {
    name: 'Image',
    displayName: 'Image',
    category: 'content',
    icon: 'Image',
    metadata: {
      name: 'Image',
      version: '1.0.0',
      description: 'Image display component',
      category: 'content',
      tags: ['media', 'image'],
      props: {},
      requiredProps: [],
      defaultProps: { src: '', alt: '' },
      variants: {},
    },
    defaultProps: { 
      src: 'https://via.placeholder.com/300x200',
      alt: 'Placeholder image',
      width: '100%',
      height: 'auto'
    },
    previewProps: { 
      src: 'https://via.placeholder.com/150x100',
      alt: 'Preview image'
    },
  },
  {
    name: 'Card',
    displayName: 'Card',
    category: 'layout',
    icon: 'Square',
    metadata: {
      name: 'Card',
      version: '1.0.0',
      description: 'Container card component',
      category: 'layout',
      tags: ['container', 'card', 'layout'],
      props: {},
      requiredProps: [],
      defaultProps: { title: '', description: '' },
      variants: {},
    },
    defaultProps: { 
      title: 'Card Title',
      description: 'Card description goes here'
    },
    previewProps: { 
      title: 'Preview Card',
      description: 'Sample card'
    },
  },
  {
    name: 'Container',
    displayName: 'Container',
    category: 'layout',
    icon: 'Layout',
    metadata: {
      name: 'Container',
      version: '1.0.0',
      description: 'Layout container component',
      category: 'layout',
      tags: ['container', 'layout', 'wrapper'],
      props: {},
      requiredProps: [],
      defaultProps: {},
      variants: {},
    },
    defaultProps: { 
      padding: 'medium',
      background: 'transparent'
    },
    previewProps: {},
  },
]

// Component categories
const CATEGORIES = [
  { id: 'all', label: 'All Components', icon: Layout },
  { id: 'ui', label: 'UI Components', icon: MousePointer },
  { id: 'content', label: 'Content', icon: Type },
  { id: 'layout', label: 'Layout', icon: Layout },
  { id: 'voice', label: 'Voice AI', icon: Mic },
]

interface ComponentPaletteProps {
  selectedCategory?: string
  onCategoryChange?: (category: string) => void
}

export function ComponentPalette({
  selectedCategory = 'all',
  onCategoryChange,
}: ComponentPaletteProps) {
  // Filter components by category
  const filteredComponents = selectedCategory === 'all' 
    ? COMPONENT_PALETTE
    : COMPONENT_PALETTE.filter(comp => comp.category === selectedCategory)

  return (
    <div className="component-palette">
      {/* Category Filter */}
      <div className="mb-4">
        <label className="form-label">Component Category</label>
        <div className="flex flex-wrap gap-1 mt-2">
          {CATEGORIES.map((category) => {
            const Icon = category.icon
            return (
              <button
                key={category.id}
                onClick={() => onCategoryChange?.(category.id)}
                className={`
                  inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-full
                  touch-target-ios transition-colors
                  ${selectedCategory === category.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  }
                `}
              >
                <Icon className="h-3 w-3 mr-1" aria-hidden="true" />
                {category.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Component Grid */}
      <div className="grid grid-cols-2 gap-3">
        {filteredComponents.map((component) => (
          <DraggableComponent
            key={component.name}
            component={component}
          />
        ))}
      </div>

      {/* Empty State */}
      {filteredComponents.length === 0 && (
        <div className="empty-state">
          <Layout className="empty-state-icon" />
          <h3 className="empty-state-title">No Components</h3>
          <p className="empty-state-description">
            No components found in this category
          </p>
        </div>
      )}
    </div>
  )
}

// Draggable Component Item
interface DraggableComponentProps {
  component: EditorComponent
}

function DraggableComponent({ component }: DraggableComponentProps) {
  const [{ isDragging }, drag] = useDrag({
    type: 'component',
    item: {
      type: 'component',
      componentName: component.name,
      metadata: component.metadata,
    },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  })

  const getIcon = (iconName: string) => {
    const icons: Record<string, any> = {
      MousePointer,
      Type,
      Image,
      Square,
      Layout,
      Mic,
      BarChart3,
    }
    return icons[iconName] || Layout
  }

  const Icon = getIcon(component.icon)

  return (
    <div
      ref={drag}
      className={`
        draggable-component group
        ${isDragging ? 'opacity-50 scale-95' : ''}
      `}
      style={{
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      {/* Component Icon */}
      <div className="w-12 h-12 mx-auto mb-3 bg-primary/10 rounded-lg flex items-center justify-center group-hover:bg-primary/20 transition-colors">
        <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
      </div>

      {/* Component Info */}
      <div className="text-center">
        <h4 className="text-sm font-medium text-foreground mb-1">
          {component.displayName}
        </h4>
        <p className="text-xs text-muted-foreground line-clamp-2">
          {component.metadata.description}
        </p>
      </div>

      {/* Category Badge */}
      <div className="mt-2 text-center">
        <span className="inline-block px-2 py-1 text-xs bg-muted text-muted-foreground rounded-full">
          {component.category}
        </span>
      </div>
    </div>
  )
}