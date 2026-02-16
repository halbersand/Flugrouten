import * as THREE from './three.module.js';
import { OrbitControls } from './OrbitControls.js';

import getStarfield from "./getStarfield.js";

const container = document.getElementById('scene');



// Temporary: force a pause to verify debugger attachment

//debugger;
/* ---------------- Szene ---------------- */
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  60,
  container.clientWidth / container.clientHeight,
  0.1,
  1000
);



camera.position.set(0, 0, 3);

/* ---------------- Renderer (WICHTIG: zuerst!) ---------------- */
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
 renderer.setPixelRatio(window.devicePixelRatio);
 
 container.appendChild(renderer.domElement);



/* ---------------- Controls ---------------- */
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.enableZoom = true;
controls.enableRotate = true;
controls.screenSpacePanning = false;
controls.minDistance = 1.5;
controls.maxDistance = 6;


let camStart = new THREE.Vector3();
let camEnd = new THREE.Vector3();
let camProgress = 1; // 1 = keine Animation
let camDuration = 1.2; // Sekunden




/* ---------------- Resize ---------------- */
function resizeRenderer() {
  const w = container.clientWidth;
  const h = container.clientHeight;

  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

window.addEventListener('resize', resizeRenderer);




//const colorsun = new THREE.Color("rgba(121, 175, 219, 1)");
/* ---------------- Licht ---------------- */
scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(5, 3, 5);
scene.add(sun);

/* ---------------- Erde ---------------- */
const earth = new THREE.Mesh(
  new THREE.SphereGeometry(1, 64, 64),
  new THREE.MeshStandardMaterial({
    map: new THREE.TextureLoader().load('./earth.jpg')
  ,transparent:true,opacity:0.7})
);
scene.add(earth);


/* ---------------- Atmosphäre ---------------- */
function addAtmosphere(radius, opacity,color) {
    const geo = new THREE.SphereGeometry(radius, 64, 64);
    const mat = new THREE.MeshBasicMaterial({       
        color,
    
        transparent: true,
        opacity,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending
    });
    earth.add(new THREE.Mesh(geo, mat));
}
const color1 = new THREE.Color("rgba(97, 149, 221, 1)");
const color2 = new THREE.Color("rgba(121, 152, 221, 1)");
addAtmosphere(1.02, 0.4,color1);
addAtmosphere(1.05, 0.3,color2);

/* ---------------- Ländernamen Gruppe ---------------- */
const countryLabelsGroup = new THREE.Group();
countryLabelsGroup.visible = false;   // initial AUS
earth.add(countryLabelsGroup);

// Speichere die GeoJSON-Daten für Zoom-basierte Sichtbarkeit
let countriesData = [];
const FONT_SIZE = 14;
// Manche Länder/Inseln sollen auch auf der Rückseite sichtbar bleiben (exakte Namen, kleinschreiben)
// (alle Namen in Kleinbuchstaben, mit häufigen Varianten)
const alwaysVisibleList = [
  // 'philippines', 'philippinen',
  // 'marshall islands', 'marshall',
  // 'kiribati',
  // 'tuvalu',
  // 'federated states of micronesia', 'micronesia',
  // 'fiji', 'fijian',
  // 'solomon islands', 'solomon',
  // 'tonga',
  // 'samoa', 'american samoa',
  // 'vanuatu',
  // 'palau'
];

function addGlobeGrid(radius = 1) {

  const material = new THREE.LineBasicMaterial({
    color: 0x888888,
    transparent: true,
    opacity: 0.4
  });

  const segments = 128;

  // Breitenkreise
  for (let lat = -75; lat <= 75; lat += 15) {

    const points = [];

    for (let lon = 0; lon <= 360; lon += 360 / segments) {
      points.push(latLonToVec3(lat, lon, radius * 1.001));
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const circle = new THREE.Line(geometry, material);
    earth.add(circle);
  }

  // Meridiane
  for (let lon = 0; lon < 360; lon += 15) {

    const points = [];

    for (let lat = -90; lat <= 90; lat += 180 / segments) {
      points.push(latLonToVec3(lat, lon, radius * 1.001));
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geometry, material);
    earth.add(line);
  }
}


addGlobeGrid(1);




function createCountryLabel(name, lat, lon, countrySize) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  ctx.font = `${FONT_SIZE}px Arial`;

  const textWidth = ctx.measureText(name).width;
  canvas.width = textWidth + 20;
  canvas.height = FONT_SIZE + 14;

  ctx.font = `${FONT_SIZE}px Arial`;
  ctx.fillStyle = 'black';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 10, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,   // Deaktiviert Tiefe-Test, wir steuern Sichtbarkeit selbst
    depthWrite: false,
    alphaTest: 0.1
  });

  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.1, 0.04, 1);

  // Direkt auf der Erdoberfläche für bessere Zentrierung
  const pos = latLonToVec3(lat, lon, 1.0);
  sprite.position.copy(pos);
  
  // Speichere die Landesgröße als Custom-Attribut
  sprite.userData.countrySize = countrySize;
  // Speichere Koordinaten für erneute Projektion bei Visibility-Toggles
  sprite.userData.lat = lat;
  sprite.userData.lon = lon;
  // und den Namen (kleingeschrieben, gekürzt um überflüssige Wörter) für Whitelist-Prüfungen
  // entferne häufige Suffixe für besseres Matching
  let cleanName = name.toLowerCase()
    .replace(/^the /i, '')
    .trim();
  sprite.userData.name = cleanName;
  // Render last to avoid sorting artefacts
  sprite.renderOrder = 999;
  // Verhindere Frustum-Culling, wir kontrollieren Sichtbarkeit manuell
  sprite.frustumCulled = false;
  if (material.map) material.map.needsUpdate = true;

  countryLabelsGroup.add(sprite);
}

// Berechnet den Flächen-Zentroid eines Rings (Array von [lon, lat])
function polygonCentroid(ring) {
  if (!ring || ring.length === 0) return { area: 0, cx: 0, cy: 0 };
  let area = 0, cx = 0, cy = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[(i + 1) % n];
    const a = xi * yj - xj * yi;
    area += a;
    cx += (xi + xj) * a;
    cy += (yi + yj) * a;
  }
  area = area / 2;
  if (Math.abs(area) < 1e-9) {
    // Fallback: arithmetisches Mittel
    let sx = 0, sy = 0;
    ring.forEach(([x, y]) => { sx += x; sy += y; });
    return { area: 0, cx: sx / n, cy: sy / n };
  }
  cx = cx / (6 * area);
  cy = cy / (6 * area);
  return { area, cx, cy };
}



fetch('./countries.geojson')
  .then(r => r.json())
  .then(data => {
    console.log('GeoJSON geladen:', data.features.length, 'Features');
    
    data.features.forEach((f, idx) => {
      if (!f.geometry || !f.properties) return;

      // Versuche verschiedene Property-Namen für den Ländernamen
      const name = f.properties.ADMIN || f.properties.name || f.properties.NAME || 'Unknown';
      if (!name || name === 'Unknown') return;

      // Wähle das größte Polygon (Mainland) und berechne seinen Flächen-Zentroid
      const polys =
        f.geometry.type === 'Polygon'
          ? [f.geometry.coordinates]
          : f.geometry.type === 'MultiPolygon'
          ? f.geometry.coordinates
          : [];

      let best = null;
      let bestArea = 0;

      polys.forEach(poly => {
        if (!poly || !poly[0]) return;
        // poly ist Array von Ringen; der äußere Ring ist poly[0]
        const outer = poly[0];
        const c = polygonCentroid(outer);
        if (Math.abs(c.area) > bestArea) {
          bestArea = Math.abs(c.area);
          best = c;
        }
      });

      if (!best) return;
      // Verwende den Flächen-Zentroid des größten Polygons
      const avgLon = best.cx;
      const avgLat = best.cy;
      const approxSize = Math.max(1, Math.round(Math.abs(bestArea)));
      // Labels für alle Länder, aber Sichtbarkeit wird später basierend auf Zoom entschieden
      if (approxSize > 0) {
        countriesData.push({ name, lat: avgLat, lon: avgLon, size: approxSize });
        createCountryLabel(name, avgLat, avgLon, approxSize);
      }
    });

    console.log('Ländernamen geladen:', countryLabelsGroup.children.length, 'Labels');
  })
  .catch(err => console.error('Fehler beim Laden des GeoJSON:', err));



/* ---------------- Ländergrenzen Gruppe ---------------- */
const bordersGroup = new THREE.Group();
bordersGroup.visible = false;   // ⬅️ initial AUS
earth.add(bordersGroup);

/* ---------------- Ländergrenzen laden ---------------- */
fetch('./countries.geojson')
  .then(res => res.json())
  .then(data => {
    data.features.forEach(feature => {
      const geom = feature.geometry;
      if (!geom) return;

      const polygons =
        geom.type === 'Polygon'
          ? [geom.coordinates]
          : geom.coordinates;

      polygons.forEach(polygon => {
        polygon.forEach(ring => {
          const points = ring.map(([lon, lat]) =>
            latLonToVec3(lat, lon, 1.0)
          );

          const geometry = new THREE.BufferGeometry().setFromPoints(points);
          const material = new THREE.LineBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.7
          });

          const line = new THREE.Line(geometry, material);
          bordersGroup.add(line);
        });
      });
    });
  });




/* ---------------- Sternenhintergrund ---------------- */
const starfield = getStarfield({ numStars: 1000 });
scene.add(starfield);




/* ---------------- Hilfsfunktionen ---------------- */
function latLonToVec3(lat, lon, r = 1.01) {
  const phi = (90 - lat) * Math.PI / 180;
  const theta = (lon + 180) * Math.PI / 180;
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta)
  );
}

function greatCirclePoints(lat1, lon1, lat2, lon2, segments = 256) {
  const p1 = latLonToVec3(lat1, lon1, 1).normalize();
  const p2 = latLonToVec3(lat2, lon2, 1).normalize();
  const angle = p1.angleTo(p2);
  const pts = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    pts.push(
      p1.clone().multiplyScalar(Math.sin((1 - t) * angle))
        .add(p2.clone().multiplyScalar(Math.sin(t * angle)))
        .divideScalar(Math.sin(angle))
        .multiplyScalar(1.01)
    );
  }
  return pts;
}

function straightLatLonLine(lat1, lon1, lat2, lon2, segments = 64) {
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const lat = lat1 + (lat2 - lat1) * t;
    const lon = lon1 + (lon2 - lon1) * t;
    pts.push(latLonToVec3(lat, lon));
  }
  return pts;
}


function distance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
    Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/* ---------------- Marker ---------------- */
function createMarker(pos, color = 0xffff00) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(0.003, 16, 16),
    new THREE.MeshStandardMaterial({ color })
  );
  m.position.copy(pos);
  earth.add(m);
  return m;
}

/* ---------------- Label (Sprite) ---------------- */
function createLabel(text, position) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  const fontSize = 18;
  ctx.font = `${fontSize}px Arial`;
  const textWidth = ctx.measureText(text).width;

  canvas.width = textWidth + 60;
  canvas.height = fontSize + 30;

  ctx.font = `${fontSize}px Arial`;
  ctx.fillStyle = 'white';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 30, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    alphaTest: 0.1
  });

  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.22, 0.075, 1);
  // Leicht weiter außen platzieren, damit Labels nicht mit Erdoberfläche flackern
  sprite.position.copy(position.clone().multiplyScalar(1.02));

  earth.add(sprite);
  return sprite;
}

/* ---------------- Geocoding ---------------- */
async function geocode(place) {
  const url =
    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(place)}&limit=1`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'threejs-earth-app' }
  });
  const data = await res.json();

  if (!data.length) throw new Error(`Ort nicht gefunden: ${place}`);

  return { lat: +data[0].lat, lon: +data[0].lon };
}

/* ---------------- Route ---------------- */
let routeLine = null;
let straightLine = null;
let objects = [];

let start=null;
let end=null;

// function getRouteCenter(lat1, lon1, lat2, lon2) {
//     const v1 = latLonToVec3(lat1, lon1, 1);
//     const v2 = latLonToVec3(lat2, lon2, 1);

//     return v1.clone().add(v2).multiplyScalar(0.5).normalize();
// }






async function drawRoute(startName, endName) {
  objects.forEach(o => earth.remove(o));
  objects = [];
  if (routeLine) earth.remove(routeLine);
  if (straightLine) earth.remove(straightLine);
  const A = await geocode(startName);
  const B = await geocode(endName);
  start=A;
  end=B;
  

  const pA = latLonToVec3(A.lat, A.lon);
  const pB = latLonToVec3(B.lat, B.lon);

  objects.push(createMarker(pA));
  objects.push(createMarker(pB));
  objects.push(createLabel(startName, pA));
  objects.push(createLabel(endName, pB));

  const pts = greatCirclePoints(A.lat, A.lon, B.lat, B.lon);
  const pts2 = straightLatLonLine(A.lat, A.lon, B.lat, B.lon);

  routeLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0xff0000 })
  );
  earth.add(routeLine);


  straightLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts2),
    new THREE.LineBasicMaterial({ color: 0xff0000 })
  );
  earth.add(straightLine);


  document.getElementById('dist').innerHTML =
    `<br> ${distance(A.lat, A.lon, B.lat, B.lon).toFixed(0)} km`;
 focusCameraOnRoute(start, end);   
}

/* ---------------- UI ---------------- */
document.getElementById('go').onclick = () =>
  drawRoute(
    document.getElementById('start').value,
    document.getElementById('end').value
    
  );




  
//focusCameraOnRoute(start, end);



// const toggleBordersBtn = document.getElementById('toggleBorders');
// if (toggleBordersBtn) {
//   toggleBordersBtn.addEventListener('click', () => {
//     bordersGroup.visible = !bordersGroup.visible;
//   });
// }

const toggleCountriesBtn = document.getElementById('toggleCountries');
if (toggleCountriesBtn) {
  toggleCountriesBtn.addEventListener('click', () => {
    bordersGroup.visible = !bordersGroup.visible;
    countryLabelsGroup.visible = !countryLabelsGroup.visible;
    // Wenn Labels wieder sichtbar werden: reprojecte Positionen und aktualisiere Sichtbarkeit
    if (countryLabelsGroup.visible) {
      countryLabelsGroup.children.forEach(sprite => {
        if (sprite.userData && sprite.userData.lat !== undefined) {
          const p = latLonToVec3(sprite.userData.lat, sprite.userData.lon, 1.0);
          sprite.position.copy(p);
        }
        sprite.frustumCulled = false;
        if (sprite.material && sprite.material.map) sprite.material.map.needsUpdate = true;
      });
      updateCountryLabelVisibility();
    }
  });
}

/* Zoom-basierte Label-Sichtbarkeit und -Größe */
function updateCountryLabelVisibility() {
  const cameraDistance = camera.position.length();
  
  // Je näher die Kamera, desto mehr Labels werden sichtbar
  // Bei Distanz 3.0 (Start): nur sehr große Länder
  // Bei Distanz 2.0: auch größere Länder
  // Bei Distanz 1.5: auch mittlere Länder
  // Bei Distanz 1.2 und näher: alle Länder
  
  let minCountrySize;
  if (cameraDistance > 2.5) {
    minCountrySize = 50;  // Nur sehr große Länder
  } else if (cameraDistance > 2.0) {
    minCountrySize = 25;  // Große Länder
  } else if (cameraDistance > 1.5) {
    minCountrySize = 10;  // Mittlere Länder
  } else {
    minCountrySize = 2;   // Alle Länder
  }
  
  // Begrenzen Sie die Label-Größe basierend auf Kameradistanz und Landesgröße
  // Bei Distanz 3.0: maximale Größe = 1.5
  // Je näher die Kamera kommt, desto mehr wird die Größe begrenzt
  let maxScale = Math.max(0.4, Math.min(1.5, cameraDistance / 2.5));
  
  countryLabelsGroup.children.forEach(sprite => {
    // Sichtbarkeit nur wenn Land groß genug UND auf der sichtbaren Hemisphäre
    const camDir = camera.position.clone().normalize();
    const posDir = sprite.position.clone().normalize();
    const facing = posDir.dot(camDir) > 0.35; // Noch schärferer Rand

    const name = sprite.userData.name || '';
    const isAlways = alwaysVisibleList.some(s => name.includes(s));

    sprite.visible = isAlways || (sprite.userData.countrySize >= minCountrySize && facing);
    // Größenbasierte Skalierung: größere Länder bekommen ein wenig mehr Größe
    const sizeBonus = Math.min(1.8, 0.8 + sprite.userData.countrySize / 500); // bis zu 1.3x für sehr große Länder
    sprite.scale.set(0.1 * maxScale * sizeBonus, 0.04 * maxScale * sizeBonus, 1);
    sprite.renderOrder = 999;
  });
}

/* Zoom-basierte Skalierung für andere Labels */
function updateAllLabelScale() {
  const cameraDistance = camera.position.length();
  let maxScale = Math.max(0.4, Math.min(1.5, cameraDistance / 2.5));
  
  objects.forEach(obj => {
    if (obj instanceof THREE.Sprite) {
      // Route-Labels nur sichtbar wenn sie auf der sichtbaren Hemisphäre liegen
      const camDir = camera.position.clone().normalize();
      const posDir = obj.position.clone().normalize();
      const facing = posDir.dot(camDir) > 0.35;
      obj.visible = facing;
      // Skalieren Sie die Labels proportional
      // Originale Größe war 0.3, 0.1
      obj.scale.set(0.22 * maxScale, 0.075 * maxScale, 1);
      obj.renderOrder = 999;
    }
  });
}


// function focusCameraOnRoute(start, end) {  
//    const v1 = latLonToVec3(start.lat, start.lon, 1).normalize();
//   const v2 = latLonToVec3(end.lat, end.lon, 1).normalize();
//   const center = v1.clone().add(v2).normalize();
//     // 🎯 Zielpunkt setzen
//     //controls.target.copy(center);
//     const distance = 3;   
//     camera.position.copy(center.clone().multiplyScalar(distance)); 
//     // 🔑 OrbitControls synchronisieren
//     controls.update();   
//}

function focusCameraOnRoute(start, end) {

  const v1 = latLonToVec3(start.lat, start.lon, 1).normalize();
  const v2 = latLonToVec3(end.lat, end.lon, 1).normalize();

  const mid = v1.clone().add(v2).normalize();

  // Distanz abhängig von Route
  const angle = v1.angleTo(v2);
  const zoom = 2.5 + angle;  // automatische Entfernung

  camStart.copy(camera.position);
  camEnd.copy(mid.multiplyScalar(zoom));

  camProgress = 0; // Animation starten
}

const clock = new THREE.Clock();

/* ---------------- Animation ---------------- */
function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();

  // Kamera-Transition
  if (camProgress < 1) {

    camProgress += delta / camDuration;
    if (camProgress > 1) camProgress = 1;

    camera.position.lerpVectors(camStart, camEnd, camProgress);

  }


  

  // Aktualisiere Label-Sichtbarkeit und -Größe basierend auf Zoom-Niveau
  if (countryLabelsGroup.visible) {
    updateCountryLabelVisibility();
  }
  
  // Aktualisiere die Größe aller Route-Labels
  updateAllLabelScale();
  controls.update();
  
  renderer.render(scene, camera);
  
}
animate();