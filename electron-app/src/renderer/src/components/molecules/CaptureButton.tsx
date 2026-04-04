import { Camera } from 'lucide-react'
import { Button } from '@renderer/components/atoms/Button'
import { cn } from '@renderer/lib/utils'

interface CaptureButtonProps {
  onCapture: () => void
  isCapturing: boolean
  className?: string
}

export function CaptureButton({ onCapture, isCapturing, className }: CaptureButtonProps) {
  return (
    <Button
      onClick={onCapture}
      disabled={isCapturing}
      size="kiosk"
      variant="outline"
      className={cn('w-full gap-3', className)}
    >
      <Camera className={cn('h-6 w-6', isCapturing && 'animate-pulse')} />
      {isCapturing ? 'Capturing…' : 'Capture Batch'}
    </Button>
  )
}
