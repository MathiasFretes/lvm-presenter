import { describe, expect, it } from "vitest"
import { isRemoteCommand, RemotePairingFailure, RemotePairingService } from "./RemotePairingService"

function testService(now = 1000) {
    let currentTime = now
    let id = 0
    const service = new RemotePairingService({
        now: () => currentTime,
        randomId: () => `id-${++id}`,
        randomSecret: () => `secret-${++id}`,
        pairingLifetimeMs: 100,
        sessionLifetimeMs: 200
    })
    return {
        service,
        advance(milliseconds: number) {
            currentTime += milliseconds
        }
    }
}

describe("RemotePairingService", () => {
    it("requires a local approval before a remote receives a session", () => {
        const { service } = testService()
        const offer = service.createPairing()

        expect(() => service.approvePairing(offer.pairingId)).toThrow(RemotePairingFailure)
        const pending = service.requestPairing({
            pairingId: offer.pairingId,
            pairingSecret: offer.pairingSecret,
            device: { id: "android-1", name: "Honor 200 Pro" }
        })
        expect(pending.device.name).toBe("Honor 200 Pro")

        const session = service.approvePairing(offer.pairingId)
        expect(service.authorize(session.token).device.id).toBe("android-1")
        expect(() => service.approvePairing(offer.pairingId)).toThrow("invalid_pairing")
    })

    it("rejects bad or expired pairing credentials", () => {
        const { service, advance } = testService()
        const offer = service.createPairing()
        expect(() =>
            service.requestPairing({
                pairingId: offer.pairingId,
                pairingSecret: "wrong",
                device: { id: "android-1", name: "Honor" }
            })
        ).toThrow("invalid_pairing")

        advance(100)
        expect(() =>
            service.requestPairing({
                pairingId: offer.pairingId,
                pairingSecret: offer.pairingSecret,
                device: { id: "android-1", name: "Honor" }
            })
        ).toThrow("expired_pairing")
    })

    it("expires and revokes sessions without retaining remote access", () => {
        const { service, advance } = testService()
        const offer = service.createPairing()
        service.requestPairing({
            pairingId: offer.pairingId,
            pairingSecret: offer.pairingSecret,
            device: { id: "android-1", name: "Honor" }
        })
        const session = service.approvePairing(offer.pairingId)
        service.revokeDevice("android-1")
        expect(() => service.authorize(session.token)).toThrow("invalid_session")

        const replacement = service.createPairing()
        service.requestPairing({
            pairingId: replacement.pairingId,
            pairingSecret: replacement.pairingSecret,
            device: { id: "android-2", name: "Tablet" }
        })
        const replacementSession = service.approvePairing(replacement.pairingId)
        advance(200)
        expect(() => service.authorize(replacementSession.token)).toThrow("expired_session")
    })

    it("allows only the five commands defined by Remote Control 0.1", () => {
        expect(isRemoteCommand("next")).toBe(true)
        expect(isRemoteCommand("goTo")).toBe(true)
        expect(isRemoteCommand("deleteShow")).toBe(false)
        expect(isRemoteCommand({ type: "next" })).toBe(false)
    })
})
