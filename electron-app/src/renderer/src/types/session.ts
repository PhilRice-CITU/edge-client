export type SessionMode = 'grade' | 'train'

export type SessionStatus = 'capturing' | 'submitted' | 'graded' | 'failed'

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
  result_id: string | null
  result_grade: string | null
  dashboard_url: string | null
  created_at: string
}

export interface DeviceStatus {
  device_id: string
  edge_mode: string
  images_on_disk: number
  queued_uploads: number
}
