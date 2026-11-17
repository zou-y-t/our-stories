import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { geoMercator, geoPath } from 'd3-geo'
import { municipalities } from './municipality-data.mjs'

const root = path.resolve('public/map')
const provinces = JSON.parse(await readFile(path.join(root, 'provinces.json'), 'utf8'))
assert.equal(provinces.features.length, 34, 'expected 34 province-level regions')

const projection = geoMercator().fitSize([1000, 700], provinces)
const pathGenerator = geoPath(projection)
for (const province of provinces.features) {
  const name = province.properties['地名']
  const municipality = municipalities[name]
  if (municipality) {
    const [[left, top], [right, bottom]] = pathGenerator.bounds(province)
    assert.ok(right - left < 100 && bottom - top < 100, `${name} outline spans the whole map`)
  }
  const folder = municipality ? 'municipalities' : 'prefectures'
  const collection = JSON.parse(await readFile(path.join(root, folder, `${province.properties.id}.json`), 'utf8'))
  assert.ok(collection.features.length, `missing clickable regions in ${name}`)
  const names = collection.features.map((feature) => feature.properties['地名'])
  assert.equal(new Set(names).size, names.length, `duplicate clickable regions in ${name}`)
  if (municipality) {
    for (const district of municipality.places) assert.ok(names.includes(district), `missing ${name}/${district}`)
  }
  for (const region of names) {
    await access(path.resolve('public/china', name, region, '.gitkeep'))
  }
}

console.log('Map boundaries, current municipality names, and story folders verified.')
