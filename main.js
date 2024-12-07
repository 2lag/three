import * as THREE from "three";
import WebGL from 'three/addons/capabilities/WebGL.js';
import { FirstPersonControls } from "three/addons/controls/FirstPersonControls.js";

let cam;
let scene;
let renderer;
let controls;
function init( ) {
  if ( !WebGL.isWebGL2Available( ) )
    return false;

  const w = window.innerWidth;
  const h = window.innerHeight;

  scene = new THREE.Scene( );
  cam = new THREE.PerspectiveCamera( 69, w / h, 0.1, 2000 );
  renderer = new THREE.WebGLRenderer( );
  renderer.setSize( w, h );
  document.body.appendChild( renderer.domElement );
  cam.position.set( 0, 0, 5 );

  const geometry = new THREE.BoxGeometry( );
  const material = new THREE.MeshBasicMaterial( { color: 0xE76969 } );
  const cube = new THREE.Mesh( geometry, material );
  scene.add( cube );

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry( 100, 100 ),
    new THREE.MeshBasicMaterial( { color: 0x808080, side: THREE.DoubleSide } )
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add( ground );

  controls = new FirstPersonControls( cam, renderer.domElement );
  controls.movementSpeed = 5;
  controls.lookSpeed = 0.1;

  return true;
}

function render( ) {
  requestAnimationFrame( render );
  controls.update( 0.016 ); // 1 / 60
  renderer.render( scene, cam );
}

if ( init( ) )
  render( );
else document.getElementsByTagName( 'body' )[ 0 ].appendChild( WebGL.getWebGL2ErrorMessage( ) );
