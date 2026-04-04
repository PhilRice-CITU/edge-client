import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CaptureButton } from '@renderer/components/molecules/CaptureButton'

describe('CaptureButton', () => {
  it('renders idle label when not capturing', () => {
    render(<CaptureButton onCapture={() => {}} isCapturing={false} />)
    expect(screen.getByRole('button', { name: /Capture Batch/i })).toBeInTheDocument()
  })

  it('renders capturing label while capturing', () => {
    render(<CaptureButton onCapture={() => {}} isCapturing={true} />)
    expect(screen.getByRole('button', { name: /Capturing/i })).toBeInTheDocument()
  })

  it('is disabled while capturing', () => {
    render(<CaptureButton onCapture={() => {}} isCapturing={true} />)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('calls onCapture when clicked', async () => {
    const user = userEvent.setup()
    let called = false
    render(<CaptureButton onCapture={() => { called = true }} isCapturing={false} />)
    await user.click(screen.getByRole('button'))
    expect(called).toBe(true)
  })
})
