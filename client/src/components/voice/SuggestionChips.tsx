import { motion, AnimatePresence } from 'framer-motion'
import { MessageCircle, Search, ShoppingCart, Calendar, HelpCircle } from 'lucide-react'

interface SuggestionChipsProps {
  isVisible: boolean
  onSuggestionClick: (suggestion: string) => void
  context?: 'general' | 'shopping' | 'booking' | 'help'
}

const suggestions = {
  general: [
    { icon: Search, text: 'Find products', query: 'Help me find products on this site' },
    { icon: MessageCircle, text: 'Ask a question', query: 'I have a question about this website' },
    { icon: HelpCircle, text: 'Get help', query: 'Can you help me navigate this site?' }
  ],
  shopping: [
    { icon: Search, text: 'Find products', query: 'Show me your products' },
    { icon: ShoppingCart, text: 'Check cart', query: 'What\'s in my cart?' },
    { icon: HelpCircle, text: 'Product info', query: 'Tell me about this product' }
  ],
  booking: [
    { icon: Calendar, text: 'Book appointment', query: 'I want to book an appointment' },
    { icon: Search, text: 'Check availability', query: 'What times are available?' },
    { icon: HelpCircle, text: 'Booking help', query: 'How do I make a booking?' }
  ],
  help: [
    { icon: MessageCircle, text: 'Contact support', query: 'I need to contact support' },
    { icon: Search, text: 'Find information', query: 'Help me find information' },
    { icon: HelpCircle, text: 'FAQ', query: 'Show me frequently asked questions' }
  ]
}

export function SuggestionChips({ 
  isVisible, 
  onSuggestionClick, 
  context = 'general' 
}: SuggestionChipsProps) {
  const currentSuggestions = suggestions[context]

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.9 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="fixed bottom-32 left-1/2 transform -translate-x-1/2 z-20"
        >
          <div className="bg-white/95 backdrop-blur-sm border border-border rounded-lg shadow-lg p-3">
            <div className="flex flex-wrap gap-2 max-w-xs">
              {currentSuggestions.map((suggestion, index) => {
                const IconComponent = suggestion.icon
                return (
                  <motion.button
                    key={suggestion.text}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.1 }}
                    onClick={() => onSuggestionClick(suggestion.query)}
                    className="flex items-center space-x-2 px-3 py-2 text-xs bg-muted/50 hover:bg-muted/80 border border-border/50 rounded-full transition-colors duration-200 hover:scale-105"
                  >
                    <IconComponent className="h-3 w-3 text-muted-foreground" />
                    <span className="text-foreground font-medium">{suggestion.text}</span>
                  </motion.button>
                )
              })}
            </div>
            <div className="text-xs text-muted-foreground text-center mt-2">
              Try saying one of these...
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}