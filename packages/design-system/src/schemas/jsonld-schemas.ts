import { z } from 'zod'

/**
 * Base Schema.org JSON-LD object
 * Based on https://schema.org/ specifications
 */
export const BaseJsonLdSchema = z.object({
  '@context': z.literal('https://schema.org'),
  '@type': z.string(),
  '@id': z.string().optional(),
})

/**
 * Organization JSON-LD schema
 */
export const OrganizationJsonLdSchema = BaseJsonLdSchema.extend({
  '@type': z.literal('Organization'),
  name: z.string(),
  url: z.string().url().optional(),
  logo: z.string().url().optional(),
  description: z.string().optional(),
  address: z.object({
    '@type': z.literal('PostalAddress'),
    streetAddress: z.string().optional(),
    addressLocality: z.string().optional(),
    addressRegion: z.string().optional(),
    postalCode: z.string().optional(),
    addressCountry: z.string().optional(),
  }).optional(),
  contactPoint: z.object({
    '@type': z.literal('ContactPoint'),
    telephone: z.string().optional(),
    email: z.string().email().optional(),
    contactType: z.string().optional(),
  }).optional(),
  sameAs: z.array(z.string().url()).optional(),
})

/**
 * Product JSON-LD schema
 */
export const ProductJsonLdSchema = BaseJsonLdSchema.extend({
  '@type': z.literal('Product'),
  name: z.string(),
  description: z.string().optional(),
  image: z.union([z.string().url(), z.array(z.string().url())]).optional(),
  brand: z.union([
    z.string(),
    z.object({
      '@type': z.literal('Brand'),
      name: z.string(),
    })
  ]).optional(),
  offers: z.object({
    '@type': z.literal('Offer'),
    price: z.string(),
    priceCurrency: z.string().length(3), // ISO 4217 currency code
    availability: z.enum([
      'https://schema.org/InStock',
      'https://schema.org/OutOfStock',
      'https://schema.org/PreOrder',
      'https://schema.org/BackOrder',
    ]).optional(),
    url: z.string().url().optional(),
  }).optional(),
  sku: z.string().optional(),
  mpn: z.string().optional(),
  gtin: z.string().optional(),
})

/**
 * Event JSON-LD schema
 */
export const EventJsonLdSchema = BaseJsonLdSchema.extend({
  '@type': z.literal('Event'),
  name: z.string(),
  description: z.string().optional(),
  startDate: z.string(), // ISO 8601 date
  endDate: z.string().optional(), // ISO 8601 date
  eventAttendanceMode: z.enum([
    'https://schema.org/OfflineEventAttendanceMode',
    'https://schema.org/OnlineEventAttendanceMode',
    'https://schema.org/MixedEventAttendanceMode',
  ]).optional(),
  eventStatus: z.enum([
    'https://schema.org/EventScheduled',
    'https://schema.org/EventCancelled',
    'https://schema.org/EventMovedOnline',
    'https://schema.org/EventPostponed',
    'https://schema.org/EventRescheduled',
  ]).optional(),
  location: z.union([
    z.object({
      '@type': z.literal('Place'),
      name: z.string(),
      address: z.string(),
    }),
    z.object({
      '@type': z.literal('VirtualLocation'),
      url: z.string().url(),
    })
  ]).optional(),
  organizer: z.union([
    z.string(),
    OrganizationJsonLdSchema.omit({ '@context': true })
  ]).optional(),
  offers: z.object({
    '@type': z.literal('Offer'),
    price: z.string(),
    priceCurrency: z.string().length(3),
    url: z.string().url().optional(),
    availability: z.string().optional(),
  }).optional(),
})

/**
 * FAQ JSON-LD schema
 */
export const FAQJsonLdSchema = BaseJsonLdSchema.extend({
  '@type': z.literal('FAQPage'),
  mainEntity: z.array(z.object({
    '@type': z.literal('Question'),
    name: z.string(),
    acceptedAnswer: z.object({
      '@type': z.literal('Answer'),
      text: z.string(),
    }),
  })),
})

/**
 * Article/BlogPosting JSON-LD schema
 */
export const ArticleJsonLdSchema = BaseJsonLdSchema.extend({
  '@type': z.enum(['Article', 'BlogPosting', 'NewsArticle']),
  headline: z.string(),
  description: z.string().optional(),
  image: z.union([z.string().url(), z.array(z.string().url())]).optional(),
  author: z.union([
    z.string(),
    z.object({
      '@type': z.literal('Person'),
      name: z.string(),
      url: z.string().url().optional(),
    })
  ]).optional(),
  publisher: OrganizationJsonLdSchema.omit({ '@context': true }).optional(),
  datePublished: z.string(), // ISO 8601 date
  dateModified: z.string().optional(), // ISO 8601 date
  wordCount: z.number().optional(),
  articleBody: z.string().optional(),
})

/**
 * Breadcrumb JSON-LD schema
 */
export const BreadcrumbJsonLdSchema = BaseJsonLdSchema.extend({
  '@type': z.literal('BreadcrumbList'),
  itemListElement: z.array(z.object({
    '@type': z.literal('ListItem'),
    position: z.number(),
    name: z.string(),
    item: z.string().url().optional(),
  })),
})

/**
 * WebSite JSON-LD schema
 */
export const WebSiteJsonLdSchema = BaseJsonLdSchema.extend({
  '@type': z.literal('WebSite'),
  name: z.string(),
  description: z.string().optional(),
  url: z.string().url(),
  potentialAction: z.object({
    '@type': z.literal('SearchAction'),
    target: z.object({
      '@type': z.literal('EntryPoint'),
      urlTemplate: z.string(), // e.g., "https://example.com/search?q={search_term_string}"
    }),
    'query-input': z.literal('required name=search_term_string'),
  }).optional(),
  publisher: OrganizationJsonLdSchema.omit({ '@context': true }).optional(),
})

/**
 * LocalBusiness JSON-LD schema
 */
export const LocalBusinessJsonLdSchema = BaseJsonLdSchema.extend({
  '@type': z.literal('LocalBusiness'),
  name: z.string(),
  description: z.string().optional(),
  url: z.string().url().optional(),
  telephone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.object({
    '@type': z.literal('PostalAddress'),
    streetAddress: z.string().optional(),
    addressLocality: z.string().optional(),
    addressRegion: z.string().optional(),
    postalCode: z.string().optional(),
    addressCountry: z.string().optional(),
  }).optional(),
  geo: z.object({
    '@type': z.literal('GeoCoordinates'),
    latitude: z.number(),
    longitude: z.number(),
  }).optional(),
  openingHours: z.array(z.string()).optional(), // e.g., ["Mo-Fr 09:00-17:00"]
  priceRange: z.string().optional(), // e.g., "$$"
  servesCuisine: z.string().optional(),
  acceptsReservations: z.boolean().optional(),
})

/**
 * Component JSON-LD template configuration
 */
export const JsonLdTemplateSchema = z.object({
  componentName: z.string(),
  schemaType: z.string(),
  template: z.record(z.any()),
  propMapping: z.record(z.string()), // Maps component props to JSON-LD properties
  conditions: z.record(z.any()).optional(), // When to apply this template
})

export type JsonLdTemplate = z.infer<typeof JsonLdTemplateSchema>

/**
 * Predefined JSON-LD templates for common components
 */
export const COMPONENT_JSONLD_TEMPLATES: JsonLdTemplate[] = [
  {
    componentName: 'ProductCard',
    schemaType: 'Product',
    template: {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: '{{name}}',
      description: '{{description}}',
      image: '{{image}}',
      offers: {
        '@type': 'Offer',
        price: '{{price}}',
        priceCurrency: '{{currency}}',
        availability: '{{availability}}',
      }
    },
    propMapping: {
      name: 'title',
      description: 'description',
      image: 'imageUrl',
      price: 'price',
      currency: 'currency',
      availability: 'inStock',
    }
  },
  {
    componentName: 'EventCard',
    schemaType: 'Event',
    template: {
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: '{{name}}',
      description: '{{description}}',
      startDate: '{{startDate}}',
      endDate: '{{endDate}}',
      location: {
        '@type': 'Place',
        name: '{{locationName}}',
        address: '{{address}}'
      }
    },
    propMapping: {
      name: 'title',
      description: 'description',
      startDate: 'startDate',
      endDate: 'endDate',
      locationName: 'venue',
      address: 'address',
    }
  },
  {
    componentName: 'ArticleCard',
    schemaType: 'Article',
    template: {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: '{{headline}}',
      description: '{{description}}',
      author: {
        '@type': 'Person',
        name: '{{authorName}}'
      },
      datePublished: '{{publishDate}}',
      image: '{{image}}'
    },
    propMapping: {
      headline: 'title',
      description: 'excerpt',
      authorName: 'author',
      publishDate: 'publishedAt',
      image: 'featuredImage',
    }
  },
]

/**
 * Helper function to generate JSON-LD for a component
 */
export function generateJsonLd(
  componentName: string,
  props: Record<string, any>
): Record<string, any> | null {
  const template = COMPONENT_JSONLD_TEMPLATES.find(t => t.componentName === componentName)
  if (!template) return null
  
  const jsonld = JSON.parse(JSON.stringify(template.template))
  
  // Replace template variables with actual prop values
  function replaceVariables(obj: any): any {
    if (typeof obj === 'string') {
      return obj.replace(/\{\{(\w+)\}\}/g, (match, propKey) => {
        const mappedProp = template?.propMapping?.[propKey] || propKey
        return props[mappedProp] || match
      })
    } else if (Array.isArray(obj)) {
      return obj.map(replaceVariables)
    } else if (typeof obj === 'object' && obj !== null) {
      const result: Record<string, any> = {}
      for (const [key, value] of Object.entries(obj)) {
        result[key] = replaceVariables(value)
      }
      return result
    }
    return obj
  }
  
  return replaceVariables(jsonld)
}

// Export all schema types
export type OrganizationJsonLd = z.infer<typeof OrganizationJsonLdSchema>
export type ProductJsonLd = z.infer<typeof ProductJsonLdSchema>
export type EventJsonLd = z.infer<typeof EventJsonLdSchema>
export type FAQJsonLd = z.infer<typeof FAQJsonLdSchema>
export type ArticleJsonLd = z.infer<typeof ArticleJsonLdSchema>
export type BreadcrumbJsonLd = z.infer<typeof BreadcrumbJsonLdSchema>
export type WebSiteJsonLd = z.infer<typeof WebSiteJsonLdSchema>
export type LocalBusinessJsonLd = z.infer<typeof LocalBusinessJsonLdSchema>