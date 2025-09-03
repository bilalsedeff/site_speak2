import { useState } from 'react'
import { motion } from 'framer-motion'
import { useLocation } from 'wouter'
import { 
  Search, 
  Filter, 
  Grid3X3, 
  List, 
  Eye, 
  Star,
  Zap,
  Smartphone,
  ShoppingBag,
  Briefcase,
  Camera,
  Utensils,
  GraduationCap,
  Heart
} from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

// Template categories
const TEMPLATE_CATEGORIES = [
  { id: 'all', label: 'All Templates', icon: Grid3X3 },
  { id: 'business', label: 'Business', icon: Briefcase },
  { id: 'ecommerce', label: 'E-commerce', icon: ShoppingBag },
  { id: 'portfolio', label: 'Portfolio', icon: Camera },
  { id: 'restaurant', label: 'Restaurant', icon: Utensils },
  { id: 'education', label: 'Education', icon: GraduationCap },
  { id: 'health', label: 'Health & Wellness', icon: Heart },
  { id: 'mobile', label: 'Mobile-First', icon: Smartphone },
]

// Sample templates data
const TEMPLATES = [
  {
    id: 'modern-business',
    name: 'Modern Business',
    description: 'Clean and professional business website with voice assistant integration',
    category: 'business',
    preview: 'https://via.placeholder.com/400x300',
    features: ['Voice AI', 'Contact Forms', 'Analytics', 'SEO Optimized'],
    isPremium: false,
    rating: 4.8,
    uses: 1234,
  },
  {
    id: 'ecommerce-pro',
    name: 'E-commerce Pro',
    description: 'Full-featured online store with voice shopping assistant',
    category: 'ecommerce',
    preview: 'https://via.placeholder.com/400x300',
    features: ['Voice Shopping', 'Payment Integration', 'Inventory', 'Reviews'],
    isPremium: true,
    rating: 4.9,
    uses: 856,
  },
  {
    id: 'creative-portfolio',
    name: 'Creative Portfolio',
    description: 'Showcase your work with interactive voice-guided tours',
    category: 'portfolio',
    preview: 'https://via.placeholder.com/400x300',
    features: ['Voice Tours', 'Gallery', 'Contact', 'Blog'],
    isPremium: false,
    rating: 4.7,
    uses: 2341,
  },
  {
    id: 'restaurant-delight',
    name: 'Restaurant Delight',
    description: 'Voice-enabled menu browsing and table reservations',
    category: 'restaurant',
    preview: 'https://via.placeholder.com/400x300',
    features: ['Voice Menu', 'Reservations', 'Online Ordering', 'Reviews'],
    isPremium: true,
    rating: 4.6,
    uses: 678,
  },
]

type ViewMode = 'grid' | 'list'

/**
 * Templates Page following UI/UX guidelines:
 * - Catalog/List layout with sticky filters
 * - Card density toggle
 * - Infinite load with sentry trigger
 * - Speculation prefetch to detail
 */
export function Templates() {
  const [, setLocation] = useLocation()
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [searchQuery, setSearchQuery] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  // Filter templates
  const filteredTemplates = TEMPLATES.filter(template => {
    const matchesCategory = selectedCategory === 'all' || template.category === selectedCategory
    const matchesSearch = template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         template.description.toLowerCase().includes(searchQuery.toLowerCase())
    
    return matchesCategory && matchesSearch
  })

  const handleTemplateSelect = (templateId: string) => {
    setLocation(`/editor?template=${templateId}`)
  }

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-bold mb-2 max-heading-width">
            Website Templates
          </h1>
          <p className="text-muted-foreground max-reading-width">
            Start with a professionally designed template, complete with voice AI integration
          </p>
        </motion.div>

        <div className="layout-catalog">
          {/* Filters Sidebar */}
          <div className="layout-filters">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="space-y-6"
            >
              {/* Search */}
              <div className="form-group">
                <label className="form-label">Search Templates</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Search templates..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 form-input"
                  />
                </div>
              </div>

              {/* Categories */}
              <div className="form-group">
                <label className="form-label">Categories</label>
                <div className="space-y-2">
                  {TEMPLATE_CATEGORIES.map((category) => {
                    const Icon = category.icon
                    return (
                      <button
                        key={category.id}
                        onClick={() => setSelectedCategory(category.id)}
                        className={`
                          w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm
                          touch-target transition-colors text-left
                          ${selectedCategory === category.id
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                          }
                        `}
                      >
                        <Icon className="h-4 w-4" aria-hidden="true" />
                        <span>{category.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Filters Toggle (Mobile) */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className="w-full lg:hidden touch-target"
              >
                <Filter className="h-4 w-4 mr-2" />
                {showFilters ? 'Hide' : 'Show'} Filters
              </Button>
            </motion.div>
          </div>

          {/* Main Content */}
          <div className="layout-content">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              {/* Toolbar */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-4">
                  <span className="text-sm text-muted-foreground">
                    {filteredTemplates.length} template{filteredTemplates.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* View Toggle */}
                <div className="flex items-center space-x-2">
                  <div className="flex items-center space-x-1 bg-muted rounded-lg p-1">
                    <Button
                      variant={viewMode === 'grid' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setViewMode('grid')}
                      className="touch-target-ios"
                      aria-label="Grid view"
                    >
                      <Grid3X3 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={viewMode === 'list' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setViewMode('list')}
                      className="touch-target-ios"
                      aria-label="List view"
                    >
                      <List className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Templates Grid/List */}
              <div className={`
                ${viewMode === 'grid' 
                  ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'
                  : 'space-y-4'
                }
              `}>
                {filteredTemplates.map((template, index) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    viewMode={viewMode}
                    index={index}
                    onSelect={handleTemplateSelect}
                  />
                ))}
              </div>

              {/* Empty State */}
              {filteredTemplates.length === 0 && (
                <div className="empty-state">
                  <Search className="empty-state-icon" />
                  <h3 className="empty-state-title">No Templates Found</h3>
                  <p className="empty-state-description">
                    Try adjusting your search terms or category filter
                  </p>
                  <Button
                    onClick={() => {
                      setSearchQuery('')
                      setSelectedCategory('all')
                    }}
                    className="mt-4"
                  >
                    Clear Filters
                  </Button>
                </div>
              )}

              {/* Load More (Infinite Scroll Trigger) */}
              {filteredTemplates.length > 0 && (
                <div className="mt-12 text-center">
                  <Button variant="outline" size="lg" className="touch-target">
                    Load More Templates
                  </Button>
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Template Card Component
interface TemplateCardProps {
  template: typeof TEMPLATES[0]
  viewMode: ViewMode
  index: number
  onSelect: (templateId: string) => void
}

function TemplateCard({ template, viewMode, index, onSelect }: TemplateCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 * (index % 6) }}
      className={`
        group cursor-pointer
        ${viewMode === 'grid'
          ? 'bg-card border border-border rounded-lg overflow-hidden hover:border-primary/50 transition-colors'
          : 'bg-card border border-border rounded-lg p-4 flex items-center space-x-4 hover:border-primary/50 transition-colors'
        }
      `}
      onClick={() => onSelect(template.id)}
    >
      {/* Template Preview */}
      <div className={`
        relative
        ${viewMode === 'grid' ? 'aspect-[4/3]' : 'flex-shrink-0 w-24 h-18'}
      `}>
        <img
          src={template.preview}
          alt={template.name}
          className="w-full h-full object-cover rounded-lg"
        />
        
        {/* Overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-lg flex items-center justify-center">
          <Button
            size="sm"
            className="opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Eye className="h-4 w-4 mr-2" />
            Preview
          </Button>
        </div>

        {/* Premium Badge */}
        {template.isPremium && (
          <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-xs px-2 py-1 rounded-full flex items-center">
            <Zap className="h-3 w-3 mr-1" />
            Pro
          </div>
        )}
      </div>

      {/* Template Info */}
      <div className={`
        ${viewMode === 'grid' ? 'p-4' : 'flex-1 min-w-0'}
      `}>
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-medium text-lg group-hover:text-primary transition-colors max-heading-width">
            {template.name}
          </h3>
          
          <div className="flex items-center space-x-1 text-sm text-muted-foreground">
            <Star className="h-3 w-3 fill-current text-yellow-500" />
            <span>{template.rating}</span>
          </div>
        </div>

        <p className="text-sm text-muted-foreground mb-3 line-clamp-2 max-reading-width">
          {template.description}
        </p>

        {/* Features */}
        <div className="flex flex-wrap gap-1 mb-3">
          {template.features.slice(0, 3).map((feature) => (
            <span
              key={feature}
              className="inline-block px-2 py-1 text-xs bg-muted text-muted-foreground rounded-full"
            >
              {feature}
            </span>
          ))}
          {template.features.length > 3 && (
            <span className="inline-block px-2 py-1 text-xs bg-muted text-muted-foreground rounded-full">
              +{template.features.length - 3} more
            </span>
          )}
        </div>

        {/* Stats */}
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{template.uses.toLocaleString()} uses</span>
          
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              onSelect(template.id)
            }}
            className="touch-target-ios"
          >
            Use Template
          </Button>
        </div>
      </div>
    </motion.div>
  )
}

export default Templates
