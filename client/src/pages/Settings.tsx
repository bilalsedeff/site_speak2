import { useState } from 'react'
import { motion } from 'framer-motion'
import { Settings as SettingsIcon, Mic, Volume2, Globe, User } from 'lucide-react'

import { useVoice } from '@/providers/VoiceProvider'
import { Button } from '@/components/ui/Button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select'
import { Label } from '@/components/ui/Label'
import { Switch } from '@/components/ui/Switch'

export function Settings() {
  const { language, voice, setLanguage, setVoice } = useVoice()
  const [autoResponse, setAutoResponse] = useState(true)
  const [continuousListening, setContinuousListening] = useState(false)
  const [keyboardShortcuts, setKeyboardShortcuts] = useState(true)

  // Supported languages
  const languages = [
    { code: 'en-US', name: 'English (US)' },
    { code: 'en-GB', name: 'English (UK)' },
    { code: 'es-ES', name: 'Spanish (Spain)' },
    { code: 'es-MX', name: 'Spanish (Mexico)' },
    { code: 'fr-FR', name: 'French' },
    { code: 'de-DE', name: 'German' },
    { code: 'it-IT', name: 'Italian' },
    { code: 'pt-BR', name: 'Portuguese (Brazil)' },
    { code: 'ja-JP', name: 'Japanese' },
    { code: 'ko-KR', name: 'Korean' },
    { code: 'zh-CN', name: 'Chinese (Simplified)' },
    { code: 'tr-TR', name: 'Turkish' },
  ]

  // OpenAI TTS voices
  const voices = [
    { id: 'alloy', name: 'Alloy', description: 'Neutral, balanced voice' },
    { id: 'echo', name: 'Echo', description: 'Warm, friendly voice' },
    { id: 'fable', name: 'Fable', description: 'Expressive, storytelling voice' },
    { id: 'onyx', name: 'Onyx', description: 'Deep, authoritative voice' },
    { id: 'nova', name: 'Nova', description: 'Bright, energetic voice' },
    { id: 'shimmer', name: 'Shimmer', description: 'Soft, gentle voice (recommended)' },
  ]

  const testVoice = () => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(
        "Hello! This is how I sound with your current voice settings."
      )
      utterance.rate = 0.9
      utterance.pitch = 1
      speechSynthesis.speak(utterance)
    }
  }

  const testMicrophone = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(track => track.stop())
      // Show success feedback - in a real app you'd show a toast
      console.log('Microphone test successful')
    } catch (error) {
      console.error('Microphone test failed:', error)
    }
  }

  return (
    <div className="h-full overflow-auto bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
              <SettingsIcon className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Settings</h1>
              <p className="text-sm text-muted-foreground">
                Manage your SiteSpeak preferences
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-6">
        <div className="grid gap-8">
          
          {/* Voice Agent Settings */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-6"
          >
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
                <Mic className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Voice Assistant</h2>
                <p className="text-sm text-muted-foreground">
                  Configure your voice AI assistant settings
                </p>
              </div>
            </div>

            <div className="bg-card border border-border rounded-lg p-6 space-y-6">
              {/* Language Selection */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="language" className="text-sm font-medium">
                    Language
                  </Label>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select language" />
                    </SelectTrigger>
                    <SelectContent>
                      {languages.map((lang) => (
                        <SelectItem key={lang.code} value={lang.code}>
                          {lang.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Voice Selection */}
                <div className="space-y-2">
                  <Label htmlFor="voice" className="text-sm font-medium">
                    Voice
                  </Label>
                  <Select value={voice} onValueChange={setVoice}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select voice" />
                    </SelectTrigger>
                    <SelectContent>
                      {voices.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          <div>
                            <div className="font-medium">{v.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {v.description}
                            </div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="border-t border-border" />

              {/* Voice Options */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-foreground">Behavior</h3>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">
                        Auto Response Playback
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Automatically play AI responses with voice
                      </p>
                    </div>
                    <Switch
                      checked={autoResponse}
                      onCheckedChange={setAutoResponse}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">
                        Continuous Listening
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Keep microphone active for follow-up questions
                      </p>
                    </div>
                    <Switch
                      checked={continuousListening}
                      onCheckedChange={setContinuousListening}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">
                        Keyboard Shortcuts
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Enable Ctrl+Space to activate voice assistant
                      </p>
                    </div>
                    <Switch
                      checked={keyboardShortcuts}
                      onCheckedChange={setKeyboardShortcuts}
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-border" />

              {/* Test Buttons */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-foreground">Test Audio</h3>
                <div className="flex space-x-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={testVoice}
                    className="flex-1"
                  >
                    <Volume2 className="h-4 w-4 mr-2" />
                    Test Voice
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={testMicrophone}
                    className="flex-1"
                  >
                    <Mic className="h-4 w-4 mr-2" />
                    Test Microphone
                  </Button>
                </div>
              </div>
            </div>
          </motion.section>

          {/* General Settings Placeholders */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="space-y-6"
          >
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-green-500/10 rounded-lg flex items-center justify-center">
                <Globe className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">General</h2>
                <p className="text-sm text-muted-foreground">
                  General application preferences
                </p>
              </div>
            </div>

            <div className="bg-card border border-border rounded-lg p-6">
              <div className="text-sm text-muted-foreground text-center py-8">
                General settings coming soon...
              </div>
            </div>
          </motion.section>

          {/* Account Settings Placeholder */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
            className="space-y-6"
          >
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-purple-500/10 rounded-lg flex items-center justify-center">
                <User className="h-4 w-4 text-purple-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Account</h2>
                <p className="text-sm text-muted-foreground">
                  Manage your account and billing
                </p>
              </div>
            </div>

            <div className="bg-card border border-border rounded-lg p-6">
              <div className="text-sm text-muted-foreground text-center py-8">
                Account settings coming soon...
              </div>
            </div>
          </motion.section>

        </div>
      </div>
    </div>
  )
}

export default Settings
