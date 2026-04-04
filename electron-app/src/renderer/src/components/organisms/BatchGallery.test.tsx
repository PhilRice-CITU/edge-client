import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BatchGallery } from '@renderer/components/organisms/BatchGallery'
import type { Batch } from '@renderer/types/session'

const mockBatches: Batch[] = [
  { batch_number: 1, ir_path: '/tmp/ir1.jpg', white_path: '/tmp/white1.jpg', captured_at: '2026-01-01T00:00:00Z' },
  { batch_number: 2, ir_path: '/tmp/ir2.jpg', white_path: '/tmp/white2.jpg', captured_at: '2026-01-01T00:00:00Z' },
]

describe('BatchGallery', () => {
  it('shows empty state when batches array is empty', () => {
    render(<BatchGallery batches={[]} />)
    expect(screen.getByText('No batches yet')).toBeInTheDocument()
    expect(screen.getByText('Press Capture to start')).toBeInTheDocument()
  })

  it('renders a BatchCard for each batch', () => {
    render(<BatchGallery batches={mockBatches} />)
    expect(screen.queryByText('No batches yet')).not.toBeInTheDocument()
    // BatchCard renders "Batch 1", "Batch 2" — match the numeric pattern
    expect(screen.getAllByText(/^Batch \d+$/i)).toHaveLength(2)
  })

  it('does not render the empty state when batches are present', () => {
    render(<BatchGallery batches={mockBatches} />)
    expect(screen.queryByText('Press Capture to start')).not.toBeInTheDocument()
  })
})
