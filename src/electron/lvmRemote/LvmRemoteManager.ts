import { requestToMain } from "../IPC/main"
import { ToMain, type LvmRemotePresentationState } from "../../types/IPC/ToMain"
import { RemoteTransportServer, type PairingLink } from "./RemoteTransportServer"
import type { PairingPending } from "./RemotePairingService"

export type LvmRemoteStatus = {
    active: boolean
    port: number | null
    pairingLink: PairingLink | null
    pending: PairingPending | null
}

/** Owns the Presenter-side lifecycle for the first-party LAN remote only. */
export class LvmRemoteManager {
    private server: RemoteTransportServer | null = null
    private statusValue: LvmRemoteStatus = { active: false, port: null, pairingLink: null, pending: null }
    private latestState: LvmRemotePresentationState = {
        show: null,
        current: null,
        output: { isLive: false, isCleared: false }
    }

    status() {
        return this.statusValue
    }

    async start(lanAddress: string, onPairingPending: (pending: PairingPending) => void) {
        await this.stop()
        this.latestState = await this.readState()
        const server = new RemoteTransportServer({
            initialState: () => this.latestState,
            onPairingPending: (pending) => {
                this.statusValue = { ...this.statusValue, pending }
                onPairingPending(pending)
            },
            onCommand: async ({ command, slideIndex }) => {
                const state = await this.readState(command, slideIndex)
                this.latestState = state
                return state
            }
        })
        const port = await server.start(4319)
        this.server = server
        this.statusValue = {
            active: true,
            port,
            pairingLink: server.createPairingLink(lanAddress, port),
            pending: null
        }
        return this.status()
    }

    async stop() {
        await this.server?.close()
        this.server = null
        this.statusValue = { active: false, port: null, pairingLink: null, pending: null }
        return this.status()
    }

    approve(pairingId: string) {
        if (!this.server) throw new Error("remote_transport_not_started")
        this.server.approvePairing(pairingId)
        this.statusValue = { ...this.statusValue, pending: null }
        return this.status()
    }

    private async readState(command?: "next" | "previous" | "goTo" | "clear" | "restore", slideIndex?: number) {
        const state = await requestToMain(ToMain.LVM_REMOTE_ACTION, { command: command ?? "restore", slideIndex })
        if (!state) throw new Error("remote_presentation_unavailable")
        return state
    }
}

export const lvmRemoteManager = new LvmRemoteManager()
