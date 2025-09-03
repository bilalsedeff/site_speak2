import { useState } from 'react'
import { Settings, Mic, Volume2, X } from 'lucide-react'

import { useVoice } from '@/providers/VoiceProvider'
import { Button } from '@/components/ui/Button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select'
import { Label } from '@/components/ui/Label'
import { Switch } from '@/components/ui/Switch'

interface VoiceSettingsProps {
  onClose: () => void
}

export function VoiceSettings({ onClose }: VoiceSettingsProps) {
  const { language, voice, setLanguage, setVoice } = useVoice()
  const [autoResponse, setAutoResponse] = useState(true)
  const [continuousListening, setContinuousListening] = useState(false)

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
    { id: 'shimmer', name: 'Shimmer', description: 'Soft, gentle voice' },
  ]

  return (
    <div className="p-4 border-b border-border bg-muted/20">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-semibold flex items-center">
          <Settings className="h-4 w-4 mr-2" />
          Voice Settings
        </h4>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-6 w-6 p-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-4">
        {/* Language Selection */}
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

        {/* Voice Options */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">
                Auto Response
              </Label>
              <p className="text-xs text-muted-foreground">
                Automatically play AI responses
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
        </div>

        {/* Voice Test */}
        <div className="pt-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => {
              const utterance = new SpeechSynthesisUtterance(
                "Hello! This is how I sound with your current settings."
              )
              utterance.rate = 0.9
              utterance.pitch = 1
              speechSynthesis.speak(utterance)
            }}
          >
            <Volume2 className="h-4 w-4 mr-2" />
            Test Voice
          </Button>
        </div>

        {/* Microphone Test */}
        <div>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={async () => {
              try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
                stream.getTracks().forEach(track => track.stop())
                // Show success feedback
              } catch (error) {
                // Show error feedback
              }
            }}
          >
            <Mic className="h-4 w-4 mr-2" />
            Test Microphone
          </Button>
        </div>
      </div>
    </div>
  )
}