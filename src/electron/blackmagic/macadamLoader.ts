// DISABLED: Blackmagic DeckLink integration requires native SDK bindings.
// This is a stub until the native module is implemented.

// Keep the optional DeckLink boundary typed as a possible runtime module so
// callers compile, while the capability remains unavailable in this build.
export function getMacadam(): Record<string, any> | null {
    return null
}
