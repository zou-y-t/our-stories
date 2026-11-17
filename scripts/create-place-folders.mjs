import { mkdir, readdir, rmdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import chinaProvinces from 'cn-atlas/provinces.json' with { type: 'json' }
import chinaPrefectures from 'cn-atlas/prefectures.json' with { type: 'json' }
import { municipalities } from './municipality-data.mjs'
import { legacyAreas } from './legacy-boundaries.mjs'

const root = path.resolve('public/china')
const safeName = (value) => value.replace(/[\\/:*?"<>|]/g, ' ').trim()
const expectedPaths = new Set()
let created = 0

await mkdir(root, { recursive: true })
for (const province of chinaProvinces.features) {
  const provinceName = province.properties['地名']
  const municipality = municipalities[provinceName]
  const prefectureRegions = chinaPrefectures.features.filter((feature) => {
        const code = String(feature.properties?.id ?? '')
        return code.startsWith(String(province.properties.id).slice(0, 2)) && code !== String(province.properties.id)
      })
  const useLegacyRegions = !municipality && prefectureRegions.length === 0
  const regions = municipality
    ? municipality.places.map((name) => ({ properties: { name } }))
    : useLegacyRegions ? legacyAreas[provinceName]?.features ?? [] : prefectureRegions
  for (const region of regions) {
    let cityName = municipality || useLegacyRegions ? region.properties?.name : region.properties?.['地名']
    if (!cityName) cityName = '未命名地区'
    if (useLegacyRegions && !/(区|县|自治县|旗|自治旗|市)$/.test(cityName)) cityName += '地区'
    const directory = path.join(root, safeName(provinceName), safeName(cityName))
    expectedPaths.add(path.resolve(directory))
    await mkdir(directory, { recursive: true })
    await writeFile(path.join(directory, '.gitkeep'), '')
    created += 1
  }
}

if (process.argv.includes('--prune-stale')) {
  for (const province of await readdir(root, { withFileTypes: true })) {
    if (!province.isDirectory()) continue
    const provincePath = path.join(root, province.name)
    for (const place of await readdir(provincePath, { withFileTypes: true })) {
      if (!place.isDirectory()) continue
      const placePath = path.resolve(provincePath, place.name)
      if (expectedPaths.has(placePath)) continue
      const contents = await readdir(placePath, { withFileTypes: true })
      if (contents.length !== 1 || contents[0].name !== '.gitkeep' || contents[0].isDirectory()) continue
      await unlink(path.join(placePath, '.gitkeep'))
      await rmdir(placePath)
    }
  }
}

console.log(`Created ${chinaProvinces.features.length} province groups and ${created} city/district folders.`)
