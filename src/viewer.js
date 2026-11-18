import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

const MODEL_URL = `${import.meta.env.BASE_URL}models/study-01.glb`

const LIGHT_RIGS = {
  day: {
    ambient: 0.5,
    key: { color: 0xfff3e2, intensity: 2.1, pos: [-2.4, 3.1, 2.6] },
    fill: { color: 0xb9ced8, intensity: 0.62, pos: [2.2, 1.1, 1.8] },
    rim: { color: 0xffdfb8, intensity: 1.15, pos: [0.4, 2.2, -2.4] },
  },
  tungsten: {
    ambient: 0.36,
    key: { color: 0xffc58d, intensity: 2.5, pos: [-2.2, 2.6, 2.4] },
    fill: { color: 0x8a6550, intensity: 0.32, pos: [2.0, 0.8, 1.8] },
    rim: { color: 0xff9f5c, intensity: 1.45, pos: [0.6, 2.0, -2.2] },
  },
  raking: {
    ambient: 0.28,
    key: { color: 0xfff0d4, intensity: 3.0, pos: [3.0, 1.15, 1.1] },
    fill: { color: 0x9fb6c2, intensity: 0.2, pos: [-2.2, 0.9, 1.4] },
    rim: { color: 0xffd6a8, intensity: 0.55, pos: [0.0, 2.6, -2.6] },
  },
}

const VIEWS = {
  three: { az: 0.56, el: 0.18, dist: 1.98, ty: 0.01 },
  front: { az: 0.02, el: 0.08, dist: 1.9, ty: 0.01 },
  top: { az: 0.32, el: 1.02, dist: 2.0, ty: 0.0 },
  detail: { az: 0.92, el: 0.16, dist: 1.12, ty: 0.03 },
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function makeShadowTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 512
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(256, 256, 10, 256, 256, 250)
  g.addColorStop(0, 'rgba(20,17,13,0.46)')
  g.addColorStop(0.35, 'rgba(20,17,13,0.22)')
  g.addColorStop(1, 'rgba(20,17,13,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 512, 512)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function createViewer(canvas) {
  const still = new URLSearchParams(location.search).has('still')
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.LinearToneMapping
  renderer.toneMappingExposure = 0.98
  renderer.localClippingEnabled = true

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 80)
  camera.position.set(0, 0.1, 2)

  const controls = new OrbitControls(camera, canvas)
  controls.target.set(0, 0.01, 0)
  controls.enableDamping = true
  controls.dampingFactor = 0.075
  controls.enablePan = false
  controls.minPolarAngle = 0.14
  controls.maxPolarAngle = 1.53
  controls.minDistance = 0.72
  controls.maxDistance = 4.2
  controls.rotateSpeed = 0.68
  controls.zoomSpeed = 0.7

  const ambient = new THREE.AmbientLight(0xffffff, 0.48)
  const key = new THREE.DirectionalLight(0xfff3e2, 2.3)
  const fill = new THREE.DirectionalLight(0xb9ced8, 0.6)
  const rim = new THREE.DirectionalLight(0xffdfb8, 1.1)
  key.position.set(-2.4, 3.1, 2.6)
  fill.position.set(2.2, 1.1, 1.8)
  rim.position.set(0.4, 2.2, -2.4)
  scene.add(ambient, key, fill, rim)

  const root = new THREE.Group()
  scene.add(root)

  const clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.2)

  let mesh = null
  let points = null
  let shadow = null
  let baseTop = -0.2
  let loaded = false
  let paused = false
  let scroll = 0
  let bedOn = true
  let cloudOn = false
  let clock = new THREE.Clock()
  let tween = null
  let activeView = 'three'
  let distScale = 1
  let lightMix = LIGHT_RIGS.day
  let disposed = false

  function layout() {
    const w = window.innerWidth
    const h = window.innerHeight
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    const shift = w > 1180 ? 0.14 : w > 860 ? 0.1 : 0
    const lift = w <= 860 ? 0.065 : 0.028
    distScale = w <= 860 ? 1.5 : 1
    camera.setViewOffset(w, h, -w * shift, h * lift, w, h)
    camera.updateProjectionMatrix()
  }
  layout()

  function applyView(name, immediate = false) {
    const v = VIEWS[name] || VIEWS.three
    const target = new THREE.Vector3(0, v.ty, 0)
    const d = v.dist * distScale
    const pos = new THREE.Vector3(
      Math.sin(v.az) * Math.cos(v.el) * d,
      Math.sin(v.el) * d,
      Math.cos(v.az) * Math.cos(v.el) * d,
    )
    activeView = name
    if (immediate || reduced || still) {
      camera.position.copy(pos)
      controls.target.copy(target)
      controls.update()
      return
    }
    tween = {
      fromPos: camera.position.clone(),
      fromTarget: controls.target.clone(),
      toPos: pos,
      toTarget: target,
      start: performance.now(),
      duration: 900,
    }
  }

  function updateTween(now) {
    if (!tween) return
    const t = Math.min(1, (now - tween.start) / tween.duration)
    const e = easeInOutCubic(t)
    camera.position.lerpVectors(tween.fromPos, tween.toPos, e)
    controls.target.lerpVectors(tween.fromTarget, tween.toTarget, e)
    controls.update()
    if (t >= 1) tween = null
  }

  function setBed(on) {
    bedOn = on
    if (shadow) shadow.visible = !on
    if (mesh) {
      mesh.material.clippingPlanes = on ? [] : [clipPlane]
      mesh.material.needsUpdate = true
    }
    if (points) {
      points.material.clippingPlanes = on ? [] : [clipPlane]
      points.material.needsUpdate = true
    }
  }

  function setCloud(on) {
    cloudOn = on
    if (mesh) mesh.visible = !on
    if (points) points.visible = on
  }

  function setScroll(p) {
    scroll = Math.max(0, Math.min(1, p))
    if (!root) return
    root.rotation.y = -0.06 + scroll * 0.42
  }

  function setPaused(p) {
    paused = p
  }

  function makePoints(geometry, material) {
    const uv = geometry.attributes.uv
    if (!uv || !material.map || !material.map.image) return null
    const size = 512
    const c = document.createElement('canvas')
    c.width = c.height = size
    const ctx = c.getContext('2d', { willReadFrequently: true })
    try {
      ctx.drawImage(material.map.image, 0, 0, size, size)
    } catch {
      return null
    }
    const px = ctx.getImageData(0, 0, size, size).data
    const pos = geometry.attributes.position
    const colors = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) {
      const u = uv.getX(i)
      const v = uv.getY(i)
      const x = Math.min(size - 1, Math.max(0, Math.floor(u * size)))
      const y = Math.min(size - 1, Math.max(0, Math.floor((1 - v) * size)))
      const k = (y * size + x) * 4
      colors[i * 3] = Math.pow(px[k] / 255, 2.2)
      colors[i * 3 + 1] = Math.pow(px[k + 1] / 255, 2.2)
      colors[i * 3 + 2] = Math.pow(px[k + 2] / 255, 2.2)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', pos.clone())
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    const m = new THREE.PointsMaterial({
      size: 0.0034,
      vertexColors: true,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: true,
      clippingPlanes: bedOn ? [] : [clipPlane],
    })
    const p = new THREE.Points(g, m)
    p.visible = false
    p.frustumCulled = false
    // Bake the mesh's world transform so the cloud lines up with the surface.
    mesh.updateWorldMatrix(true, false)
    p.applyMatrix4(mesh.matrixWorld)
    return p
  }

  async function load(onProgress) {
    const loader = new GLTFLoader()
    const gltf = await loader.loadAsync(MODEL_URL, (ev) => {
      if (onProgress) onProgress(ev)
    })
    const model = gltf.scene
    root.add(model)

    model.traverse((child) => {
      if (!child.isMesh) return
      mesh = child
      const mat = child.material
      if (mat.map) {
        mat.map.colorSpace = THREE.SRGBColorSpace
        mat.map.anisotropy = renderer.capabilities.getMaxAnisotropy()
      }
      mat.roughness = 0.88
      mat.metalness = 0.04
      mat.envMapIntensity = 0.4
      mat.side = THREE.FrontSide
      child.frustumCulled = false
    })

    const box = new THREE.Box3().setFromObject(root)
    const size = box.getSize(new THREE.Vector3())
    baseTop = box.min.y + (box.max.y - box.min.y) * 0.355
    clipPlane.constant = -baseTop

    const shadowTex = makeShadowTexture()
    shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.15, 1.15),
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        toneMapped: false,
      }),
    )
    shadow.rotation.x = -Math.PI / 2
    shadow.position.y = baseTop - 0.004
    shadow.visible = true
    root.add(shadow)

    if (mesh) {
      points = makePoints(mesh.geometry, mesh.material)
      if (points) root.add(points)
    }

    // A slightly warmer initial angle than dead front.
    setBed(true)
    applyView('three', true)
    loaded = true
    return { box, size }
  }

  function setLight(name) {
    lightMix = LIGHT_RIGS[name] || LIGHT_RIGS.day
  }

  function updateLights(dt) {
    const k = Math.min(1, dt * 6)
    ambient.intensity += (lightMix.ambient - ambient.intensity) * k
    key.intensity += (lightMix.key.intensity - key.intensity) * k
    fill.intensity += (lightMix.fill.intensity - fill.intensity) * k
    rim.intensity += (lightMix.rim.intensity - rim.intensity) * k
    key.color.lerp(new THREE.Color(lightMix.key.color), k)
    fill.color.lerp(new THREE.Color(lightMix.fill.color), k)
    rim.color.lerp(new THREE.Color(lightMix.rim.color), k)
    key.position.lerp(new THREE.Vector3(...lightMix.key.pos), k)
    fill.position.lerp(new THREE.Vector3(...lightMix.fill.pos), k)
    rim.position.lerp(new THREE.Vector3(...lightMix.rim.pos), k)
  }

  function animate(now) {
    if (disposed) return
    requestAnimationFrame(animate)
    const dt = Math.min(0.05, clock.getDelta())
    updateTween(now)
    updateLights(dt)
    if (!paused) {
      if (!still && !reduced) {
        const t = now / 1000
        root.position.y = Math.sin(t * 0.62) * 0.004
      }
      renderer.render(scene, camera)
    }
  }

  controls.addEventListener('start', () => {
    tween = null
    canvas.classList.add('is-grabbing')
  })
  controls.addEventListener('end', () => {
    canvas.classList.remove('is-grabbing')
  })

  window.addEventListener('resize', () => {
    layout()
    if (loaded) applyView(activeView, true)
  })
  requestAnimationFrame(animate)

  let ro = null
  if ('ResizeObserver' in window) {
    ro = new ResizeObserver(layout)
    ro.observe(document.documentElement)
  }

  return {
    load,
    setBed,
    setCloud,
    setLight,
    setScroll,
    setPaused,
    setView: applyView,
    reset: () => applyView('three'),
    get activeView() { return activeView },
    get loaded() { return loaded },
    get baseTop() { return baseTop },

    dispose() {
      disposed = true
      ro?.disconnect()
      window.removeEventListener('resize', layout)
      renderer.dispose()
    },
  }
}
