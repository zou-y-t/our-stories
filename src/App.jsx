import React, { useEffect, useMemo, useRef, useState } from 'react'
import { geoMercator, geoPath } from 'd3-geo'
import { feature as topoFeature } from 'topojson-client'
import worldTopology from 'world-atlas/countries-110m.json'
import countries from 'world-countries'
import {
  ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, Heart, MapPin,
  Search, X, ZoomIn, ZoomOut,
} from 'lucide-react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const worldShapes = topoFeature(worldTopology, worldTopology.objects.countries).features
const worldNames = new Map(countries.map((country) => [String(Number(country.ccn3)), country.name.common]))
const municipalityNames = new Set(['北京市', '天津市', '上海市', '重庆市'])
const mapDataCache = new Map()
const provinceCount = 34
const MIN_ZOOM = 0.8
const MAX_ZOOM = 4
const chinaLakes = [
  ['青海湖', 100.15, 36.85, 0.48, 0.3], ['纳木错', 90.65, 30.75, 0.42, 0.18],
  ['羊卓雍错', 90.55, 28.95, 0.4, 0.12], ['色林错', 88.65, 31.8, 0.38, 0.22],
  ['鄱阳湖', 116.2, 29.0, 0.42, 0.58], ['洞庭湖', 112.95, 29.15, 0.35, 0.3],
  ['太湖', 120.15, 31.2, 0.34, 0.25], ['洪泽湖', 118.65, 33.35, 0.34, 0.28],
  ['巢湖', 117.45, 31.55, 0.27, 0.14], ['滇池', 102.7, 24.85, 0.16, 0.25],
  ['洱海', 100.15, 25.8, 0.1, 0.32], ['博斯腾湖', 87.0, 42.0, 0.42, 0.25],
  ['呼伦湖', 117.4, 48.9, 0.38, 0.3], ['查干湖', 124.3, 45.2, 0.21, 0.16],
  ['镜泊湖', 128.9, 43.9, 0.1, 0.28], ['抚仙湖', 102.9, 24.5, 0.12, 0.22],
].map(([name, longitude, latitude, radiusX, radiusY], lakeIndex) => {
  const ring = Array.from({ length: 32 }, (_, index) => {
    const angle = -index / 32 * Math.PI * 2
    const wobble = 1 + 0.11 * Math.sin(angle * 3 + lakeIndex) + 0.06 * Math.cos(angle * 5)
    return [longitude + Math.cos(angle) * radiusX * wobble, latitude + Math.sin(angle) * radiusY * wobble]
  })
  ring.push(ring[0])
  return { type: 'Feature', properties: { name }, geometry: { type: 'Polygon', coordinates: [ring] } }
})

function featureName(feature) {
  const properties = feature.properties ?? {}
  return properties['地名'] || properties.name || properties.NAME_2 || properties.NAME || properties.NAME_1 || '地区'
}

function normalizeName(name = '') {
  return name.replace(/(特别行政区|壮族自治区|回族自治区|维吾尔自治区|自治区|省|市)$/, '')
}

function formatCityName(name, municipality) {
  if (municipality || /(市|区|县|自治州|地区|盟)$/.test(name)) return name
  return `${name}市`
}

function MapView({ mode, selectedCountry, selectedProvince, selectedCity, stories, onCountry, onProvince, onCity, zoom, setZoom }) {
  const svgRef = useRef(null)
  const dragRef = useRef(null)
  const suppressClickRef = useRef(false)
  const [size, setSize] = useState({ width: 960, height: 620 })
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [loadedData, setLoadedData] = useState({ path: null, collection: null, error: false })
  const [loadedProvinceData, setLoadedProvinceData] = useState({ collection: null })
  useEffect(() => {
    if (!svgRef.current) return
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: Math.max(420, entry.contentRect.height) }))
    observer.observe(svgRef.current.parentElement)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    setPan({ x: 0, y: 0 })
  }, [mode, selectedCountry?.cca3, selectedProvince?.name])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (event) => {
      event.preventDefault()
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? size.height : 1
      const delta = Math.max(-160, Math.min(160, event.deltaY * unit))
      const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * Math.exp(-delta * 0.002)))
      if (nextZoom === zoom) return

      const bounds = svg.getBoundingClientRect()
      const pointerX = (event.clientX - bounds.left) * size.width / bounds.width
      const pointerY = (event.clientY - bounds.top) * size.height / bounds.height
      const ratio = nextZoom / zoom
      const limitX = size.width * Math.max(nextZoom, 1) * 0.75
      const limitY = size.height * Math.max(nextZoom, 1) * 0.75
      setPan({
        x: Math.max(-limitX, Math.min(limitX, pan.x + (1 - ratio) * (pointerX - size.width / 2 - pan.x))),
        y: Math.max(-limitY, Math.min(limitY, pan.y + (1 - ratio) * (pointerY - size.height / 2 - pan.y))),
      })
      setZoom(nextZoom)
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [pan, size, zoom, setZoom])

  const dataPath = mode === 'world' || (mode === 'country' && selectedCountry?.cca3 !== 'CHN')
    ? null
    : selectedProvince
      ? `${municipalityNames.has(selectedProvince.name) ? 'municipalities' : 'prefectures'}/${selectedProvince.feature.properties.id}.json`
      : 'provinces.json'

  useEffect(() => {
    if (!dataPath) return
    const requestPath = `${import.meta.env.BASE_URL}map/${dataPath}`
    const cached = mapDataCache.get(requestPath)
    if (cached) {
      setLoadedData({ path: dataPath, collection: cached, error: false })
      return
    }
    let cancelled = false
    fetch(requestPath)
      .then((response) => {
        if (!response.ok) throw new Error(`Map data request failed: ${response.status}`)
        return response.json()
      })
      .then((collection) => {
        mapDataCache.set(requestPath, collection)
        if (!cancelled) setLoadedData({ path: dataPath, collection, error: false })
      })
      .catch(() => {
        if (!cancelled) setLoadedData({ path: dataPath, collection: null, error: true })
      })
    return () => { cancelled = true }
  }, [dataPath])

  useEffect(() => {
    const requestPath = `${import.meta.env.BASE_URL}map/provinces.json`
    const cached = mapDataCache.get(requestPath)
    if (cached) {
      setLoadedProvinceData({ collection: cached })
      return
    }
    let cancelled = false
    fetch(requestPath)
      .then((response) => {
        if (!response.ok) throw new Error(`Map data request failed: ${response.status}`)
        return response.json()
      })
      .then((collection) => {
        mapDataCache.set(requestPath, collection)
        if (!cancelled) setLoadedProvinceData({ collection })
      })
      .catch(() => {
        if (!cancelled) setLoadedProvinceData({ collection: null })
      })
    return () => { cancelled = true }
  }, [])

  const storyRegions = useMemo(() => new Set(stories.map((story) => `${story.province}/${story.city}`)), [stories])
  const { projection, shapes, contextShapes, activeMode, showChinaLakes } = useMemo(() => {
    let shapes
    let contextShapes = []
    let focusCollection
    if (mode === 'world') {
      shapes = worldShapes
      focusCollection = { type: 'FeatureCollection', features: worldShapes }
    } else if (mode === 'country' && selectedCountry?.cca3 !== 'CHN') {
      const countryShape = worldShapes.find((shape) => String(Number(shape.id)) === String(Number(selectedCountry?.ccn3)))
      shapes = worldShapes
      focusCollection = { type: 'FeatureCollection', features: countryShape ? [countryShape] : worldShapes }
    } else {
      shapes = loadedData.path === dataPath && loadedData.collection?.features
        ? loadedData.collection.features
        : []
      if (selectedProvince) {
        contextShapes = loadedProvinceData.collection?.features ?? []
        focusCollection = { type: 'FeatureCollection', features: [selectedProvince.feature] }
      } else {
        focusCollection = { type: 'FeatureCollection', features: shapes }
      }
    }
    const activeMode = mode === 'world' ? 'world' : mode === 'country' && selectedCountry?.cca3 !== 'CHN' ? 'country' : selectedProvince ? 'cities' : 'provinces'
    const fitFeatures = focusCollection.features?.length ? focusCollection.features : worldShapes
    const fitCollection = { type: 'FeatureCollection', features: fitFeatures }
    const inset = activeMode === 'world' ? 24 : 52
    const projection = geoMercator().fitExtent([[inset, inset], [size.width - inset, size.height - inset]], fitCollection)
    return { projection, shapes, contextShapes, activeMode, showChinaLakes: activeMode === 'provinces' || activeMode === 'cities' }
  }, [mode, selectedCountry, selectedProvince, size, dataPath, loadedData, loadedProvinceData])

  const path = useMemo(() => geoPath(projection), [projection])
  const onShapeClick = (shape) => {
    if (activeMode === 'world') {
      const country = countries.find((item) => String(Number(item.ccn3)) === String(Number(shape.id)))
      if (country) onCountry(country)
    } else if (activeMode === 'provinces') {
      onProvince(shape)
    } else if (activeMode === 'cities') {
      const municipality = municipalityNames.has(selectedProvince?.name)
      onCity(formatCityName(featureName(shape), municipality), selectedProvince?.name)
    } else if (activeMode === 'country') {
      const country = countries.find((item) => String(Number(item.ccn3)) === String(Number(shape.id)))
      if (country) onCountry(country)
    }
  }

  const onPointerDown = (event) => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return
    suppressClickRef.current = false
    dragRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, pan, moved: false }
  }

  const onPointerMove = (event) => {
    const drag = dragRef.current
    if (!drag || drag.id !== event.pointerId) return
    const deltaX = event.clientX - drag.x
    const deltaY = event.clientY - drag.y
    if (!drag.moved && event.pointerType === 'touch' && (Math.abs(deltaX) < 5 || Math.abs(deltaX) <= Math.abs(deltaY))) return
    if (!drag.moved && Math.hypot(deltaX, deltaY) < 5) return
    if (!drag.moved) {
      drag.moved = true
      suppressClickRef.current = true
      event.currentTarget.setPointerCapture(event.pointerId)
      setIsDragging(true)
    }
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = drag.pan.x + deltaX * size.width / bounds.width
    const y = drag.pan.y + (event.pointerType === 'touch' ? 0 : deltaY * size.height / bounds.height)
    const limitX = size.width * Math.max(zoom, 1) * 0.75
    const limitY = size.height * Math.max(zoom, 1) * 0.75
    setPan({
      x: Math.max(-limitX, Math.min(limitX, x)),
      y: Math.max(-limitY, Math.min(limitY, y)),
    })
  }

  const onPointerEnd = (event) => {
    if (dragRef.current?.id !== event.pointerId) return
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    setIsDragging(false)
  }

  return (
    <div className="map-stage">
      <svg ref={svgRef} viewBox={`0 0 ${size.width} ${size.height}`} role="group" aria-label="可交互的世界与中国地区地图" className={isDragging ? 'is-dragging' : ''} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}>
        <defs><pattern id="map-dots" width="26" height="26" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="1" fill="#91bdcd" opacity=".42" /></pattern></defs>
        <rect width={size.width} height={size.height} fill="url(#map-dots)" />
        <g className="map-shapes" transform={`translate(${(size.width - size.width * zoom) / 2 + pan.x}, ${(size.height - size.height * zoom) / 2 + pan.y}) scale(${zoom})`}>
          {(activeMode === 'provinces' || activeMode === 'cities') && worldShapes.map((shape, index) => <path key={`world-context-${shape.id ?? index}`} d={path(shape) || ''} className="map-context-world" aria-hidden="true" />)}
          {contextShapes.map((shape, index) => <path key={`context-${shape.id ?? index}`} d={path(shape) || ''} className={`map-context ${shape.properties?.id === selectedProvince?.feature.properties?.id ? 'is-focused-province' : ''}`} aria-hidden="true" />)}
          {shapes.map((shape, index) => {
            const name = featureName(shape)
            const cityName = activeMode === 'cities' ? formatCityName(name, municipalityNames.has(selectedProvince?.name)) : ''
            const isVisited = activeMode === 'provinces'
              ? stories.some((story) => normalizeName(story.province) === normalizeName(name))
              : activeMode === 'cities' && storyRegions.has(`${selectedProvince?.name}/${cityName}`)
            const countryName = activeMode === 'world' || activeMode === 'country'
              ? (worldNames.get(String(Number(shape.id))) || '')
              : ''
            const isCurrentCity = activeMode === 'cities' && selectedCity?.province === selectedProvince?.name && selectedCity?.city === cityName
            const isCurrentProvince = activeMode === 'provinces' && selectedCity && normalizeName(selectedCity.province) === normalizeName(name)
            const isCountryFocus = activeMode === 'provinces' || activeMode === 'cities'
            return <path
              key={`${shape.id ?? name}-${index}`}
              d={path(shape) || ''}
              className={`map-region ${isVisited ? 'is-visited' : ''} ${isCountryFocus ? 'is-country-focus' : ''} ${activeMode === 'cities' ? 'is-province-focus' : ''} ${isCurrentCity ? 'is-current-city' : ''} ${isCurrentProvince ? 'is-current-province' : ''} ${countryName === 'China' && activeMode === 'world' ? 'is-china' : ''} ${countryName === selectedCountry?.name?.common && activeMode === 'country' ? 'is-selected' : ''}`}
              onClick={() => { if (!suppressClickRef.current) onShapeClick(shape) }}
              onPointerDown={(event) => { if (event.pointerType !== 'touch') event.currentTarget.blur() }}
              role="button"
              tabIndex={0}
              aria-label={activeMode === 'world' ? countryName : name}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onShapeClick(shape)
                }
              }}
            ><title>{activeMode === 'world' ? countryName : name}</title></path>
          })}
          {showChinaLakes && <g className="map-lakes" aria-hidden="true">{chinaLakes.map((lake) => <path key={lake.properties.name} d={path(lake) || ''} />)}</g>}
        </g>
      </svg>
      <div className="map-controls" aria-label="地图缩放">
        <button className="icon-button" title="放大" onClick={() => setZoom((value) => Math.min(MAX_ZOOM, value + 0.25))}><ZoomIn size={17} /></button>
        <button className="icon-button" title="缩小" onClick={() => setZoom((value) => Math.max(MIN_ZOOM, value - 0.25))}><ZoomOut size={17} /></button>
        <button className="icon-button" title="重置视图" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}><MapPin size={16} /></button>
      </div>
      {dataPath && loadedData.path === dataPath && loadedData.error && <div className="map-status" role="status">地图数据载入失败，请刷新后重试。</div>}
      {dataPath && loadedData.path !== dataPath && <div className="map-status" role="status">地图载入中</div>}
      <div className="map-scale"><span className="scale-dot selected-dot" />当前选中<span className="scale-dot visited-dot" />去过</div>
    </div>
  )
}

function App() {
  const [mode, setMode] = useState('country')
  const [selectedCountry, setSelectedCountry] = useState(countries.find((item) => item.cca3 === 'CHN'))
  const [selectedProvince, setSelectedProvince] = useState(null)
  const [selectedCity, setSelectedCity] = useState(null)
  const [activePlace, setActivePlace] = useState(null)
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [stories, setStories] = useState([])

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}story-index.json`).then((response) => response.ok ? response.json() : []).then((items) => setStories(Array.isArray(items) ? items : [])).catch(() => setStories([]))
  }, [])

  useEffect(() => {
    if (!activePlace) return
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setActivePlace(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [activePlace])

  const countryResults = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    if (!query) return countries.filter((item) => ['CHN', 'JPN', 'USA', 'FRA', 'ITA'].includes(item.cca3))
    return countries.filter((item) => `${item.name.common} ${item.name.official} ${item.translations?.zho?.common ?? ''}`.toLocaleLowerCase().includes(query)).slice(0, 8)
  }, [search])
  const cityCount = new Set(stories.map((story) => `${story.province}/${story.city}`)).size
  const activeStories = activePlace?.province ? stories.filter((story) => story.province === activePlace.province && story.city === activePlace.city).sort((a, b) => b.date.localeCompare(a.date)) : []

  const chooseCountry = (country) => {
    setSelectedCountry(country)
    setSelectedProvince(null)
    setSelectedCity(null)
    setActivePlace(null)
    setMode('country')
    setSearch(country.translations?.zho?.common || country.name.common)
    setSearchOpen(false)
    setZoom(1)
  }
  const chooseProvince = (feature) => {
    const name = featureName(feature)
    setSelectedProvince({ name, feature })
    setSelectedCity(null)
    setMode('country')
    setZoom(1)
  }
  const showChina = () => {
    setMode('country')
    setSelectedProvince(null)
    setSelectedCity(null)
    setActivePlace(null)
    setSelectedCountry(countries.find((item) => item.cca3 === 'CHN'))
    setSearch('中国')
    setZoom(1)
  }
  const breadcrumb = [
    <button key="world" className="crumb" onClick={() => { setMode('world'); setSelectedProvince(null); setSelectedCity(null); setActivePlace(null); setZoom(1) }}>世界</button>,
    <ChevronRight key="c1" size={13} className="crumb-chevron" />,
    <button key="china" className="crumb" onClick={showChina}>{selectedCountry?.translations?.zho?.common || selectedCountry?.name.common}</button>,
  ]
  if (selectedProvince) breadcrumb.push(<ChevronRight key="c2" size={13} className="crumb-chevron" />, <span key="province" className="crumb current">{selectedProvince.name}</span>)

  return <main className="app-shell">
    <header className="topbar">
      <a className="brand" href="#" aria-label="Our Stories 首页" onClick={(event) => { event.preventDefault(); showChina() }}><span className="brand-mark"><Heart size={16} fill="currentColor" /></span><span>our stories</span></a>
      <div className="topbar-center"><span className="status-dot" />私人旅行地图</div>
      <button className="avatar-button" title="关于我们的地图" onClick={() => setActivePlace({ about: true })}>Y <i>+</i></button>
    </header>

    <section className="page-heading">
      <div><p className="eyebrow">OUR LITTLE ATLAS <span>·</span> 2026</p><h1>把一起走过的地方，<em>好好收藏。</em></h1><p className="subheading">每一段路，都有只属于我们的故事。</p></div>
      <div className="trip-stats"><div><strong>{String(cityCount).padStart(2, '0')}</strong><span>去过的地方</span></div><i /><div><strong>{String(stories.length).padStart(2, '0')}</strong><span>段旅行记忆</span></div></div>
    </section>

    <section className="workspace">
      <aside className="sidebar">
        <div className="search-wrap"><Search size={17} /><input type="search" value={search} placeholder="搜索国家 / 地区" aria-label="搜索国家" onFocus={() => setSearchOpen(true)} onChange={(event) => { setSearch(event.target.value); setSearchOpen(true) }} onKeyDown={(event) => event.key === 'Enter' && countryResults[0] && chooseCountry(countryResults[0])} onBlur={() => setTimeout(() => setSearchOpen(false), 160)} /><ChevronDown size={15} className="search-chevron" />
          {searchOpen && <div className="search-results"><p className="result-label">{search.trim() ? '国家 / 地区' : '常用国家'}</p>{countryResults.length ? countryResults.map((country) => <button key={country.cca3} onMouseDown={(event) => event.preventDefault()} onClick={() => chooseCountry(country)}><span className="flag">{country.flag}</span><span>{country.translations?.zho?.common || country.name.common}</span><small>{country.name.common}</small></button>) : <p className="no-results">没有找到这个国家</p>}</div>}
        </div>
        <div className="sidebar-section-label"><span>地图图层</span><span>01</span></div>
        <button className={`layer-item ${mode === 'world' ? 'active' : ''}`} onClick={() => { setMode('world'); setSelectedProvince(null); setSelectedCity(null); setZoom(1) }}><span className="layer-icon world-icon">◎</span><span className="layer-copy"><strong>世界</strong><small>World map</small></span><span className="layer-count">{countries.length}</span></button>
        <button className={`layer-item ${mode !== 'world' && selectedCountry?.cca3 === 'CHN' ? 'active' : ''}`} onClick={showChina}><span className="layer-icon china-icon">中</span><span className="layer-copy"><strong>中国</strong><small>China · 中国</small></span><span className="layer-count">{provinceCount}</span></button>
        <div className="sidebar-divider" />
        <div className="sidebar-section-label places-label"><span>我们的足迹</span><span className="tiny-heart"><Heart size={11} fill="currentColor" /> {cityCount}</span></div>
        {stories.length ? stories.slice(0, 5).map((story) => <button key={story.path} className="footprint-item" onClick={() => { showChina(); setSelectedCity({ province: story.province, city: story.city }); setActivePlace({ province: story.province, city: story.city }) }}><span className="footprint-dot" /><span><strong>{story.city}</strong><small>{story.province} · {story.date}</small></span></button>) : <p className="empty-footprints">旅行故事将会出现在这里。</p>}
        <div className="sidebar-note"><span className="note-flower">✳</span><p>一张地图，<br />装下我们的好天气。</p></div>
        <div className="sidebar-footer">MADE WITH <Heart size={10} fill="currentColor" /> FOR US</div>
      </aside>

      <section className="map-column">
        <div className="map-toolbar"><div className="breadcrumbs">{breadcrumb}</div><div className="map-toolbar-actions">{selectedProvince && <button className="back-button" onClick={() => { setSelectedProvince(null); setSelectedCity(null); setZoom(1) }}><ArrowLeft size={14} /> 返回省份</button>}<span className="map-caption">{mode === 'world' ? 'WORLD ATLAS' : selectedProvince ? (municipalityNames.has(selectedProvince.name) ? 'DISTRICTS' : 'PREFECTURE CITIES') : selectedCountry?.cca3 !== 'CHN' ? 'COUNTRY FOCUS' : 'PROVINCES & REGIONS'}</span></div></div>
        <MapView mode={mode} selectedCountry={selectedCountry} selectedProvince={selectedProvince} selectedCity={selectedCity} stories={stories} onCountry={chooseCountry} onProvince={chooseProvince} onCity={(city, province) => { setSelectedCity({ province, city }); setActivePlace({ province, city }) }} zoom={zoom} setZoom={setZoom} />
        <div className="map-bottomline"><span>THE WORLD, IN LITTLE DETAILS</span><span>OUR LITTLE ATLAS</span></div>
      </section>
    </section>

    <footer className="page-footer"><span>© OUR STORIES</span><span>COLLECTING LITTLE MOMENTS, TOGETHER</span><span>CHINA <i>·</i> 2026</span></footer>

    {activePlace && <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setActivePlace(null)}>
      <aside className="story-drawer" role="dialog" aria-modal="true" aria-label="旅行故事">
        <div className="drawer-topline"><span><span className="drawer-indicator" /> OUR MEMORY</span><button className="icon-button close-button" onClick={() => setActivePlace(null)} title="关闭"><X size={19} /></button></div>
        {activePlace.about ? <><p className="drawer-kicker">A MAP MADE FOR TWO</p><h2>我们的<br /><em>小小世界。</em></h2><p className="drawer-intro">一张地图，收纳两个人一起走过的地方。</p><div className="about-rule" /><p className="drawer-body">有些日子在路上，有些记忆留在照片里。每次想起，就从这里重新出发。</p><button className="primary-button about-close" onClick={() => setActivePlace(null)}>回到地图 <ChevronRight size={15} /></button></> : <>
          <p className="drawer-kicker">{activeStories.length ? 'A PLACE WE REMEMBER' : 'A PLACE TO REMEMBER'}</p><h2>{activePlace.city}<br /><em>{activePlace.province}</em></h2><div className="drawer-location"><MapPin size={14} /> CHINA <span>·</span> {activeStories.length} {activeStories.length === 1 ? 'STORY' : 'STORIES'}</div>
          {activeStories.length ? activeStories.map((story) => <article className="story-entry" key={story.path}>{story.cover ? <img className="story-cover" src={`${import.meta.env.BASE_URL}china/${story.cover}`} alt="旅行照片" /> : <div className="cover-placeholder"><span>✳</span><small>OUR DAY, OUR WAY</small></div>}<div className="story-date">{story.date.replaceAll('-', ' / ')}</div><h3>{story.title}</h3>{story.markdown && <div className="markdown-body" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(story.markdown.replace(/^title:\s*.+\n?/m, '').replace(/^---\s*\n?[\s\S]*?\n---\s*/m, ''))) }} />}{story.images.length > 1 && <div className="story-gallery">{story.images.slice(1).map((image) => <img key={image} src={`${import.meta.env.BASE_URL}china/${image}`} alt="旅行照片" />)}</div>}</article>) : <div className="story-empty"><div className="empty-heart"><Heart size={19} /></div><h3>这段旅程<br />还没有写下。</h3><p>等下一次翻开相册，再把那一天留在这里。</p></div>}
          <button className="drawer-back" onClick={() => setActivePlace(null)}><ChevronLeft size={15} /> 回到地图</button>
        </>}
        <div className="drawer-bottom"><span>WITH LOVE, ALWAYS</span><Heart size={12} fill="currentColor" /><span>OUR STORIES</span></div>
      </aside>
    </div>}
  </main>
}

export default App
