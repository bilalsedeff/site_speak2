import { useState } from 'react'
import { motion } from 'framer-motion'
import { Settings as SettingsIcon, Mic, Volume2, Globe, User, Moon, Sun, Monitor, Save, Eye, Palette } from 'lucide-react'

import { useVoice } from '@/providers/VoiceProvider'
import { useAppSelector, useAppDispatch } from '@/store'
import { setTheme, toggleAutoSave, setAutoSaveInterval, setShowWelcome, setShowTips, toggleCompactMode, addNotification } from '@/store/slices/uiSlice'
import { logout } from '@/store/slices/authSlice'
import { authApi } from '@/services/api/auth'
import { Button } from '@/components/ui/Button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select'
import { Label } from '@/components/ui/Label'
import { Switch } from '@/components/ui/Switch'
import { Input } from '@/components/ui/Input'

export function Settings() {
  const { language, voice, setLanguage, setVoice } = useVoice()
  const dispatch = useAppDispatch()

  // Redux state
  const uiPreferences = useAppSelector(state => state.ui.preferences)
  const authState = useAppSelector(state => state.auth)
  const { user, tenant } = authState

  // Local state for voice settings
  const [autoResponse, setAutoResponse] = useState(true)
  const [continuousListening, setContinuousListening] = useState(false)
  const [keyboardShortcuts, setKeyboardShortcuts] = useState(true)

  // Local state for account settings
  const [profileData, setProfileData] = useState({
    name: user?.name || '',
    email: user?.email || ''
  })
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false)
  const [isChangingPassword, setIsChangingPassword] = useState(false)

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
      dispatch(addNotification({
        type: 'success',
        title: 'Microphone Test',
        message: 'Microphone is working correctly'
      }))
    } catch (error) {
      console.error('Microphone test failed:', error)
      dispatch(addNotification({
        type: 'error',
        title: 'Microphone Test Failed',
        message: 'Could not access microphone. Please check permissions.'
      }))
    }
  }

  // Theme change handler
  const handleThemeChange = (newTheme: 'light' | 'dark' | 'system') => {
    dispatch(setTheme(newTheme))
  }

  // Auto-save interval handler
  const handleAutoSaveIntervalChange = (interval: string) => {
    const numInterval = parseInt(interval, 10)
    if (!isNaN(numInterval)) {
      dispatch(setAutoSaveInterval(numInterval))
    }
  }

  // Profile update handler
  const handleUpdateProfile = async () => {
    if (!profileData.name.trim()) {
      dispatch(addNotification({
        type: 'error',
        title: 'Validation Error',
        message: 'Name is required'
      }))
      return
    }

    setIsUpdatingProfile(true)
    try {
      await authApi.updateProfile({
        name: profileData.name.trim(),
        email: profileData.email.trim()
      })

      dispatch(addNotification({
        type: 'success',
        title: 'Profile Updated',
        message: 'Your profile has been updated successfully'
      }))
    } catch (error) {
      dispatch(addNotification({
        type: 'error',
        title: 'Update Failed',
        message: error instanceof Error ? error.message : 'Failed to update profile'
      }))
    } finally {
      setIsUpdatingProfile(false)
    }
  }

  // Password change handler
  const handleChangePassword = async () => {
    if (!passwordData.currentPassword || !passwordData.newPassword) {
      dispatch(addNotification({
        type: 'error',
        title: 'Validation Error',
        message: 'Please fill in all password fields'
      }))
      return
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      dispatch(addNotification({
        type: 'error',
        title: 'Validation Error',
        message: 'New passwords do not match'
      }))
      return
    }

    if (passwordData.newPassword.length < 8) {
      dispatch(addNotification({
        type: 'error',
        title: 'Validation Error',
        message: 'Password must be at least 8 characters long'
      }))
      return
    }

    setIsChangingPassword(true)
    try {
      await authApi.changePassword({
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword
      })

      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      })

      dispatch(addNotification({
        type: 'success',
        title: 'Password Changed',
        message: 'Your password has been updated successfully'
      }))
    } catch (error) {
      dispatch(addNotification({
        type: 'error',
        title: 'Password Change Failed',
        message: error instanceof Error ? error.message : 'Failed to change password'
      }))
    } finally {
      setIsChangingPassword(false)
    }
  }

  // Logout handler
  const handleLogout = () => {
    dispatch(logout())
    dispatch(addNotification({
      type: 'info',
      title: 'Logged Out',
      message: 'You have been logged out successfully'
    }))
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

          {/* General Settings */}
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
                  General application preferences and interface settings
                </p>
              </div>
            </div>

            <div className="bg-card border border-border rounded-lg p-6 space-y-6">
              {/* Theme Selection */}
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <Palette className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-medium text-foreground">Appearance</h3>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="theme" className="text-sm font-medium">
                    Theme
                  </Label>
                  <Select value={uiPreferences.theme} onValueChange={handleThemeChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select theme" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">
                        <div className="flex items-center space-x-2">
                          <Sun className="h-4 w-4" />
                          <span>Light</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="dark">
                        <div className="flex items-center space-x-2">
                          <Moon className="h-4 w-4" />
                          <span>Dark</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="system">
                        <div className="flex items-center space-x-2">
                          <Monitor className="h-4 w-4" />
                          <span>System</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="border-t border-border" />

              {/* Editor Settings */}
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <Save className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-medium text-foreground">Editor</h3>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">
                        Auto Save
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Automatically save your work while editing
                      </p>
                    </div>
                    <Switch
                      checked={uiPreferences.autoSave}
                      onCheckedChange={() => dispatch(toggleAutoSave())}
                    />
                  </div>

                  {uiPreferences.autoSave && (
                    <div className="space-y-2">
                      <Label htmlFor="autoSaveInterval" className="text-sm font-medium">
                        Auto Save Interval
                      </Label>
                      <Select
                        value={uiPreferences.autoSaveInterval.toString()}
                        onValueChange={handleAutoSaveIntervalChange}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="5">5 seconds</SelectItem>
                          <SelectItem value="10">10 seconds</SelectItem>
                          <SelectItem value="30">30 seconds</SelectItem>
                          <SelectItem value="60">1 minute</SelectItem>
                          <SelectItem value="120">2 minutes</SelectItem>
                          <SelectItem value="300">5 minutes</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">
                        Compact Mode
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Use a more compact interface layout
                      </p>
                    </div>
                    <Switch
                      checked={uiPreferences.compactMode}
                      onCheckedChange={() => dispatch(toggleCompactMode())}
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-border" />

              {/* Interface Settings */}
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <Eye className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-medium text-foreground">Interface</h3>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">
                        Show Welcome Screen
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Display welcome screen on startup
                      </p>
                    </div>
                    <Switch
                      checked={uiPreferences.showWelcome}
                      onCheckedChange={(checked) => dispatch(setShowWelcome(checked))}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">
                        Show Tips
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Display helpful tips and tutorials
                      </p>
                    </div>
                    <Switch
                      checked={uiPreferences.showTips}
                      onCheckedChange={(checked) => dispatch(setShowTips(checked))}
                    />
                  </div>
                </div>
              </div>
            </div>
          </motion.section>

          {/* Account Settings */}
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
                  Manage your profile, security, and subscription
                </p>
              </div>
            </div>

            <div className="space-y-6">
              {/* Profile Information */}
              <div className="bg-card border border-border rounded-lg p-6 space-y-6">
                <div className="flex items-center space-x-3">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-medium text-foreground">Profile Information</h3>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-sm font-medium">
                      Full Name
                    </Label>
                    <Input
                      id="name"
                      type="text"
                      value={profileData.name}
                      onChange={(e) => setProfileData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Enter your full name"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-medium">
                      Email Address
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={profileData.email}
                      onChange={(e) => setProfileData(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="Enter your email"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-border">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Account Status</p>
                    <div className="flex items-center space-x-2">
                      <div className={`w-2 h-2 rounded-full ${user?.emailVerified ? 'bg-green-500' : 'bg-yellow-500'}`} />
                      <span className="text-xs text-muted-foreground">
                        {user?.emailVerified ? 'Email Verified' : 'Email Not Verified'}
                      </span>
                    </div>
                  </div>

                  <Button
                    onClick={handleUpdateProfile}
                    disabled={isUpdatingProfile}
                    size="sm"
                  >
                    {isUpdatingProfile ? 'Updating...' : 'Update Profile'}
                  </Button>
                </div>
              </div>

              {/* Security Settings */}
              <div className="bg-card border border-border rounded-lg p-6 space-y-6">
                <div className="flex items-center space-x-3">
                  <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <h3 className="text-sm font-medium text-foreground">Security</h3>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="currentPassword" className="text-sm font-medium">
                      Current Password
                    </Label>
                    <Input
                      id="currentPassword"
                      type="password"
                      value={passwordData.currentPassword}
                      onChange={(e) => setPasswordData(prev => ({ ...prev, currentPassword: e.target.value }))}
                      placeholder="Enter current password"
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="newPassword" className="text-sm font-medium">
                        New Password
                      </Label>
                      <Input
                        id="newPassword"
                        type="password"
                        value={passwordData.newPassword}
                        onChange={(e) => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
                        placeholder="Enter new password"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword" className="text-sm font-medium">
                        Confirm New Password
                      </Label>
                      <Input
                        id="confirmPassword"
                        type="password"
                        value={passwordData.confirmPassword}
                        onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                        placeholder="Confirm new password"
                      />
                    </div>
                  </div>

                  <Button
                    onClick={handleChangePassword}
                    disabled={isChangingPassword}
                    size="sm"
                    className="w-full"
                  >
                    {isChangingPassword ? 'Changing Password...' : 'Change Password'}
                  </Button>
                </div>
              </div>

              {/* Subscription & Plan */}
              {tenant && (
                <div className="bg-card border border-border rounded-lg p-6 space-y-6">
                  <div className="flex items-center space-x-3">
                    <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-4m-5 0H9m0 0H7m2 0v-5a2 2 0 012-2h2a2 2 0 012 2v5m-6 0V9a2 2 0 012-2h2a2 2 0 012 2v8" />
                    </svg>
                    <h3 className="text-sm font-medium text-foreground">Subscription</h3>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Organization</Label>
                      <p className="text-sm text-foreground">{tenant.name}</p>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Current Plan</Label>
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          tenant.plan === 'free' ? 'bg-gray-100 text-gray-800' :
                          tenant.plan === 'starter' ? 'bg-blue-100 text-blue-800' :
                          tenant.plan === 'professional' ? 'bg-purple-100 text-purple-800' :
                          'bg-gold-100 text-gold-800'
                        }`}>
                          {tenant.plan.charAt(0).toUpperCase() + tenant.plan.slice(1)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Member Since</Label>
                    <p className="text-sm text-muted-foreground">
                      {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Unknown'}
                    </p>
                  </div>
                </div>
              )}

              {/* Danger Zone */}
              <div className="bg-card border border-red-200 rounded-lg p-6 space-y-4">
                <div className="flex items-center space-x-3">
                  <svg className="h-4 w-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <h3 className="text-sm font-medium text-red-600">Danger Zone</h3>
                </div>

                <p className="text-sm text-muted-foreground">
                  Once you logout, you'll need to sign in again to access your account.
                </p>

                <Button
                  onClick={handleLogout}
                  variant="outline"
                  size="sm"
                  className="border-red-200 text-red-600 hover:bg-red-50"
                >
                  Sign Out
                </Button>
              </div>
            </div>
          </motion.section>

        </div>
      </div>
    </div>
  )
}

export default Settings
