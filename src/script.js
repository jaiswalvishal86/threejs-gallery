import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import * as dat from "lil-gui";
import {
  MSDFTextGeometry,
  MSDFTextMaterial,
  uniforms,
} from "three-msdf-text-utils";

import fnt from "../fonts/PPNuneMontrealMedium.json";
import atlasURL from "../fonts/PPNeueMontrealMedium.png";
import VirtualScroll from "virtual-scroll";

// console.log(fnt, atlasURL);

THREE.ColorManagement.enabled = false;

/**
 * Base
 */
// Debug
// const gui = new dat.GUI({ width: 340 });

// Canvas
const canvas = document.querySelector("canvas.webgl");

// Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const sceneCopy = new THREE.Scene();

const smallScreenQuery = window.matchMedia("(max-width: 768px)");
const mediumScreenQuery = window.matchMedia(
  "(min-width: 769px) and (max-width: 1024px)"
);
const largeScreenQuery = window.matchMedia("(min-width: 1025px)");

const TEXTS = [
  "Denouement",
  "Ephemeral",
  "Eloquence",
  "Felicity",
  "Incendiary",
  "Luminescence",
  "Mellifluous",
  "Onomatopoeia",
  "Quintessence",
  "Serendipity",
];

const textures = [...document.querySelectorAll(".js-texture")];

const texturesArray = textures.map((t) => {
  return new THREE.TextureLoader().load(t.src);
});
/**
 * Group
 */
const group = new THREE.Group();
const groupPlane = new THREE.Group();
const groupCopy = new THREE.Group();
sceneCopy.add(groupCopy);
scene.add(group);
scene.add(groupPlane);

const material = new THREE.ShaderMaterial({
  side: THREE.DoubleSide,
  transparent: true,
  defines: {
    IS_SMALL: false,
  },
  extensions: {
    derivatives: true,
  },
  uniforms: {
    uSpeed: { value: 0 },
    // Common
    ...uniforms.common,

    // Rendering
    ...uniforms.rendering,

    // Strokes
    ...uniforms.strokes,
  },
  vertexShader: `
      // Attribute
      attribute vec2 layoutUv;

      attribute float lineIndex;

      attribute float lineLettersTotal;
      attribute float lineLetterIndex;

      attribute float lineWordsTotal;
      attribute float lineWordIndex;

      attribute float wordIndex;

      attribute float letterIndex;

      // Varyings
      varying vec2 vUv;
      varying vec2 vLayoutUv;
      varying vec3 vViewPosition;
      varying vec3 vNormal;

      varying float vLineIndex;

      varying float vLineLettersTotal;
      varying float vLineLetterIndex;

      varying float vLineWordsTotal;
      varying float vLineWordIndex;

      varying float vWordIndex;

      varying float vLetterIndex;

      

      mat4 rotationMatrix(vec3 axis, float angle) {
        axis = normalize(axis);
        float s = sin(angle);
        float c = cos(angle);
        float oc = 1.0 - c;
        
        return mat4(oc * axis.x * axis.x + c,           oc * axis.x * axis.y - axis.z * s,  oc * axis.z * axis.x + axis.y * s,  0.0,
                    oc * axis.x * axis.y + axis.z * s,  oc * axis.y * axis.y + c,           oc * axis.y * axis.z - axis.x * s,  0.0,
                    oc * axis.z * axis.x - axis.y * s,  oc * axis.y * axis.z + axis.x * s,  oc * axis.z * axis.z + c,           0.0,
                    0.0,                                0.0,                                0.0,                                1.0);
    }
    
    vec3 rotate(vec3 v, vec3 axis, float angle) {
      mat4 m = rotationMatrix(axis, angle);
      return (m * vec4(v, 1.0)).xyz;
    }
    uniform float uSpeed;

      void main() {
          

          // Varyings
          vUv = uv;
          vLayoutUv = layoutUv;
          
          vNormal = normal;

          vLineIndex = lineIndex;

          vLineLettersTotal = lineLettersTotal;
          vLineLetterIndex = lineLetterIndex;

          vLineWordsTotal = lineWordsTotal;
          vLineWordIndex = lineWordIndex;

          vWordIndex = wordIndex;

          vLetterIndex = letterIndex;

          // Output
          vec3 newpos = position;

          newpos = rotate(newpos, vec3(.0, 0.0, 1.0), 0.003 * uSpeed * position.x);
          vec4 mvPosition = vec4(newpos, 1.0);
          mvPosition = modelViewMatrix * mvPosition;
          gl_Position = projectionMatrix * mvPosition;

          vViewPosition = -mvPosition.xyz;
      }
  `,
  fragmentShader: `
      // Varyings
      varying vec2 vUv;

      // Uniforms: Common
      uniform float uOpacity;
      uniform float uThreshold;
      uniform float uAlphaTest;
      uniform vec3 uColor;
      uniform sampler2D uMap;

      // Uniforms: Strokes
      uniform vec3 uStrokeColor;
      uniform float uStrokeOutsetWidth;
      uniform float uStrokeInsetWidth;

      // Utils: Median
      float median(float r, float g, float b) {
          return max(min(r, g), min(max(r, g), b));
      }

      void main() {
          // Common
          // Texture sample
          vec3 s = texture2D(uMap, vUv).rgb;

          // Signed distance
          float sigDist = median(s.r, s.g, s.b) - 0.5;

          float afwidth = 1.4142135623730951 / 2.0;

          #ifdef IS_SMALL
              float alpha = smoothstep(uThreshold - afwidth, uThreshold + afwidth, sigDist);
          #else
              float alpha = clamp(sigDist / fwidth(sigDist) + 0.5, 0.0, 1.0);
          #endif

          // Strokes
          // Outset
          float sigDistOutset = sigDist + uStrokeOutsetWidth * 0.5;

          // Inset
          float sigDistInset = sigDist - uStrokeInsetWidth * 0.5;

          #ifdef IS_SMALL
              float outset = smoothstep(uThreshold - afwidth, uThreshold + afwidth, sigDistOutset);
              float inset = 1.0 - smoothstep(uThreshold - afwidth, uThreshold + afwidth, sigDistInset);
          #else
              float outset = clamp(sigDistOutset / fwidth(sigDistOutset) + 0.5, 0.0, 1.0);
              float inset = 1.0 - clamp(sigDistInset / fwidth(sigDistInset) + 0.5, 0.0, 1.0);
          #endif

          // Border
          float border = outset * inset;

          // Alpha Test
          if (alpha < uAlphaTest) discard;

          // Output: Common
          vec4 filledFragColor = vec4(uColor, uOpacity * alpha);

          // Output: Strokes
          vec4 strokedFragColor = vec4(uStrokeColor, uOpacity * border);

          gl_FragColor = filledFragColor;
      }
  `,
});

Promise.all([loadFontAtlas(atlasURL)]).then(([atlas]) => {
  TEXTS.forEach((text, i) => {
    const geometry = new MSDFTextGeometry({
      text: text.toUpperCase(),
      font: fnt,
    });

    let size = 0.5;
    let s = 0.01;
    material.uniforms.uMap.value = atlas;

    const mesh = new THREE.Mesh(geometry, material);
    mesh.scale.set(s, -s, s);
    mesh.position.x = -1.5;
    mesh.position.y = size * i;
    group.add(mesh);
    groupCopy.add(mesh.clone());
  });
});

function loadFontAtlas(path) {
  const promise = new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader();
    loader.load(path, resolve);
  });

  return promise;
}

/**
 * Sizes
 */
const sizes = {
  width: window.innerWidth,
  height: window.innerHeight,
};

window.addEventListener("resize", () => {
  // Update sizes
  sizes.width = window.innerWidth;
  sizes.height = window.innerHeight;

  // Update camera
  camera.aspect = sizes.width / sizes.height;
  camera.updateProjectionMatrix();

  // Update renderer
  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

window.addEventListener("dblclick", () => {
  const fullscreenElement =
    document.fullscreenElement || document.webkitFullscreenElement;

  if (!fullscreenElement) {
    if (canvas.requestFullscreen) {
      canvas.requestFullscreen();
    } else if (canvas.webkitRequestFullscreen) {
      canvas.webkitRequestFullscreen();
    }
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
  }
});

/**
 * Camera
 */
// Base camera
const camera = new THREE.PerspectiveCamera(
  75,
  sizes.width / sizes.height,
  0.1,
  100
);
camera.position.set(0, 0, 2);

scene.add(camera);

// Controls
// const controls = new OrbitControls(camera, canvas);
// controls.enableDamping = true;
/**
 * Renderer
 */
const renderer = new THREE.WebGLRenderer({
  canvas: canvas,
  antialias: true,
  alpha: true,
});
renderer.autoClear = false;
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

let position = 0;
let speed = 0;
let targetSpeed = 0;
const scroller = new VirtualScroll();
scroller.on((event) => {
  position = event.y / 4000;
  speed = event.deltaY / 2000;
});

const planeMaterial = new THREE.ShaderMaterial({
  side: THREE.DoubleSide,
  uniforms: {
    uFrequency: {
      value: new THREE.Vector2(5, 5),
    },
    uTime: { value: 0 },
    uMouse: { value: new THREE.Vector2() },
    uTexture: { value: texturesArray[0] },
    // resolution: { value: new THREE.Vector4() },
    uResolution: { value: new THREE.Vector2() },
    uDisplace: { value: 2 },
    uSpread: { value: 10 },
    uNoise: { value: 5 },
  },
  vertexShader: `
  uniform vec2 uFrequency;
  uniform float uTime;
  uniform vec2 uMouse; 
  uniform float uDisplace;
  uniform float uSpread;
  uniform float uNoise;
  uniform vec2 uResolution;
  


  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec2 vUv;




  #define PI 3.14159265358979
  #define MOD3 vec3(.1031,.11369,.13787)
  
  vec3 hash33(vec3 p3) {
    p3 = fract(p3 * MOD3);
      p3 += dot(p3, p3.yxz+19.19);
      return -1.0 + 2.0 * fract(vec3((p3.x + p3.y)*p3.z, (p3.x+p3.z)*p3.y, (p3.y+p3.z)*p3.x));
  }
  
  float pnoise(vec3 p) {
      vec3 pi = floor(p);
      vec3 pf = p - pi;
      vec3 w = pf * pf * (3. - 2.0 * pf);
      return 	mix(
              mix(
                    mix(dot(pf - vec3(0, 0, 0), hash33(pi + vec3(0, 0, 0))),
                          dot(pf - vec3(1, 0, 0), hash33(pi + vec3(1, 0, 0))),
                           w.x),
                    mix(dot(pf - vec3(0, 0, 1), hash33(pi + vec3(0, 0, 1))),
                          dot(pf - vec3(1, 0, 1), hash33(pi + vec3(1, 0, 1))),
                           w.x),
                    w.z),
              mix(
                      mix(dot(pf - vec3(0, 1, 0), hash33(pi + vec3(0, 1, 0))),
                          dot(pf - vec3(1, 1, 0), hash33(pi + vec3(1, 1, 0))),
                           w.x),
                       mix(dot(pf - vec3(0, 1, 1), hash33(pi + vec3(0, 1, 1))),
                          dot(pf - vec3(1, 1, 1), hash33(pi + vec3(1, 1, 1))),
                           w.x),
                    w.z),
            w.y);
  }
 

  void main()
  {
      
  
      // modelPosition.z += aRandom;
      

      vUv = uv;
      vec3 pos = position;

      // Calculate the distance between the current vertex and the mouse position
      float dist = distance(uMouse, vec2(pos.x, pos.y));

      // Adjust the Z coordinate based on the mouse distance
      // pos.z = sin(dist * 1.0 + uTime);

      float pat = pnoise(vec3(vUv * uNoise , uTime * 1.5 )) * uDisplace ;
      float proximity = abs(vUv.x - (.5 + sin(uTime)/(10. * uSpread ) ));
      vec3 full = pat * vec3(clamp(.05 * uSpread  - proximity , 0.01, 0.01));
      // vec3 newPosition = vPosition + vNormal * full;
      vec3 p = pos + full;




      vec4 modelPosition = modelMatrix * vec4(p, 1.0);
      modelPosition.z += sin(modelPosition.x * uFrequency.x - uTime) * 0.05;
      modelPosition.z += sin(modelPosition.y * uFrequency.y - uTime) * 0.05;
  
      vec4 viewPosition = viewMatrix * modelPosition;
      vec4 projectedPosition = projectionMatrix * viewPosition;
  
  
      gl_Position = projectedPosition;
  
      
  }
  `,
  fragmentShader: `
  uniform sampler2D uTexture;
  uniform float uTime;
  uniform vec2 uMouse;
  uniform vec2 uResolution;
  uniform float uDisplace;
  uniform float uSpread;
  uniform float uNoise;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPattern;
  varying vec3 vPosition;


  #define PI 3.14159265358979
#define MOD3 vec3(.1031,.11369,.13787)

vec3 hash33(vec3 p3) {
	p3 = fract(p3 * MOD3);
    p3 += dot(p3, p3.yxz+19.19);
    return -1.0 + 2.0 * fract(vec3((p3.x + p3.y)*p3.z, (p3.x+p3.z)*p3.y, (p3.y+p3.z)*p3.x));
}

float pnoise(vec3 p) {
    vec3 pi = floor(p);
    vec3 pf = p - pi;
    vec3 w = pf * pf * (3. - 2.0 * pf);
    return 	mix(
        		mix(
                	mix(dot(pf - vec3(0, 0, 0), hash33(pi + vec3(0, 0, 0))),
                        dot(pf - vec3(1, 0, 0), hash33(pi + vec3(1, 0, 0))),
                       	w.x),
                	mix(dot(pf - vec3(0, 0, 1), hash33(pi + vec3(0, 0, 1))),
                        dot(pf - vec3(1, 0, 1), hash33(pi + vec3(1, 0, 1))),
                       	w.x),
                	w.z),
        		mix(
                    mix(dot(pf - vec3(0, 1, 0), hash33(pi + vec3(0, 1, 0))),
                        dot(pf - vec3(1, 1, 0), hash33(pi + vec3(1, 1, 0))),
                       	w.x),
                   	mix(dot(pf - vec3(0, 1, 1), hash33(pi + vec3(0, 1, 1))),
                        dot(pf - vec3(1, 1, 1), hash33(pi + vec3(1, 1, 1))),
                       	w.x),
                	w.z),
    			w.y);
}
  
  void main()
  {
      vec2 p = vUv;

      // float distortAmount = length(p + uMouse) * 0.1;
      // p -= sin(distortAmount) * 0.15;

      float pat = pnoise(vec3(p * uNoise , uMouse * 3.0 )) * uDisplace ;
      // float proximity = abs(vUv.x - (.5 + sin(uTime)/(12. * uSpread ) ));
      // vec3 full = pat * vec3(clamp(.23 * uSpread  - proximity , 0., 1.));
      // vec3 newPosition = vPosition + vNormal * full;
      p += sin(pat) * 0.05;

      vec4 textureColor = texture2D(uTexture, p);
      gl_FragColor = textureColor;
  }
  `,
});

const planeGeometry = new THREE.PlaneGeometry(
  2 / 3,
  1.3 / 3,
  100,
  100
).translate(0, 0, 1);
let pos = planeGeometry.attributes.position.array;
let r = 1.5;
let newpos = [];

for (let i = 0; i < pos.length; i += 3) {
  let x = pos[i];
  let y = pos[i + 1];
  let z = pos[i + 2];

  let xz = new THREE.Vector2(x, z).normalize().multiplyScalar(r);

  newpos.push(xz.x, y, xz.y);
}

planeGeometry.setAttribute(
  "position",
  new THREE.Float32BufferAttribute(newpos, 3)
);

const planeMesh = new THREE.Mesh(planeGeometry, planeMaterial);
groupPlane.add(planeMesh);

function handleScreenSizeChanges() {
  if (smallScreenQuery.matches) {
    scroller.on((event) => {
      position = event.y / 800;
      speed = event.deltaY / 500;
    });
    group.scale.set(0.4, 0.4, 0.4); // Scale down for small screens
    groupCopy.scale.set(0.4, 0.4, 0.4); // Scale down for small screens
    planeMesh.scale.set(0.85, 0.85, 0.85); // Scale down for small screens
  } else if (mediumScreenQuery.matches) {
    scroller.on((event) => {
      position = event.y / 1200;
      speed = event.deltaY / 800;
    });
    group.scale.set(0.5, 0.5, 0.5); // Default scale for medium screens
    groupCopy.scale.set(0.5, 0.5, 0.5); // Default scale for medium screens
    planeMesh.scale.set(0.8, 0.8, 0.8); // Scale down for small screens
  } else if (largeScreenQuery.matches) {
    group.scale.set(1, 1, 1); // Scale up for large screens
    groupCopy.scale.set(1, 1, 1); // Scale up for large screens
    planeMesh.scale.set(1, 1, 1); // Scale down for small screens
  }
}

// Initial call to set the initial scale based on the screen size
handleScreenSizeChanges();

// Add event listeners for screen size changes
smallScreenQuery.addListener(handleScreenSizeChanges);
mediumScreenQuery.addListener(handleScreenSizeChanges);
largeScreenQuery.addListener(handleScreenSizeChanges);

const mouse = new THREE.Vector2();

window.addEventListener("mousemove", (event) => {
  // Convert mouse coordinates to the range (0, 1)
  mouse.x = event.clientX / window.innerWidth;
  mouse.y = 1.0 - event.clientY / window.innerHeight;

  // Update the uniform variable in your shader material
  planeMaterial.uniforms.uMouse.value = mouse;
});

function updateTextures() {
  let index = Math.round(position + 10000) % textures.length;

  planeMaterial.uniforms.uTexture.value = texturesArray[index];

  groupCopy.children.forEach((mesh, i) => {
    if (i !== index) {
      mesh.visible = false;
    } else {
      mesh.visible = true;
    }
  });
}

/**
 * Animate
 */
const clock = new THREE.Clock();

const tick = () => {
  const elapsedTime = clock.getElapsedTime();

  // Update texture
  updateTextures();
  // controls.update();
  speed *= 0.9;
  targetSpeed += (speed - targetSpeed) * 0.1;
  material.uniforms.uSpeed.value = targetSpeed;
  planeMesh.rotation.y = -position * Math.PI * 2;
  planeMaterial.uniforms.uTime.value = elapsedTime;
  groupPlane.rotation.z = 0.2 * Math.sin(position * 0.5);
  group.position.y = -position * 0.5;
  groupCopy.position.y = -position * 0.5;
  // Render
  renderer.render(scene, camera);
  renderer.clearDepth();
  renderer.render(sceneCopy, camera);

  // Call tick again on the next frame
  window.requestAnimationFrame(tick);
};

tick();
