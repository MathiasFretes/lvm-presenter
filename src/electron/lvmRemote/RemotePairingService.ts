import { randomBytes, randomUUID } from "crypto"

export type RemoteDevice = {
    id: string
    name: string
}

export type RemoteCommand = "next" | "previous" | "goTo" | "clear" | "restore" | "scripture"

export type PairingOffer = {
    schemaVersion: "0.1"
    pairingId: string
    pairingSecret: string
    expiresAt: string
}

export type PairingRequest = {
    pairingId: string
    pairingSecret: string
    device: RemoteDevice
}

export type PairingPending = {
    pairingId: string
    device: RemoteDevice
}

export type RemoteSession = {
    token: string
    device: RemoteDevice
    expiresAt: string
}

export type PairingError = "invalid_pairing" | "expired_pairing" | "invalid_session" | "expired_session"

export class RemotePairingFailure extends Error {
    constructor(public readonly code: PairingError) {
        super(code)
        this.name = "RemotePairingFailure"
    }
}

type PendingPairing = {
    secret: string
    expiresAt: number
    device?: RemoteDevice
}

type SessionRecord = RemoteSession & {
    expiresAtMillis: number
}

export type RemotePairingOptions = {
    now?: () => number
    randomId?: () => string
    randomSecret?: () => string
    pairingLifetimeMs?: number
    sessionLifetimeMs?: number
}

/**
 * Owns only the local pairing/session lifecycle for LVM Presenter Remote 0.1.
 *
 * It does not open a port, use socket.io, read presentation data, or apply
 * commands. The future LVM network adapter and Presentation Engine both depend
 * on this small boundary instead of the inherited remote server.
 */
export class RemotePairingService {
    private readonly now: () => number
    private readonly randomId: () => string
    private readonly randomSecret: () => string
    private readonly pairingLifetimeMs: number
    private readonly sessionLifetimeMs: number
    private readonly pairings = new Map<string, PendingPairing>()
    private readonly sessions = new Map<string, SessionRecord>()

    constructor(options: RemotePairingOptions = {}) {
        this.now = options.now ?? Date.now
        this.randomId = options.randomId ?? randomUUID
        this.randomSecret = options.randomSecret ?? (() => randomBytes(32).toString("base64url"))
        this.pairingLifetimeMs = options.pairingLifetimeMs ?? 2 * 60 * 1000
        this.sessionLifetimeMs = options.sessionLifetimeMs ?? 8 * 60 * 60 * 1000
    }

    createPairing(): PairingOffer {
        this.prune()
        const pairingId = this.randomId()
        const expiresAt = this.now() + this.pairingLifetimeMs
        const secret = this.randomSecret()
        this.pairings.set(pairingId, { secret, expiresAt })
        return {
            schemaVersion: "0.1",
            pairingId,
            pairingSecret: secret,
            expiresAt: new Date(expiresAt).toISOString()
        }
    }

    requestPairing(request: PairingRequest): PairingPending {
        const pairing = this.pairings.get(request.pairingId)
        if (!pairing || pairing.secret !== request.pairingSecret) throw new RemotePairingFailure("invalid_pairing")
        if (pairing.expiresAt <= this.now()) {
            this.pairings.delete(request.pairingId)
            throw new RemotePairingFailure("expired_pairing")
        }
        if (!isRemoteDevice(request.device)) throw new RemotePairingFailure("invalid_pairing")
        pairing.device = { ...request.device }
        return { pairingId: request.pairingId, device: pairing.device }
    }

    approvePairing(pairingId: string): RemoteSession {
        const pairing = this.pairings.get(pairingId)
        if (!pairing || !pairing.device) throw new RemotePairingFailure("invalid_pairing")
        if (pairing.expiresAt <= this.now()) {
            this.pairings.delete(pairingId)
            throw new RemotePairingFailure("expired_pairing")
        }
        this.pairings.delete(pairingId)
        const expiresAtMillis = this.now() + this.sessionLifetimeMs
        const session: SessionRecord = {
            token: this.randomSecret(),
            device: pairing.device,
            expiresAt: new Date(expiresAtMillis).toISOString(),
            expiresAtMillis
        }
        this.sessions.set(session.token, session)
        return toSession(session)
    }

    authorize(token: string): RemoteSession {
        const session = this.sessions.get(token)
        if (!session) throw new RemotePairingFailure("invalid_session")
        if (session.expiresAtMillis <= this.now()) {
            this.sessions.delete(token)
            throw new RemotePairingFailure("expired_session")
        }
        return toSession(session)
    }

    revokeDevice(deviceId: string) {
        for (const [token, session] of this.sessions) {
            if (session.device.id === deviceId) this.sessions.delete(token)
        }
    }

    close() {
        this.pairings.clear()
        this.sessions.clear()
    }

    private prune() {
        const now = this.now()
        for (const [pairingId, pairing] of this.pairings) {
            if (pairing.expiresAt <= now) this.pairings.delete(pairingId)
        }
        for (const [token, session] of this.sessions) {
            if (session.expiresAtMillis <= now) this.sessions.delete(token)
        }
    }
}

export function isRemoteCommand(value: unknown): value is RemoteCommand {
    return value === "next" || value === "previous" || value === "goTo" || value === "clear" || value === "restore" || value === "scripture"
}

function isRemoteDevice(value: RemoteDevice): boolean {
    return Boolean(value?.id?.trim() && value?.name?.trim())
}

function toSession(session: SessionRecord): RemoteSession {
    return {
        token: session.token,
        device: { ...session.device },
        expiresAt: session.expiresAt
    }
}
