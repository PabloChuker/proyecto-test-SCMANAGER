// =============================================================================
// SC LABS — buildShipGeometry
//
// Construye un Group Three.js con una nave genérica procedural.
//
// Orientación:
//   Nariz apunta hacia -Z. Alas en ±X. Arriba es +Y.
//
// Mapeo de ejes Star Citizen → Three.js para animación de vuelo:
//   pitch (SC eje Y)  →  rotación Three.js X  (nariz sube/baja)
//   yaw   (SC eje Z)  →  rotación Three.js Y  (nariz gira izq/der)
//   roll  (SC eje X)  →  rotación Three.js Z  (alas se inclinan)
//
// Bounding box aproximado: ±1.25 (X), ±0.35 (Y), -1.3 to +1.1 (Z)
// =============================================================================

import * as THREE from "three";

export function buildShipGeometry(tintColor?: string): THREE.Group {
  const group = new THREE.Group();

  // ─── Materiales ──────────────────────────────────────────────────────────

  const baseHull = new THREE.Color(0x52525b); // zinc-600
  if (tintColor) {
    // Mezcla sutil hacia el color de la nave en el comparador
    baseHull.lerp(new THREE.Color(tintColor), 0.20);
  }

  const hullMat = new THREE.MeshStandardMaterial({
    color: baseHull,
    metalness: 0.82,
    roughness: 0.28,
  });

  const accentMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x27272a), // zinc-800
    metalness: 0.92,
    roughness: 0.12,
  });

  const glassMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x67e8f9), // cyan-300
    transparent: true,
    opacity: 0.55,
    metalness: 0.0,
    roughness: 0.04,
  });

  const engineMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x06b6d4), // cyan-500
    emissive: new THREE.Color(0x0e7490),
    emissiveIntensity: 2.2,
    metalness: 0.3,
    roughness: 0.2,
  });

  const exhaustMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x09090b), // zinc-950
    metalness: 0.96,
    roughness: 0.06,
  });

  // ─── Fuselaje ────────────────────────────────────────────────────────────
  // Cuerpo principal a lo largo del eje Z (nariz en -Z, cola en +Z)
  const bodyGeo = new THREE.CylinderGeometry(0.10, 0.16, 1.50, 8);
  const body = new THREE.Mesh(bodyGeo, hullMat);
  body.rotation.x = Math.PI / 2; // rotar para que eje sea Z
  group.add(body);

  // Cono de nariz (punta hacia -Z)
  const noseGeo = new THREE.ConeGeometry(0.10, 0.58, 8);
  const nose = new THREE.Mesh(noseGeo, hullMat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -1.04;
  group.add(nose);

  // Bloque de cola
  const tailGeo = new THREE.CylinderGeometry(0.16, 0.20, 0.20, 8);
  const tail = new THREE.Mesh(tailGeo, accentMat);
  tail.rotation.x = Math.PI / 2;
  tail.position.z = 0.85;
  group.add(tail);

  // ─── Alas principales ────────────────────────────────────────────────────
  const wingGeo = new THREE.BoxGeometry(1.28, 0.055, 0.72);

  const leftWing = new THREE.Mesh(wingGeo, hullMat);
  leftWing.position.set(-0.64, -0.01, 0.10);
  leftWing.rotation.y = 0.18; // ligero ángulo de flecha
  group.add(leftWing);

  const rightWing = new THREE.Mesh(wingGeo, hullMat);
  rightWing.position.set(0.64, -0.01, 0.10);
  rightWing.rotation.y = -0.18;
  group.add(rightWing);

  // Sensores/luces en puntas de ala
  const tipGeo = new THREE.SphereGeometry(0.042, 5, 3);
  const leftTip = new THREE.Mesh(tipGeo, engineMat);
  leftTip.position.set(-1.22, 0, 0.12);
  group.add(leftTip);

  const rightTip = new THREE.Mesh(tipGeo, engineMat);
  rightTip.position.set(1.22, 0, 0.12);
  group.add(rightTip);

  // ─── Estabilizadores horizontales (cola) ─────────────────────────────────
  const hStabGeo = new THREE.BoxGeometry(0.78, 0.042, 0.30);

  const lStab = new THREE.Mesh(hStabGeo, accentMat);
  lStab.position.set(-0.39, 0, 0.73);
  group.add(lStab);

  const rStab = new THREE.Mesh(hStabGeo, accentMat);
  rStab.position.set(0.39, 0, 0.73);
  group.add(rStab);

  // ─── Estabilizador vertical ───────────────────────────────────────────────
  const vStabGeo = new THREE.BoxGeometry(0.036, 0.34, 0.30);
  const vStab = new THREE.Mesh(vStabGeo, accentMat);
  vStab.position.set(0, 0.19, 0.70);
  group.add(vStab);

  // ─── Motores ─────────────────────────────────────────────────────────────
  const exGeo = new THREE.CylinderGeometry(0.068, 0.090, 0.18, 8);

  const lEx = new THREE.Mesh(exGeo, exhaustMat);
  lEx.rotation.x = Math.PI / 2;
  lEx.position.set(-0.27, -0.04, 0.97);
  group.add(lEx);

  const rEx = new THREE.Mesh(exGeo, exhaustMat);
  rEx.rotation.x = Math.PI / 2;
  rEx.position.set(0.27, -0.04, 0.97);
  group.add(rEx);

  // Aros de brillo de motor (emissive cyan)
  const glowGeo = new THREE.TorusGeometry(0.072, 0.013, 6, 12);

  const lGlow = new THREE.Mesh(glowGeo, engineMat);
  lGlow.position.set(-0.27, -0.04, 1.07);
  group.add(lGlow);

  const rGlow = new THREE.Mesh(glowGeo, engineMat);
  rGlow.position.set(0.27, -0.04, 1.07);
  group.add(rGlow);

  // ─── Carlinga (cockpit) ───────────────────────────────────────────────────
  // Domo semiesférico encima del fuselaje
  const cockpitGeo = new THREE.SphereGeometry(0.076, 7, 5, 0, Math.PI * 2, 0, Math.PI * 0.52);
  const cockpit = new THREE.Mesh(cockpitGeo, glassMat);
  cockpit.position.set(0, 0.10, -0.34);
  group.add(cockpit);

  return group;
}

/** Libera toda la geometría y materiales del grupo */
export function disposeShipGeometry(group: THREE.Group): void {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => m.dispose());
      } else {
        obj.material.dispose();
      }
    }
  });
}
