/**
 * Materiales de la escena: el difuminado de bordes, el resaltado por edificio y
 * el oleaje del mar viven AQUÍ, inyectados en materiales estándar de three.js.
 *
 * POR QUÉ SE INYECTA EN LUGAR DE ESCRIBIR SHADERS PROPIOS: los materiales
 * estándar ya resuelven luces, sombras y niebla, y reescribirlo para añadir tres
 * efectos sería más código y más fallos. `onBeforeCompile` añade solo lo nuestro.
 *
 * EL DIFUMINADO NO USA TRANSPARENCIA. La ciudad no se vuelve translúcida hacia
 * el borde: su color se MEZCLA con el color de la niebla (que es también el del
 * horizonte del cielo). Es opaco, no necesita ordenar objetos y no cuesta nada
 * en móvil. Más allá de la banda el color es exactamente el de la niebla, así
 * que no existe un borde que ver ni un vacío que enseñar.
 *
 * B.4 — EL DIFUMINADO ES RADIAL. La zona es un círculo (centro y radio en la
 * configuración de la ciudad): la distancia al borde es `length(p − c) − R`, la
 * misma en todas las direcciones. Lo difuminado y la banda de nubes comparten
 * esa definición, así que no puede haber una dirección con otro borde.
 */

import * as THREE from "three";

export type FadeCircle = { cx: number; cz: number; radius: number };

export type SceneUniforms = {
  uCircle: { value: THREE.Vector3 };
  uBand: { value: number };
  uFadeColor: { value: THREE.Color };
  uTime: { value: number };
  uHover: { value: number };
  uSelected: { value: number };
  /** Textura 8192 × 1: R > 0 en el índice `bid` de lo que está comprado. */
  uOwnedTex: { value: THREE.Texture | null };
  uOwnedColor: { value: THREE.Color };
};

export function createSceneUniforms(
  circle: FadeCircle,
  bandM: number,
  fadeColor: string,
): SceneUniforms {
  return {
    uCircle: { value: new THREE.Vector3(circle.cx, circle.cz, circle.radius) },
    uBand: { value: bandM },
    uFadeColor: { value: new THREE.Color(fadeColor) },
    uTime: { value: 0 },
    uHover: { value: -1 },
    uSelected: { value: -1 },
    uOwnedTex: { value: null },
    uOwnedColor: { value: new THREE.Color("#e0663a") },
  };
}

export type PatchOptions = {
  /** Difuminar hacia el color de niebla fuera del polígono. */
  fade?: boolean;
  /** El material lee `bid` (índice de edificio) y resalta hover/selección. */
  buildingId?: boolean;
  /** Geometría instanciada (árboles): la posición de mundo usa `instanceMatrix`. */
  instanced?: boolean;
  /** Clave para que dos variantes distintas no compartan programa. */
  key: string;
};

/** Añade difuminado, resaltado y oleaje a un material estándar. */
export function patchMaterial(
  material: THREE.Material,
  uniforms: SceneUniforms,
  options: PatchOptions,
): void {
  const { fade = true, buildingId = false, instanced = false } = options;

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uCircle: uniforms.uCircle,
      uBand: uniforms.uBand,
      uFadeColor: uniforms.uFadeColor,
      uTime: uniforms.uTime,
      uHover: uniforms.uHover,
      uSelected: uniforms.uSelected,
      uOwnedTex: uniforms.uOwnedTex,
      uOwnedColor: uniforms.uOwnedColor,
    });

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uTime;
        varying vec2 vFadeXZ;
        ${buildingId ? "attribute float bid; varying float vBid;" : ""}`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        ${buildingId ? "vBid = bid;" : ""}`,
      )
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        {
          vec4 fadeWorld = vec4(transformed, 1.0);
          ${instanced ? "#ifdef USE_INSTANCING\n fadeWorld = instanceMatrix * fadeWorld;\n #endif" : ""}
          fadeWorld = modelMatrix * fadeWorld;
          vFadeXZ = fadeWorld.xz;
        }`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform vec3 uCircle;
        uniform float uBand;
        uniform vec3 uFadeColor;
        uniform float uHover;
        uniform float uSelected;
        ${buildingId ? "uniform sampler2D uOwnedTex; uniform vec3 uOwnedColor;" : ""}
        varying vec2 vFadeXZ;
        ${buildingId ? "varying float vBid;" : ""}`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        ${
          buildingId
            ? `{
                 // Comprado: el edificio se tiñe hacia el color de acento y brilla muy poco.
                 float owned = vBid >= 0.0 ? texture2D(uOwnedTex, vec2((vBid + 0.5) / 8192.0, 0.5)).r : 0.0;
                 diffuseColor.rgb = mix(diffuseColor.rgb, uOwnedColor, owned * 0.3);
               }
               if (abs(vBid - uHover) < 0.5 || abs(vBid - uSelected) < 0.5) {
                 diffuseColor.rgb = diffuseColor.rgb * 1.22 + vec3(0.085, 0.07, 0.05);
               }`
            : ""
        }`,
      )
      .replace(
        "#include <fog_fragment>",
        `#include <fog_fragment>
        ${
          fade
            ? `{
                 float edge = length(vFadeXZ - uCircle.xy) - uCircle.z;
                 float keep = 1.0 - smoothstep(0.0, uBand, edge);
                 // fog_fragment va DESPUÉS de la conversión de color de salida: el color de
                 // difuminado (lineal) hay que convertirlo igual, o saldría más oscuro que el fondo.
                 vec3 fadeOut = linearToOutputTexel( vec4( uFadeColor, 1.0 ) ).rgb;
                 gl_FragColor.rgb = mix(fadeOut, gl_FragColor.rgb, keep);
               }`
            : ""
        }`,
      );
  };
  material.customProgramCacheKey = () => `scene:${options.key}`;
}

/** Fracción visible (1 = nítido, 0 = niebla) en un punto, igual que el shader. */
export function fadeKeep(circle: FadeCircle, bandM: number, x: number, z: number): number {
  const edge = Math.hypot(x - circle.cx, z - circle.cz) - circle.radius;
  const t = Math.min(1, Math.max(0, edge / bandM));
  return 1 - t * t * (3 - 2 * t);
}
