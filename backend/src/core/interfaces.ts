export interface VaultMetadata {
  created_time: string
  custom_metadata: null | Record<string, string>
  deletion_time: string
  destroyed: boolean
  version: number
}

export interface VaultResponse<T = unknown> {
  request_id: string
  lease_id: string
  renewable: boolean
  lease_duration: number
  data: {
    data: T
    metadata: VaultMetadata
  }
  wrap_info: null | unknown
  warnings: null | string[]
  auth: null | unknown
}
