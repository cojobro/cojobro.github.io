//import './style.css'

//import * as THREE from 'three';

//import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75,window.innerWidth/window.innerHeight,0.1,1000);

// Create a function that resizes the camera whenever the size of the window is changed
window.addEventListener('resize', onWindowResize, false);

function onWindowResize() {
  // Update camera aspect ratio and projection matrix
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  // Update renderer size
  renderer.setSize( window.innerWidth, window.innerHeight );
}

const renderer = new THREE.WebGLRenderer({
  canvas: document.querySelector('#bg'),
});

renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize( window.innerWidth, window.innerHeight );

renderer.render( scene,camera );

const geometry = new THREE.TorusGeometry( 10, 1.5, 16, 100 )
const material = new THREE.MeshStandardMaterial( { color: 0xf0e746 } );
const torus = new THREE.Mesh( geometry, material );
torus.position.set(0,0,0)

scene.add(torus)

const pointLight = new THREE.PointLight(0xffffff)
pointLight.position.set(0,0,0)
const ambientLight = new THREE.AmbientLight(0xffffff)

scene.add(pointLight,ambientLight)

//add a visual helper for the point light and grid for viewing layout
//const lightHelper = new THREE.PointLightHelper(pointLight)
//const gridHelper = new THREE.GridHelper(200,50)

//scene.add(lightHelper,gridHelper)

//adds mouse controls to move and rotate the camera
//const controls = new OrbitControls(camera, renderer.domElement)

function addBit() {
  const geometry = new THREE.BoxGeometry(0.5,1,1);
  const material = new THREE.MeshStandardMaterial( { color: 0x8afa0a, wireframe: true } );
  const bit = new THREE.Mesh( geometry, material );

  const [x, y, z] = Array(3).fill()
    .map(() => THREE.MathUtils.randFloatSpread(200) );

  bit.position.set(x,y,z);
  return bit
}

const bits = Array(300).fill().map(() => addBit())
bits.forEach(function (e) {
  scene.add(e)
});

const conorTexture = new THREE.TextureLoader().load('conor.JPG');
const conor = new THREE.Mesh(
  new THREE.BoxGeometry(6, 6, 6), 
  new THREE.MeshBasicMaterial({ map: conorTexture })
);
conor.position.set(0,0,0)
scene.add(conor);

function moveCamera() {
  const t = document.body.getBoundingClientRect().top;
  //console.log(t)
  //currently ranges (8->-5219)
  torus.rotateX(0.005);
  torus.rotateY(0.001)
  
  conor.rotateY(-0.01)
  conor.rotateZ(-0.01)

  bits.forEach(function (e) {
    e.rotateY(.01);
  });

  camera.position.z = t * 0.028 + 100;
  camera.position.x = t * 0.0002 - 25;
  camera.position.y = t * 0.00575 + 30;
  camera.rotation.y = t * 0.0004;
  camera.rotation.z = t * 0.0004;
  camera.rotation.x = t * 0.0003;
}

document.body.onscroll = moveCamera;
moveCamera();

function animate() {
  requestAnimationFrame( animate );

  torus.rotateX(0.003);
  torus.rotateY(0.0006)
  
  conor.rotateY(-0.001)
  conor.rotateZ(-0.001)

  bits.forEach(function (e) {
    e.rotateY(.01);
  });

  //controls.update()
  renderer.render( scene, camera );
}

animate()
