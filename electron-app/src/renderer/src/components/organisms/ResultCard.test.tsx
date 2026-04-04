import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ResultCard } from '@renderer/components/organisms/ResultCard'

beforeEach(() => {
  vi.stubGlobal('api', { openExternal: vi.fn() })
})

describe('ResultCard', () => {
  it('displays the grade prominently', () => {
    render(<ResultCard grade="Premium" dashboardUrl={null} batchCount={3} />)
    expect(screen.getByRole('heading', { name: 'Premium' })).toBeInTheDocument()
  })

  it('shows singular "batch" when batchCount is 1', () => {
    render(<ResultCard grade="Grade A" dashboardUrl={null} batchCount={1} />)
    expect(screen.getByText('from 1 batch')).toBeInTheDocument()
  })

  it('shows plural "batches" when batchCount > 1', () => {
    render(<ResultCard grade="Grade B" dashboardUrl={null} batchCount={4} />)
    expect(screen.getByText('from 4 batches')).toBeInTheDocument()
  })

  it('hides the dashboard button when dashboardUrl is null', () => {
    render(<ResultCard grade="Premium" dashboardUrl={null} batchCount={2} />)
    expect(screen.queryByRole('button', { name: /View on Dashboard/i })).not.toBeInTheDocument()
  })

  it('shows the dashboard button when dashboardUrl is provided', () => {
    render(<ResultCard grade="Premium" dashboardUrl="https://example.com/r/123" batchCount={2} />)
    expect(screen.getByRole('button', { name: /View on Dashboard/i })).toBeInTheDocument()
  })

  it('calls window.api.openExternal when dashboard button is clicked', async () => {
    const user = userEvent.setup()
    const url = 'https://example.com/r/123'
    render(<ResultCard grade="Premium" dashboardUrl={url} batchCount={2} />)
    await user.click(screen.getByRole('button', { name: /View on Dashboard/i }))
    expect(window.api.openExternal).toHaveBeenCalledWith(url)
  })
})
