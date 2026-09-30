import express from "express"
import { ToMain } from "../../../types/IPC/ToMain"
import { getContentProviderAccess, setContentProviderAccess } from "../../data/contentProviders"
import { sendToMain } from "../../IPC/main"
import { openURL } from "../../IPC/responsesMain"
import { getKey } from "../../utils/keys"
import { httpsRequest } from "../../utils/requests"
import type { lvmAuthData, lvmRequestData, lvmScopes } from "./types"
import { LVM_API_URL, LVM_APP_URL, LESSONS_API_URL } from "./types"

/**
 * Handles authentication and API communication with the LVM Service service.
 * Manages OAuth flow, token refresh, and provides methods for making authenticated API requests.
 *
 * WARNING: This class should ONLY be accessed through lvmProvider.
 * Do not import or use this class directly in other parts of the application.
 * Use ContentProviderRegistry or lvmProvider instead.
 */
export class lvmConnect {
    private static app = express()
    private static readonly LVM_PORT = 5502
    private static LVM_ACCESS: lvmAuthData = null
    private static readonly clientId: string = getKey("lvm_id")
    private static readonly clientSecret: string = getKey("lvm_secret")

    private static readonly HTML_SUCCESS = `
    <head>
        <title>Success!</title>
    </head>
    <body style="padding: 80px;background: #242832;color: #f0f0ff;font-family: system-ui;font-size: 1.2em;">
        <h1 style="color: #f0008c;">Success!</h1>
        <p>You can close this page</p>
    </body>
  `

    private static readonly HTML_ERROR = `
    <head>
        <title>Error!</title>
    </head>
    <body style="padding: 80px;background: #242832;color: #f0f0ff;font-family: system-ui;font-size: 1.2em;">
        <h1>Could not complete authentication!</h1>
        <p>{error_msg}</p>
    </body>
  `

    // reset if frontend reloads (dev)
    public static initialize() {
        this.LVM_ACCESS = null
    }

    public static async connect(scope: lvmScopes): Promise<lvmAuthData> {
        let accessData = this.LVM_ACCESS || (getContentProviderAccess("lvm", scope) as lvmAuthData)

        if (this.hasExpired(accessData)) accessData = await this.refreshToken(accessData)
        if (!accessData) accessData = await this.authenticate(scope)
        if (!accessData) return null

        if (!this.LVM_ACCESS) connectionInitialized()
        this.LVM_ACCESS = accessData

        return accessData
    }

    public static disconnect(scope: lvmScopes = "plans"): { success: boolean } {
        setContentProviderAccess("lvm", scope, null)
        this.LVM_ACCESS = null
        return { success: true }
    }

    public static async apiRequest(data: lvmRequestData): Promise<any> {
        let token = ""
        if (data.authenticated) {
            const ACCESS = await this.connect(data.scope)
            if (!ACCESS) {
                sendToMain(ToMain.ALERT, "Not authorized at LVM Service (try logging out and in again)!")
                return null
            }
            token = ACCESS.access_token
        }

        return new Promise((resolve) => {
            let apiUrl = LVM_API_URL
            let fullEndpoint = ""

            if (data.api === "lessons") {
                apiUrl = LESSONS_API_URL
                fullEndpoint = data.endpoint
            } else {
                const pathPrefix = data.api === "doing" ? "/doing" : data.api === "membership" ? "/membership" : data.api === "messaging" ? "/messaging" : "/content"
                fullEndpoint = `${pathPrefix}${data.endpoint}`
            }

            const headers = token ? { Authorization: `Bearer ${token}` } : {}
            httpsRequest(apiUrl, fullEndpoint, data.method || "GET", headers, data.data || {}, (err, result) => {
                if (err) {
                    // ignore if checking for missing songs
                    if (fullEndpoint.includes("/missing")) return resolve(null)

                    // log as warning — these failures are expected when offline or API is unavailable
                    console.warn("Could not get data", apiUrl + fullEndpoint, err?.statusCode || err?.code || err?.message)
                    return resolve(null)
                } else resolve(result)
            })
        })
    }

    public static async getToken(scope: lvmScopes): Promise<string | null> {
        const access = await this.connect(scope)
        return access ? access.access_token : null
    }

    private static async authenticate(scope: lvmScopes): Promise<lvmAuthData> {
        const path = "/auth/complete"
        const redirect_uri = `http://localhost:${this.LVM_PORT}${path}`

        const server = this.app.listen(this.LVM_PORT, () => {
            console.info(`Listening for LVM Service OAuth response at port ${this.LVM_PORT}`)
        })

        server.once("error", (err: Error) => {
            if ((err as any).code === "EADDRINUSE") server.close()
        })

        this.app.use(express.json())

        return new Promise((resolve) => {
            this.app.get(path, (req, res) => {
                const code = req.query.code?.toString() || ""
                if (!code) return resolve(null)

                console.info("OAuth code received!")

                const params = {
                    grant_type: "authorization_code",
                    code,
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    redirect_uri
                }

                httpsRequest(LVM_API_URL, "/membership/oauth/token", "POST", {}, params, (err, data: lvmAuthData) => {
                    if (err) {
                        res.setHeader("Content-Type", "text/html")
                        const errorPage = this.HTML_ERROR.replace("{error_msg}", err.message)
                        res.send(errorPage)

                        sendToMain(ToMain.ALERT, "Could not authorize! " + err.message)
                        return resolve(null)
                    }

                    console.info("OAuth completed!")

                    res.setHeader("Content-Type", "text/html")
                    res.send(this.HTML_SUCCESS)

                    server.close()

                    setContentProviderAccess("lvm", scope, data)
                    this.LVM_ACCESS = data
                    connectionInitialized(true)
                    resolve(data)
                })
            })

            const URL = `${LVM_APP_URL}/login?returnUrl=` + encodeURIComponent(`/oauth?client_id=${this.clientId}&redirect_uri=${encodeURIComponent(redirect_uri)}&response_type=code&scope=${scope}`) + "&forceLogin=1"
            openURL(URL)
        })
    }

    private static hasExpired(access: lvmAuthData): boolean {
        if (!access?.created_at || !access?.expires_in) return true
        return (access.created_at + access.expires_in) * 1000 < Date.now()
    }

    private static refreshToken(access: lvmAuthData): Promise<lvmAuthData> {
        return new Promise((resolve) => {
            if (!access?.refresh_token) return resolve(null)
            console.info("Refreshing LVM Service OAuth token")

            const params = {
                grant_type: "refresh_token",
                client_id: this.clientId,
                client_secret: this.clientSecret,
                refresh_token: access.refresh_token
            }

            httpsRequest(LVM_API_URL, "/membership/oauth/token", "POST", {}, params, (err, data: lvmAuthData) => {
                if (err || data === null) {
                    this.disconnect()
                    sendToMain(ToMain.ALERT, "Could not refresh token! " + String(err?.message))
                    resolve(null)
                    return
                }

                setContentProviderAccess("lvm", data.scope, data)
                resolve(data)
            })
        })
    }
}

function connectionInitialized(isFirstConnection = false) {
    sendToMain(ToMain.PROVIDER_CONNECT, { providerId: "lvm", success: true, isFirstConnection })
}
