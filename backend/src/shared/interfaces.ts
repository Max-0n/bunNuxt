export interface VaultResponse<T> {
  request_id: string
  lease_id: string
  renewable: boolean
  lease_duration: number
  data: {
    data: T
    metadata: {
      created_time: string
      custom_metadata: Record<string, any> | null
      deletion_time: string
      destroyed: boolean
      version: number
    }
  }
  wrap_info: any | null
  warnings: string[] | null
  auth: any | null
}

export interface PromptsData {
  description: string
  image: string
  name: string
  categories: string
  material: string
  mood: string
  style: string
  background: string
  clip: string
}

export type VaultPromptsResponse = VaultResponse<PromptsData>

export interface Txt2ImgSettings {
  steps: number
  cfg_scale: number
  width: number
  height: number
  sampler_name: string
  seed: number
  restore_faces: boolean
  enable_hr: boolean
  hr_upscaler: string
  hr_scale: number
  hr_second_pass_steps: number
  denoising_strength: number
}

export type VaultModelResponse = VaultResponse<Txt2ImgSettings>
