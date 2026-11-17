import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import rewind from '@mapbox/geojson-rewind'
import chinaProvinces from 'cn-atlas/provinces.json' with { type: 'json' }
import chinaPrefectures from 'cn-atlas/prefectures.json' with { type: 'json' }
import { canonicalDistrictName, municipalities } from './municipality-data.mjs'
import { legacyAreas, legacyDistricts } from './legacy-boundaries.mjs'

const output = path.resolve('public/map')
const prefectureOutput = path.join(output, 'prefectures')
const municipalityOutput = path.join(output, 'municipalities')

await mkdir(prefectureOutput, { recursive: true })
await mkdir(municipalityOutput, { recursive: true })
await writeGeoJson(path.join(output, 'provinces.json'), structuredClone(chinaProvinces))

for (const province of chinaProvinces.features) {
  const name = province.properties['地名']
  const code = String(province.properties.id)
  if (municipalities[name]) {
    const source = legacyDistricts[name]
    const grouped = new Map()
    for (const feature of source.features) {
      const district = canonicalDistrictName(name, feature.properties.name)
      if (!municipalities[name].places.includes(district)) continue
      if (!grouped.has(district)) grouped.set(district, [])
      grouped.get(district).push(feature)
    }
    const features = [...grouped].map(([district, parts]) => ({
      ...parts[0],
      properties: { ...parts[0].properties, name: district, '地名': district },
      geometry: {
        type: 'MultiPolygon',
        coordinates: parts.flatMap((part) => part.geometry.type === 'Polygon'
          ? [part.geometry.coordinates]
          : part.geometry.coordinates),
      },
    }))
    await writeGeoJson(path.join(municipalityOutput, `${code}.json`), { type: 'FeatureCollection', features })
    continue
  }

  let features = chinaPrefectures.features.filter((feature) => {
    const featureCode = String(feature.properties?.id ?? '')
    return featureCode.startsWith(code.slice(0, 2)) && featureCode !== code
  })
  if (!features.length) {
    features = (legacyAreas[name]?.features ?? []).map((feature) => {
      const region = `${feature.properties.name}地区`
      return { ...feature, properties: { ...feature.properties, name: region, '地名': region } }
    })
  }
  await writeGeoJson(path.join(prefectureOutput, `${code}.json`), { type: 'FeatureCollection', features })
}

console.log(`Prepared map data for ${chinaProvinces.features.length} provinces and ${chinaPrefectures.features.length} prefectures.`)

async function writeGeoJson(filePath, collection) {
  rewind(collection, true)
  await writeFile(filePath, `${JSON.stringify(collection)}\n`)
}
