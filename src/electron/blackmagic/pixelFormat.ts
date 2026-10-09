// Byte-order conversions retained for the optional DeckLink path.
// The caller owns the buffer; conversions happen in place.
export function argbToRgba(pixels: Buffer): void {
    for (let i = 0; i + 3 < pixels.length; i += 4) {
        const [a, r, g, b] = pixels.subarray(i, i + 4)
        pixels[i] = r
        pixels[i + 1] = g
        pixels[i + 2] = b
        pixels[i + 3] = a
    }
}

export function bgraToRgba(pixels: Buffer): void {
    for (let i = 0; i + 3 < pixels.length; i += 4) {
        const blue = pixels[i]
        pixels[i] = pixels[i + 2]
        pixels[i + 2] = blue
    }
}

export function bgraToBgrx(pixels: Buffer): void {
    for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255
}

export function argbToBgra(pixels: Buffer): void {
    for (let i = 0; i + 3 < pixels.length; i += 4) {
        const [a, r, g, b] = pixels.subarray(i, i + 4)
        pixels[i] = b
        pixels[i + 1] = g
        pixels[i + 2] = r
        pixels[i + 3] = a
    }
}
