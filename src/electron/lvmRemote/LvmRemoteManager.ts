import { requestToMain } from "../IPC/main"
import { ToMain, type LvmRemotePresentationState } from "../../types/IPC/ToMain"
import { RemoteTransportServer, type PairingLink } from "./RemoteTransportServer"
import { RemotePairingFailure, type PairingPending } from "./RemotePairingService"

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
            onCommand: async ({ command, slideIndex, reference }) => {
                const state = await this.readState(command, slideIndex, reference)
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
        try {
            this.server.approvePairing(pairingId)
        } catch (error) {
            if (!(error instanceof RemotePairingFailure) || error.code !== "expired_pairing") throw error
            // A request can expire while its approval button is visible. Give
            // the phone an explicit rejection and replace the expired QR.
            const address = this.statusValue.pairingLink && new URL(this.statusValue.pairingLink.url).searchParams.get("host")
            if (address && this.statusValue.port) {
                this.statusValue = {
                    ...this.statusValue,
                    pairingLink: this.server.createPairingLink(address, this.statusValue.port)
                }
            }
        }
        this.statusValue = { ...this.statusValue, pending: null }
        return this.status()
    }

    refreshPairing(lanAddress: string) {
        if (!this.server || !this.statusValue.port) throw new Error("remote_transport_not_started")
        this.statusValue = {
            ...this.statusValue,
            pairingLink: this.server.createPairingLink(lanAddress, this.statusValue.port),
            pending: null
        }
        return this.status()
    }

    /**
     * Renderer state changes are authoritative for an active presentation.
     * Publish them to paired devices so a phone never remains stuck on the
     * snapshot that happened to exist when it was paired.
     */
    async publishState() {
        if (!this.server) return
        const state = await this.readState()
        this.latestState = state
        this.server.broadcastState(state)
    }

    private async readState(command?: "next" | "previous" | "goTo" | "clear" | "restore" | "scripture", slideIndex?: number, reference?: string) {
        const state = await requestToMain(ToMain.LVM_REMOTE_ACTION, { command: command ?? "snapshot", slideIndex, reference })
        if (!state) throw new Error("remote_presentation_unavailable")
        return state
    }
}

export const lvmRemoteManager = new LvmRemoteManager()
