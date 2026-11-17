import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve('public/china')
const indexPath = path.resolve('public/story-index.json')
const stories = []

async function directories(directory) {
  try {
    return (await readdir(directory, { withFileTypes: true })).filter((entry) => entry.isDirectory())
  } catch {
    return []
  }
}

for (const province of await directories(root)) {
  for (const city of await directories(path.join(root, province.name))) {
    for (const date of await directories(path.join(root, province.name, city.name))) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date.name)) continue
      const directory = path.join(root, province.name, city.name, date.name)
      let markdown = ''
      try {
        markdown = await readFile(path.join(directory, 'doc.md'), 'utf8')
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
      let imageNames = []
      try {
        imageNames = (await readdir(path.join(directory, 'imgs'), { withFileTypes: true }))
          .filter((item) => item.isFile() && /\.(avif|gif|jpe?g|png|webp)$/i.test(item.name))
          .map((item) => item.name)
          .sort()
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
      if (!markdown.trim() && !imageNames.length) continue

      const assetPath = [province.name, city.name, date.name].map(encodeURIComponent).join('/')
      stories.push({
        province: province.name,
        city: city.name,
        date: date.name,
        title: markdown.match(/^title:\s*(.+)$/m)?.[1]?.trim() || `${city.name} · ${date.name}`,
        cover: imageNames[0] ? `${assetPath}/imgs/${encodeURIComponent(imageNames[0])}` : '',
        images: imageNames.map((name) => `${assetPath}/imgs/${encodeURIComponent(name)}`),
        markdown,
        path: assetPath,
      })
    }
  }
}

await mkdir(path.dirname(indexPath), { recursive: true })
await writeFile(indexPath, `${JSON.stringify(stories.sort((a, b) => b.date.localeCompare(a.date)), null, 2)}\n`)
console.log(`Indexed ${stories.length} stories.`)
