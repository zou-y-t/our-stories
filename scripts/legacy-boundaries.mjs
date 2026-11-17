import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

export const legacyDistricts = {
  北京市: require('china-map-geojson/lib/province/bei_jing_geo'),
  天津市: require('china-map-geojson/lib/province/tian_jin_geo'),
  上海市: require('china-map-geojson/lib/province/shang_hai_geo'),
  重庆市: require('china-map-geojson/lib/province/chong_qing_geo'),
}

export const legacyAreas = {
  澳门特别行政区: require('china-map-geojson/lib/province/ao_men_geo'),
  香港特别行政区: require('china-map-geojson/lib/province/xiang_gang_geo'),
  台湾省: require('china-map-geojson/lib/province/tai_wan_geo'),
}
