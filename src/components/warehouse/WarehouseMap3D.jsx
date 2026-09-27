import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function WarehouseMap3D({ map, locations, placing, point, onPoint, onSelect }) {
  const cameraState = useRef(null);
  const host = useRef(null), callbacks = useRef({ onPoint, onSelect });
  const [failure, setFailure] = useState('');
  useEffect(() => { callbacks.current = { onPoint, onSelect }; }, [onPoint, onSelect]);
  useEffect(() => {
    const element = host.current;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false }); }
    catch { queueMicrotask(() => setFailure('3D is unavailable on this device. Use the location list below.')); return; }
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#eff2ef');
    const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 2000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.48;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    element.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-label', 'Interactive warehouse model. Drag to rotate; pinch to zoom. Use the location list for accessible selection.');
    scene.add(new THREE.HemisphereLight(0xffffff, 0x66776c, 2.6));
    const light = new THREE.DirectionalLight(0xffffff, 2); light.position.set(6, 15, 8); scene.add(light);
    const bounds = new THREE.Box3();
    const floors = map.surfaces.filter((s) => Number.isFinite(s.y) && Number.isFinite(s.height)).map((s) => s.y - s.height / 2);
    const floorY = floors.length ? Math.min(...floors) : 0;
    for (const s of map.surfaces) {
      const height = s.height || 2.8;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(s.width, height, .08), new THREE.MeshStandardMaterial({ color: s.kind === 'wall' ? '#d1d8d4' : '#8cb3b3', transparent: true, opacity: s.kind === 'wall' ? .5 : .3, depthWrite: false }));
      mesh.position.set(s.x, (s.y ?? height / 2) - floorY, s.z); mesh.rotation.y = -s.angle;
      scene.add(mesh); mesh.updateMatrixWorld(); bounds.expandByObject(mesh);
    }
    for (const b of locations) bounds.expandByPoint(new THREE.Vector3(b.x, 0, b.z));
    if (bounds.isEmpty()) bounds.set(new THREE.Vector3(-3, 0, -3), new THREE.Vector3(3, 3, 3));
    const center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.z, 4);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(size.x, 4) + 4, Math.max(size.z, 4) + 4), new THREE.MeshStandardMaterial({ color: '#e4e9e4', side: THREE.DoubleSide }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(center.x, -.025, center.z); scene.add(floor);
    const grid = new THREE.GridHelper(span + 4, Math.min(100, Math.ceil(span + 4)), '#bbc6bd', '#d1dbd2'); grid.position.set(center.x, 0, center.z); scene.add(grid);
    const selectable = [];
    for (const b of locations) {
      // Symbols mark registered locations; their dimensions are not measured pallet dimensions.
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(.85, .32, .85), new THREE.MeshStandardMaterial({ color: b.color, roughness: .7 }));
      mesh.position.set(b.x, .2, b.z); mesh.userData.binId = b.id; scene.add(mesh); selectable.push(mesh);
      const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#24392f'; ctx.font = '600 32px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(String(b.code || b.name).slice(0, 25), 256, 46);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }));
      sprite.position.set(b.x, 1, b.z); sprite.scale.set(3, .56, 1); scene.add(sprite);
    }
    if (point) {
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, 1.4), new THREE.MeshStandardMaterial({ color: '#263d33' }));
      pin.position.set(point.x, .7, point.z); scene.add(pin);
    }
    controls.target.set(center.x, 0, center.z); camera.position.set(center.x + span*.8, span*.85, center.z + span*.95); if (cameraState.current?.id === map.id && map.id) {
      camera.position.copy(cameraState.current.position); controls.target.copy(cameraState.current.target);
    }
    controls.update();
    const ray = new THREE.Raycaster(); let down;
    const start = (e) => { down = { x:e.clientX, y:e.clientY, time:performance.now() }; };
    const select = (e) => {
      if (!down || Math.hypot(e.clientX-down.x,e.clientY-down.y)>8 || performance.now()-down.time>700) return;
      const rect = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1), camera);
      const hit = ray.intersectObjects(selectable)[0];
      if (hit) callbacks.current.onSelect(hit.object.userData.binId);
      else if (placing) { const result = ray.intersectObject(floor)[0]; if (result) callbacks.current.onPoint({x:result.point.x,z:result.point.z}); }
    };
    const resize = new ResizeObserver(() => { const w=element.clientWidth,h=element.clientHeight; if(w && h){renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();} });
    resize.observe(element);
    renderer.domElement.addEventListener('pointerdown',start); renderer.domElement.addEventListener('pointerup',select);
    const contextLost = (e) => { e.preventDefault(); setFailure('The 3D view was interrupted. Reopen this map; the location list is still available.'); };
    renderer.domElement.addEventListener('webglcontextlost',contextLost);
    renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera);});
    return () => {
      cameraState.current = { id:map.id, position:camera.position.clone(), target:controls.target.clone() };
      resize.disconnect(); controls.dispose(); renderer.setAnimationLoop(null);
      renderer.domElement.removeEventListener('pointerdown',start);renderer.domElement.removeEventListener('pointerup',select);renderer.domElement.removeEventListener('webglcontextlost',contextLost);
      scene.traverse((o)=>{o.geometry?.dispose();for(const m of (Array.isArray(o.material)?o.material:[o.material]).filter(Boolean)){m.map?.dispose();m.dispose();}});
      renderer.dispose();renderer.domElement.remove();
    };
  }, [map, locations, placing, point]);
  return <div className="wm-model"><div className="wm-model-canvas" ref={host}/>{failure && <p role="alert">{failure}</p>}<div className="wm-model-hint">{placing ? 'Tap the floor to place a location' : 'Drag to orbit · Pinch to zoom · Tap a location'}</div></div>;
}
