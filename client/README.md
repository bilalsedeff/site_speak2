# SiteSpeak Client

The React frontend for SiteSpeak - a voice-first website builder with integrated AI assistant.

## Architecture

Modern React application with feature-based organization:

```plaintext
src/
├── components/         # Reusable UI components
│   ├── editor/        # Drag-and-drop site editor
│   ├── voice/         # Voice AI interface components
│   ├── ui/           # Base UI components (Radix + Tailwind)
│   └── common/       # Shared utility components
├── pages/             # Route-based page components
├── hooks/             # Custom React hooks
├── store/             # State management (Redux Toolkit + Zustand)
├── services/          # API communication and external services
├── types/             # TypeScript type definitions
└── assets/           # Static assets
```

## Key Features

- **Visual Site Editor**: Drag-and-drop website builder with real-time preview
- **Voice AI Interface**: Jarvis-like voice assistant for site creation
- **Template Gallery**: Professional templates with AI customization
- **Real-time Collaboration**: Live editing with WebSocket synchronization
- **Analytics Dashboard**: Voice AI performance and site analytics
- **Responsive Design**: Mobile-first design with adaptive layouts

## Technology Stack

- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite for fast development and optimized builds
- **Routing**: Wouter (lightweight React Router alternative)
- **State Management**:
  - Redux Toolkit for global application state
  - Zustand for component-level state
  - React Query for server state management
- **UI Components**: Radix UI with Tailwind CSS
- **Drag & Drop**: React DnD for site editor functionality
- **Real-time**: Socket.io client for WebSocket communication

## Quick Start

1. **Environment Setup**:

   ```bash
   # Client uses environment variables from root .env
   cd ..
   cp environment.example .env
   ```

2. **Install Dependencies**:

   ```bash
   npm install
   ```

3. **Development**:

   ```bash
   npm run dev:client
   # Client runs on http://localhost:3000
   ```

4. **Build**:

   ```bash
   npm run build:client
   # Production build in dist/
   ```

## Component Architecture

### `/components/editor`

Visual website builder components:

- `SiteEditor.tsx` - Main editor interface
- `ComponentPalette.tsx` - Drag-and-drop component library
- `PropertyPanel.tsx` - Component configuration sidebar
- `PreviewFrame.tsx` - Live site preview
- `LayersPanel.tsx` - Site structure hierarchy

### `/components/voice`

Voice AI interface components:

- `VoiceAssistant.tsx` - Main voice interface
- `VoiceButton.tsx` - Microphone activation button
- `VoiceVisualizer.tsx` - Audio waveform visualization
- `TranscriptDisplay.tsx` - Speech-to-text output
- `VoiceSettings.tsx` - Voice configuration panel

### `/components/ui`

Base UI components using Radix + Tailwind:

- `Button.tsx` - Button variations
- `Dialog.tsx` - Modal dialogs
- `Input.tsx` - Form inputs
- `Tabs.tsx` - Tab navigation
- `Tooltip.tsx` - Contextual help

### `/pages`

Route-based page components:

- `Dashboard.tsx` - Main dashboard with site overview
- `Editor.tsx` - Site editing interface
- `Analytics.tsx` - Voice AI and site analytics
- `Settings.tsx` - User and site settings
- `Templates.tsx` - Template gallery

## State Management

### Redux Toolkit Slices

Global application state:

- `authSlice.ts` - User authentication
- `sitesSlice.ts` - Site management
- `editorSlice.ts` - Editor state and history
- `uiSlice.ts` - UI state (modals, sidebars, etc.)

### Zustand Stores

Component-level state:

- `useVoiceStore.ts` - Voice assistant state
- `useEditorStore.ts` - Editor temporary state
- `useAnalyticsStore.ts` - Analytics dashboard state

### React Query

Server state management:

- Site CRUD operations
- Template fetching
- Analytics data
- Voice session management

## Voice AI Integration

The client integrates deeply with the voice AI system:

1. **Voice Interface**:
   - WebSocket connection for real-time voice communication
   - Audio recording and playback
   - Visual feedback during processing

2. **Voice Commands**:
   - "Create a new section"
   - "Change the color scheme to blue"
   - "Add a contact form here"
   - "Preview the mobile version"

3. **AI-Assisted Editing**:
   - Natural language component configuration
   - Content generation and suggestions
   - Automated layout optimization

## API Integration

### REST API

- Authentication endpoints
- Site CRUD operations
- Template management
- Analytics data retrieval

### WebSocket

- Real-time voice communication
- Live collaboration
- Instant preview updates
- System notifications

### Service Layer

```typescript
// Example API service structure
class SitesService {
  async createSite(data: CreateSiteRequest): Promise<Site>
  async updateSite(id: string, data: UpdateSiteRequest): Promise<Site>
  async publishSite(id: string): Promise<PublishResponse>
  async getSiteAnalytics(id: string): Promise<SiteAnalytics>
}
```

## Development Guidelines

1. **Component Structure**:
   - Use functional components with hooks
   - Implement proper TypeScript interfaces
   - Follow React best practices for performance

2. **Styling**:
   - Tailwind CSS for styling
   - CSS modules for component-specific styles
   - Consistent design system with Radix UI

3. **State Management**:
   - Use React Query for server state
   - Redux Toolkit for global client state
   - Local state with useState/useReducer when appropriate

4. **Performance**:
   - Code splitting with React.lazy
   - Memoization with React.memo and useMemo
   - Optimized bundle size with tree shaking

5. **Accessibility**:
   - ARIA labels and roles
   - Keyboard navigation support
   - Screen reader compatibility

## Build & Deployment

### Development Build

```bash
npm run dev:client        # Development server
npm run dev:client:3001   # Alternative port
```

### Production Build

```bash
npm run build:client      # Optimized production build
npm run preview           # Preview production build locally
```

### Environment Variables

```env
VITE_API_URL=http://localhost:5000/api
VITE_WS_URL=ws://localhost:5000
VITE_VOICE_ENABLED=true
VITE_ANALYTICS_ENABLED=true
```

## Testing

```bash
npm run test              # Unit tests with Jest
npm run test:watch        # Watch mode
npm run test:coverage     # Coverage report
npm run test:e2e          # End-to-end tests with Cypress
```

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

Note: Voice features require modern browsers with Web Audio API support.
