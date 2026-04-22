export type SessionMode = 'grade' | 'train'

export type SessionStatus = 'capturing' | 'submitted' | 'failed'

export interface Batch {
  batch_number: number
  ir_path: string
  white_path: string
  captured_at: string
}

export interface Session {
  id: string
  mode: SessionMode
  operator_name: string
  rice_variety: string | null
  batches: Batch[]
  status: SessionStatus
  created_at: string
}

export interface Region {
  id: string
  name: string
  code: string
}

export interface DeviceStatus {
  device_id: string
  display_name: string
  edge_mode: string
  images_on_disk: number
  queued_uploads: number
  qr_url: string
}
