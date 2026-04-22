import { describe, expect, it } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CameraPreview } from '@renderer/components/organisms/CameraPreview'

describe('CameraPreview', () => {
  it('renders a live preview image when camera is available', () => {
    render(<CameraPreview />)
    const img = screen.getByAltText('Live camera preview')
    expect(img).toBeInTheDocument()
    expect(img.getAttribute('src')).toContain('/preview/frame')
  })

  it('shows unavailable state when image fails to load', () => {
    render(<CameraPreview />)
    const img = screen.getByAltText('Live camera preview')
    fireEvent.error(img)
    expect(screen.getByText('Camera unavailable')).toBeInTheDocument()
  })

  it('does not show capture overlay when not capturing', () => {
    render(<CameraPreview isCapturing={false} />)
    // The ping animation only exists during capture.
    expect(document.querySelector('.animate-ping')).toBeNull()
  })

  it('shows capture overlay when isCapturing is true', () => {
    render(<CameraPreview isCapturing={true} />)
    expect(document.querySelector('.animate-ping')).toBeInTheDocument()
  })
})
