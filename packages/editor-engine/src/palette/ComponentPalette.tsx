import { useDrag } from 'react-dnd'
import {
  Type,
  Square,
  Image,
  MousePointer,
  Layout,
  Mic,
  BarChart3,
  Edit3,
  ExternalLink,
  Heading,
  AlignLeft,
  List,
  Minus,
  CheckSquare,
  Circle,
  FileText,
  ChevronDown
} from 'lucide-react'

import { getEditorComponents, getEditorComponentsByCategory, getComponentCategories } from '@sitespeak/design-system'
import type { EditorComponent } from '../types/editor'

// Helper to get icon component from string name
function getIconComponent(iconName: string) {
  const icons: Record<string, any> = {
    MousePointer,
    Type,
    Image,
    Square,
    Layout,
    Mic,
    BarChart3,
    Edit3,
    ExternalLink,
    Heading,
    AlignLeft,
    List,
    Minus,
    CheckSquare,
    Circle,
    FileText,
    ChevronDown,
  }
  return icons[iconName] || Layout
}

// Get components from design system registry
function getAvailableComponents(): EditorComponent[] {
  return getEditorComponents()
}

// Get component categories from design system
function getAvailableCategories() {
  return getComponentCategories().map(category => ({
    ...category,
    icon: getIconComponent(category.icon)
  }))
}

interface ComponentPaletteProps {
  selectedCategory?: string
  onCategoryChange?: (category: string) => void
}

export function ComponentPalette({
  selectedCategory = 'all',
  onCategoryChange,
}: ComponentPaletteProps) {
  // Get components from design system registry
  const availableComponents = getAvailableComponents()
  const availableCategories = getAvailableCategories()

  // Filter components by category
  const filteredComponents = selectedCategory === 'all'
    ? availableComponents
    : getEditorComponentsByCategory(selectedCategory)

  return (
    <div className="component-palette">
      {/* Category Filter */}
      <div className="mb-4">
        <label className="form-label">Component Category</label>
        <div className="flex flex-wrap gap-1 mt-2">
          {availableCategories.map((category) => {
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
    return getIconComponent(iconName)
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