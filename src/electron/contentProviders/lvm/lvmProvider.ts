import { ContentProvider } from "../base/ContentProvider"
import { getKey } from "../../utils/keys"
import { lvmConnect } from "./lvmConnect"
import { lvmImport } from "./lvmImport"
import { lvmExport } from "./lvmExport"
import { httpsRequest } from "../../utils/requests"
import type { ContentLibraryCategory, ContentFile } from "../base/types"

// Import and re-export types
import type { lvmRequestData, lvmScopes } from "./types"
export type { lvmScopes } from "./types"

// Fix lvmAuthData to not include null in the export
export interface lvmAuthData {
    access_token: string
    refresh_token: string
    token_type: "Bearer"
    created_at: number
    expires_in: number
    scope: lvmScopes
}

/**
 * LVM Service provider that acts as the sole interface to LVM Service functionality.
 *
 * This is the ONLY class that should import from lvmConnect.ts, lvmImport.ts, and lvmExport.ts.
 * All external code should use this provider through ContentProviderRegistry.
 */
export class lvmProvider extends ContentProvider<lvmScopes, lvmAuthData> {
    hasContentLibrary = true

    constructor() {
        super({
            providerId: "lvm",
            displayName: "LVM Service",
            port: 5502,
            clientId: getKey("lvm_id") || "",
            clientSecret: getKey("lvm_secret") || "",
            apiUrl: "https://api.lavozmisionera.com",
            scopes: ["plans"] as const
        })
    }

    isConnected(scope: lvmScopes): boolean {
        return this.access !== null && this.access.scope === scope
    }

    async connect(scope: lvmScopes): Promise<lvmAuthData | null> {
        const result = await lvmConnect.connect(scope)
        this.access = result
        return result
    }

    disconnect(scope: lvmScopes = "plans"): void {
        lvmConnect.disconnect(scope)
        this.access = null
    }

    async apiRequest(data: lvmRequestData): Promise<any> {
        return lvmConnect.apiRequest(data)
    }

    async getToken(scope: lvmScopes) {
        return lvmConnect.getToken(scope)
    }

    async loadServices(): Promise<void> {
        return lvmImport.loadServices()
    }

    async startupLoad(scope: lvmScopes, data?: any): Promise<void> {
        lvmConnect.initialize()
        const connected = await this.connect(scope)
        if (!connected) return

        // Export songs to LVM Service if data provided
        if (data) {
            await lvmExport.sendSongsToLvm(data)
        }

        // Load services from LVM Service
        await lvmImport.loadServices()
    }

    /**
     * Export data to LVM Service (e.g., songs)
     */
    async exportData(data: any): Promise<void> {
        return lvmExport.sendSongsToLvm(data)
    }

    /**
     * Retrieves the content library category tree from LVM Service
     */
    async getContentLibrary(): Promise<ContentLibraryCategory[]> {
        return new Promise((resolve, reject) => {
            httpsRequest("https://api.lessons.church", "/lessons/public/tree", "GET", {}, {}, (err, data) => {
                if (err) {
                    console.error("Failed to fetch LVM Service content library:", err)
                    return reject(err)
                }

                const convertToCategories = (programs: any[]): ContentLibraryCategory[] => {
                    return programs.map((program) => ({
                        name: program.name,
                        thumbnail: program.image,
                        children: program.studies?.map((study: any) => ({
                            name: study.name,
                            thumbnail: study.image,
                            children: study.lessons?.map((lesson: any) => ({
                                name: lesson.name,
                                thumbnail: lesson.image,
                                children: lesson.venues?.map((venue: any) => ({
                                    name: venue.name,
                                    key: venue.id
                                }))
                            }))
                        }))
                    }))
                }

                try {
                    const categories = convertToCategories(data.programs || [])
                    resolve(categories)
                } catch (error) {
                    console.error("Failed to convert LVM Service content library:", error)
                    reject(error)
                }
            })
        })
    }

    /**
     * Retrieves content files for a given venue
     */
    async getContent(venueId: string): Promise<ContentFile[]> {
        return new Promise((resolve, reject) => {
            httpsRequest("https://api.lessons.church", `/venues/playlist/${venueId}`, "GET", {}, {}, (err, data) => {
                if (err) {
                    console.error("Failed to fetch LVM Service content:", err)
                    return reject(err)
                }

                try {
                    const files: ContentFile[] = []
                    const seenUrls = new Set<string>()

                    data.messages?.forEach((message: any) => {
                        message.files?.forEach((file: any) => {
                            const url = file.url

                            // Skip duplicates
                            if (seenUrls.has(url)) return
                            seenUrls.add(url)

                            const isVideo = url.endsWith(".mp4") || url.includes("/file.mp4")

                            files.push({
                                url,
                                thumbnail: file.thumbnail,
                                fileSize: 0,
                                type: isVideo ? "video" : "image",
                                name: file.name
                            })
                        })
                    })

                    resolve(files)
                } catch (error) {
                    console.error("Failed to convert LVM Service content:", error)
                    reject(error)
                }
            })
        })
    }

    protected handleAuthCallback(_req: any, _res: any): void {
        // Not used - lvmConnect handles authentication internally
    }

    protected async refreshToken(_scope: lvmScopes): Promise<lvmAuthData | null> {
        // Not used - lvmConnect handles token refresh internally
        return null
    }

    protected async authenticate(_scope: lvmScopes): Promise<lvmAuthData | null> {
        // Not used - lvmConnect handles authentication internally
        return null
    }
}
