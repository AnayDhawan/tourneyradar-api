export type Tournament = {
  id: string
  name: string
  location: string
  city?: string
  state: string
  country?: string
  country_code?: string
  lat: number
  lng: number
  category: string | null
  date: string
  end_date?: string
  fide_rated: boolean
  time_control: string
  rounds: number
  organizer_name: string
  registration_link: string | null
  source_url?: string
  status: string
  format?: string | null
  min_rating?: number | null
  max_rating?: number | null
  external_link?: string | null
  source?: string | null
  scraped_at?: string | null
}

export type ApiResponse<T> = {
  data: T
  meta?: {
    page: number
    limit: number
    total: number
    hasMore: boolean
  }
}

export type ApiError = {
  error: string
  status: number
}
