import { serviceToProject } from "./serviceToProject.mjs"

export function parseProjectImport(content) {
    const value = JSON.parse(content)
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected a project or Service 0.1 file")
    if (!value.project && ("schemaVersion" in value || "items" in value)) return serviceToProject(value)
    if (!value.project || !value.shows || typeof value.shows !== "object") throw new Error("Expected a project or Service 0.1 file")
    return value
}
