import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusBadge } from '@renderer/components/molecules/StatusBadge'
import type { DeviceStatus } from '@renderer/types/session'

const mockStatus: DeviceStatus = {
  device_id: 'pi-001',
  edge_mode: 'production',
  images_on_disk: 3,
  queued_uploads: 0,
  display_name: 'Test Device',
  qr_url: '',
}


describe('StatusBadge', () => {
  it('shows "Offline" when status is undefined', () => {
    render(<StatusBadge status={undefined} />)
    expect(screen.getByText('Offline')).toBeInTheDocument()
  })

  it('shows device_id when status is provided', () => {
    render(<StatusBadge status={mockStatus} />)
    expect(screen.getByText('pi-001')).toBeInTheDocument()
    expect(screen.queryByText('Offline')).not.toBeInTheDocument()
  })
})
