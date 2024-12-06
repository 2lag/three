import * as THREE from "https://cdn.jsdelivr.net/npm/three@v0.171.0/build/three.module.js";

function init( ) {
  const scene = new THREE.Scene( );
  const cam = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
  const renderer = new THREE.WebGLRenderer( );
  
  renderer.setSize( window.innerWidth, window.innerHeight );
  document.body.appendChild( renderer.domElement );
  cam.position.z = 5;

  const geometry = new THREE.BoxGeometry( );
  const material = new THREE.MeshBasicMaterial( { color: 0xE76969 } );
  const cube = new THREE.Mesh( geometry, material );
  scene.add( cube );

  function animate( ) {
    requestAnimationFrame( animate );

    cube.rotation.x += 0.01;
    cube.rotation.y += 0.01;

    renderer.render( scene, cam );
  }

  animate( );
}

init( );