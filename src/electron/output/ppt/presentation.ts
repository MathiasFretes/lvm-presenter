// External PowerPoint/Keynote control depended on the removed slideshow package.
// File import/conversion remains available through libreConverter and pptToShow.
// A first-party controller can replace these disabled IPC endpoints later.

export function getPresentationApplications(): string[] {
    return []
}

export function startSlideshow(_data: { path: string; program: string }): void {
    console.warn("External slideshow control is unavailable in LVM Presenter")
}

export function presentationControl(_data: { action: string }): void {
    // No external slideshow is running.
}
