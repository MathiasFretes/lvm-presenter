export type lvmScopes = "plans"

export type lvmAuthData = {
    access_token: string
    refresh_token: string
    token_type: "Bearer"
    created_at: number
    expires_in: number
    scope: lvmScopes
} | null

export type lvmRequestData = {
    api: "doing" | "content" | "membership" | "lessons" | "messaging"
    scope: lvmScopes
    endpoint: string
    authenticated: boolean
    params?: Record<string, string>
    method?: "POST" | "GET"
    data?: any
}

// Prod URLs
export const LVM_API_URL = "https://api.lavozmisionera.com"
export const LVM_APP_URL = "https://admin.b1.church"
export const LESSONS_API_URL = "https://api.lessons.church"

// export const DEFAULT_LVM_DATA: lvmAuthData = {
//     access_token: "",
//     refresh_token: "",
//     token_type: "Bearer",
//     created_at: 0,
//     expires_in: 0,
//     scope: "plans",
// }

export interface lvmSongData {
    lvmPresenterId: string
    title: string
    artist: string
    lyrics: string
    ccliNumber: string
}

// Venue feed types
export interface FeedFile { name?: string; url?: string; streamUrl?: string; seconds?: number; fileType?: string; loopVideo?: boolean }
export interface FeedAction { id?: string; actionType?: string; content?: string; files?: FeedFile[] }
export interface FeedSection { id?: string; name?: string; actions?: FeedAction[] }
export interface FeedAddOn { id?: string; name?: string; files?: FeedFile[] }
export interface VenueFeed { sections?: FeedSection[]; files?: FeedAddOn[] }
