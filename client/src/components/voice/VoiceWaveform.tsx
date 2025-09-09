import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'

interface VoiceWaveformProps {
  audioLevel: number // 0-1
  isListening: boolean
  className?: string
}

export function VoiceWaveform({ audioLevel, isListening, className = '' }: VoiceWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return
    }

    const draw = () => {
      const { width, height } = canvas
      
      // Clear canvas
      ctx.clearRect(0, 0, width, height)
      
      if (!isListening) {
        // Draw idle state - small centered dot
        ctx.fillStyle = 'rgba(99, 102, 241, 0.3)'
        ctx.beginPath()
        ctx.arc(width / 2, height / 2, 2, 0, Math.PI * 2)
        ctx.fill()
        return
      }

      // Draw waveform bars
      const barCount = 5
      const barWidth = 2
      const maxBarHeight = height - 8
      const spacing = 2
      const totalWidth = barCount * barWidth + (barCount - 1) * spacing
      const startX = (width - totalWidth) / 2

      for (let i = 0; i < barCount; i++) {
        const x = startX + i * (barWidth + spacing)
        
        // Create wave-like motion with different phases
        const phase = (Date.now() / 200) + (i * 0.5)
        const baseHeight = Math.sin(phase) * audioLevel * maxBarHeight * 0.3
        const levelHeight = audioLevel * maxBarHeight * 0.7
        const barHeight = Math.max(2, Math.abs(baseHeight) + levelHeight)
        
        const y = (height - barHeight) / 2
        
        // Color based on audio level
        const intensity = Math.min(1, audioLevel * 2)
        const color = `rgba(99, 102, 241, ${0.4 + intensity * 0.6})`
        
        ctx.fillStyle = color
        ctx.fillRect(x, y, barWidth, barHeight)
      }
    }

    let animationId: number
    const animate = () => {
      draw()
      animationId = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId)
      }
    }
  }, [audioLevel, isListening])

  return (
    <motion.div
      className={`flex items-center justify-center ${className}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <canvas
        ref={canvasRef}
        width={32}
        height={16}
        className="rounded-sm"
        style={{
          imageRendering: 'pixelated'
        }}
      />
    </motion.div>
  )
}