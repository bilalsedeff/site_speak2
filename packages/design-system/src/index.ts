// Component exports (only implemented components)
// Note: Using explicit exports to avoid type conflicts between component and schema Props
export { Button, buttonVariants } from './components/Button'
export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent, cardVariants } from './components/Card'
export { VoiceWidget, VoiceWidgetMetadata } from './components/VoiceWidget'

// Utility exports (verified to exist)
export * from './utils/cn'
export * from './utils/component-metadata'

// Schema exports (verified to exist and used by consumers)
export * from './schemas/component-schemas'
export * from './schemas/aria-schemas'
export * from './schemas/jsonld-schemas'
export * from './schemas/action-schemas'

// Type re-exports for convenience (using schema versions as canonical)
export type { ButtonProps, CardProps, VoiceWidgetProps } from './schemas/component-schemas'

// TODO: Implement missing components when needed
// - Input, Label, Select, Switch, Toast, Modal, Sheet, Tabs
// - Breadcrumbs, EmptyState, LoadingSpinner

// TODO: Implement missing tokens when needed  
// - colors, typography, spacing, motion

// TODO: Implement missing hooks when needed
// - use-theme, use-media-query