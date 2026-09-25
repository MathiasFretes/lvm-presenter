import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { serviceToProject } from '../../src/lvm/serviceToProject.mjs'

const [input, output] = process.argv.slice(2)
if (!input || !output) {
    console.error('Usage: npm run lvm:service-to-project -- <service.json> <output.project>')
    process.exit(2)
}

const service = JSON.parse(await readFile(input, 'utf8'))
const project = serviceToProject(service)
await mkdir(dirname(output), { recursive: true })
await writeFile(output, JSON.stringify(project, null, 2) + '\n')
console.log(`Created ${output}: ${project.project.shows.length} items`)
