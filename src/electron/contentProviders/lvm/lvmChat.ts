import { lvmConnect } from "./lvmConnect"

export class lvmChat {
    public static async getOrCreateConversation(teamId: string): Promise<string | null> {
        const getResult = await lvmConnect.apiRequest({ api: "messaging", scope: "plans", endpoint: `/conversations/messages/lvmpresenter/${teamId}`, authenticated: true, method: "GET" })

        if (Array.isArray(getResult) && getResult.length > 0 && getResult[0].id) {
            return getResult[0].id
        }

        const createData = [{ contentType: "lvmpresenter", contentId: teamId, allowAnonymousPosts: true, visibility: "public" }]
        const createResult = await lvmConnect.apiRequest({ api: "messaging", scope: "plans", endpoint: "/conversations", authenticated: true, method: "POST", data: createData })

        if (Array.isArray(createResult) && createResult.length > 0 && createResult[0].id) {
            return createResult[0].id
        }

        console.error("[lvmChat] Failed to get or create conversation")
        return null
    }

    public static async sendMessage(data: { churchId: string; conversationId: string; displayName: string; content: string }): Promise<boolean> {
        const message = [{ content: data.content, conversationId: data.conversationId, displayName: data.displayName }]
        const result = await lvmConnect.apiRequest({ api: "messaging", scope: "plans", endpoint: "/messages", authenticated: true, method: "POST", data: message })
        return result !== null
    }
}
