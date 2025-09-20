# @sitespeak/voice-widget

Voice-first AI assistant widget for embedding interactive voice capabilities into any website. Built with React 18, TypeScript, and WebSocket for real-time voice interactions.

## Features

- 🎙️ **Real-time Voice Interaction** - Sub-300ms response times with OpenAI Realtime API
- 🔊 **Barge-in Support** - Interrupt and resume conversations naturally
- 🎨 **Shadow DOM Isolation** - No CSS conflicts with host website
- 📱 **Mobile-first Responsive** - Works on all devices and screen sizes
- 🌐 **Multi-language Support** - Configurable locale and voice settings
- ♿ **Accessibility Compliant** - WCAG 2.1 AA standards with screen reader support
- 🎯 **Site Actions Integration** - Execute actions on the host website via voice commands
- 🔒 **Security-first** - Secure authentication and tenant isolation

## Quick Start

### 1. Script Tag Embed (Recommended)

Add this script tag to your website:

```html
<script
  src="https://cdn.sitespeak.ai/voice-widget/embed.js"
  data-tenant-id="your-tenant-id"
  data-site-id="your-site-id"
  data-position="bottom-right"
  data-theme="auto"
  async
></script>
```

### 2. NPM Installation

```bash
npm install @sitespeak/voice-widget
```

```typescript
import { initSiteSpeak } from '@sitespeak/voice-widget'

initSiteSpeak({
  tenantId: 'your-tenant-id',
  siteId: 'your-site-id',
  apiEndpoint: 'https://api.sitespeak.ai',
  theme: 'auto',
  position: 'bottom-right'
})
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `tenantId` | `string` | **required** | Your SiteSpeak tenant ID |
| `siteId` | `string` | **required** | Your site ID |
| `apiEndpoint` | `string` | `https://api.sitespeak.ai` | API endpoint URL |
| `wsEndpoint` | `string` | `wss://api.sitespeak.ai/voice` | WebSocket endpoint for voice |
| `theme` | `'light' \| 'dark' \| 'auto'` | `'auto'` | Widget theme |
| `position` | `'bottom-right' \| 'bottom-left' \| 'top-right' \| 'top-left'` | `'bottom-right'` | Widget position |
| `size` | `'small' \| 'medium' \| 'large'` | `'medium'` | Widget size |
| `color` | `string` | - | Custom primary color (HSL format) |
| `locale` | `string` | `'en-US'` | Language locale for voice |
| `autoStart` | `boolean` | `false` | Auto-start voice on load |
| `debugMode` | `boolean` | `false` | Enable debug logging |

## Advanced Usage

### Programmatic Control

```typescript
// Access the widget instance
const widget = window.SiteSpeak?.voice

// Start voice input
widget.startVoiceInput()

// Stop voice input
widget.stopVoiceInput()

// Update configuration
widget.updateConfig({
  theme: 'dark',
  locale: 'tr-TR'
})

// Get current state
const state = widget.getState()

// Show/hide widget
widget.show()
widget.hide()

// Destroy widget
widget.destroy()
```

### Custom Styling

The widget uses CSS custom properties for theming:

```css
/* Override widget colors */
#sitespeak-voice-widget {
  --primary: 221.2 83.2% 53.3%;
  --primary-foreground: 210 40% 98%;
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
}
```

### React Integration

```tsx
import { useEffect } from 'react'
import { initSiteSpeak } from '@sitespeak/voice-widget'

function MyApp() {
  useEffect(() => {
    initSiteSpeak({
      tenantId: process.env.REACT_APP_SITESPEAK_TENANT_ID!,
      siteId: process.env.REACT_APP_SITESPEAK_SITE_ID!,
    })
  }, [])

  return <div>Your app content</div>
}
```

## Performance

The voice widget is optimized for performance:

- **Bundle Size**: ~45KB gzipped (embed script)
- **First Load**: <200ms initialization
- **Voice Response**: <300ms first token latency
- **Memory Usage**: <10MB typical usage

## Browser Support

- Chrome 80+ (recommended for best voice quality)
- Firefox 78+
- Safari 14+
- Edge 80+

**Note**: Voice features require HTTPS in production and microphone permissions.

## Security

- All voice data is transmitted over secure WebSocket (WSS)
- No audio recordings are stored by default
- Tenant isolation ensures data privacy
- CORS and CSP compatible
- Rate limiting and authentication built-in

## Accessibility

The widget is built with accessibility in mind:

- Screen reader compatible with ARIA labels
- Keyboard navigation support
- High contrast mode support
- Reduced motion preferences respected
- Touch target compliance (44pt minimum)

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Build embed script
npm run build:embed

# Run tests
npm run test

# Type checking
npm run type-check
```

## Contributing

Please read our [Contributing Guide](../../CONTRIBUTING.md) for development guidelines.

## License

MIT © SiteSpeak Team

## Support

- 📖 [Documentation](https://docs.sitespeak.ai)
- 💬 [Discord Community](https://discord.gg/sitespeak)
- 🐛 [Bug Reports](https://github.com/sitespeak/sitespeak/issues)
- 📧 [Email Support](mailto:support@sitespeak.ai)
