import * as THREE from "three";

import WebGL from 'three/addons/capabilities/WebGL.js';

import { FlyControls } from 'three/addons/controls/FlyControls.js';

import { getQuakePalette } from './js/static.js'
import WadParser from './js/WadParser.js';

const HALF_PI = Math.PI / 2;
const UPDATE_TIME = 1 / 30;
const FLT_EPSILON = 1e-6;

function loadWad( wad_data ) {
  let parser = new WadParser( wad_data );

  try {
    parser.parseHeader( );
  } catch( err ) {
    // todo : display `Invalid WAD : ${ parser.header.magic }` msg on screen
  }

  parser.parseDirectory( );
  return parser;
}

const quake_line_regex = /^\(\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s*\)\s*\(\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s*\)\s*\(\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s*\)\s+(\S+)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)/;
function parseQuakeMapLine( line ) {
  const match = line.match( quake_line_regex );

  if ( !match )
    return null;

  return {
    type: "QUAKE",
    v0: new THREE.Vector3( Number( match[ 1 ] ), Number( match[ 2 ] ), Number( match[ 3 ] ) ),
    v1: new THREE.Vector3( Number( match[ 4 ] ), Number( match[ 5 ] ), Number( match[ 6 ] ) ),
    v2: new THREE.Vector3( Number( match[ 7 ] ), Number( match[ 8 ] ), Number( match[ 9 ] ) ),
    texture: match[ 10 ],
    uv_offset: new THREE.Vector2( Number( match[ 11 ] ), Number( match[ 12 ] ) ),
    rotation: Number( match[ 13 ] ),
    uv_scale: new THREE.Vector2( Number( match[ 14 ] ), Number( match[ 15 ] ) )
  };
}

const valve_line_regex = /^\(\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s*\)\s*\(\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s*\)\s*\(\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s*\)\s+(\S+)\s+\[\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+\]\s+\[\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+\]\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)/;
function parseValveMapLine( line ) {
  const match = line.match( valve_line_regex );

  if ( !match )
    return null;

  return {
    type: "VALVE",
    v0: new THREE.Vector3( Number( match[ 1 ] ), Number( match[ 2 ] ), Number( match[ 3 ] ) ),
    v1: new THREE.Vector3( Number( match[ 4 ] ), Number( match[ 5 ] ), Number( match[ 6 ] ) ),
    v2: new THREE.Vector3( Number( match[ 7 ] ), Number( match[ 8 ] ), Number( match[ 9 ] ) ),
    texture: match[ 10 ],
    u: new THREE.Vector4( Number( match[ 11 ] ), Number( match[ 12 ] ), Number( match[ 13 ] ), Number( match[ 14 ] ) ), // Ux Uy Uz Uoffset
    v: new THREE.Vector4( Number( match[ 15 ] ), Number( match[ 16 ] ), Number( match[ 17 ] ), Number( match[ 18 ] ) ), // Vx Vy Vz Voffset
    rotation: Number( match[ 19 ] ),
    uv_scale: new THREE.Vector2( Number( match[ 20 ] ), Number( match[ 21 ] ) )
  };
}

const term0 = new THREE.Vector3( );
const term1 = new THREE.Vector3( );
const term2 = new THREE.Vector3( );
function computeIntersection( p0, p1, p2 ) {
  const n0 = p0.normal;
  const n1 = p1.normal;
  const n2 = p2.normal;

  const denominator = n0.dot( new THREE.Vector3( ).crossVectors( n1, n2 ) );

  if ( Math.abs( denominator ) < FLT_EPSILON )
    return null;

  term0.crossVectors( n1, n2 ).multiplyScalar( -p0.constant );
  term1.crossVectors( n2, n0 ).multiplyScalar( -p1.constant );
  term2.crossVectors( n0, n1 ).multiplyScalar( -p2.constant );

  return new THREE.Vector3( ).addVectors( term0 , term1 ).add( term2 ).divideScalar( denominator );
}

function isPointInsideBrush( point, planes ) {
  for ( let p_idx = 0; p_idx < planes.length; ++p_idx ) {
    const plane = planes[ p_idx ];

    if ( plane.distanceToPoint( point ) >= -0.001 )
      continue;

    return false;
  }

  return true;
}

let u_vec3 = new THREE.Vector3( );
let v_vec3 = new THREE.Vector3( ); // vivek ramaswamy mentioned ??
const tan010 = new THREE.Vector3( 0, 1, 0 );
const tan100 = new THREE.Vector3( 1, 0, 0 );
function getUVAxis( normal ) {
  let tangent = ( Math.abs( normal.dot( tan010 ) ) > 0.99 ) ? tan100 : tan010;
  u_vec3.crossVectors( normal, tangent ).normalize( );
  v_vec3.crossVectors( normal, u_vec3  ).normalize( );
}

function getFacePolygon( plane, verts ) {
  const tol = 0.001;

  let face_verts = verts.filter( v => Math.abs( plane.distanceToPoint( v ) ) < tol );

  if ( face_verts.length < 3 )
    return null;

  getUVAxis( plane.normal );
  
  let center = new THREE.Vector2( 0, 0 );
  const face_verts_2d = face_verts.map( v => {
    return new THREE.Vector2( v.dot( u_vec3 ), v.dot( v_vec3 ) );
  });

  face_verts_2d.forEach( p => center.add( p ) );
  center.divideScalar( face_verts_2d.length );

  face_verts.sort( ( a, b ) => {
    const pa = new THREE.Vector2( a.dot( u_vec3 ), a.dot( v_vec3 ) ).sub( center );
    const pb = new THREE.Vector2( b.dot( u_vec3 ), b.dot( v_vec3 ) ).sub( center );
    return Math.atan2( pa.y, pa.x ) - Math.atan2( pb.y, pb.x );
  });

  return face_verts;
}

function computeUVForVertex( vertex, line_data, texture ) {
  const angle = THREE.MathUtils.degToRad( line_data.rotation );
  const cos = Math.cos( angle );
  const sin = Math.sin( angle );

  let uv_offset;
  if ( line_data.type === "VALVE" ) {
    u_vec3.set( line_data.u.x, line_data.u.y, line_data.u.z );
    v_vec3.set( line_data.v.x, line_data.v.y, line_data.v.z );
    uv_offset = new THREE.Vector2( line_data.u.w, line_data.v.w );
  } else {
    getUVAxis( line_data.plane.normal );
    uv_offset = line_data.uv_offset;
  }

  const rotated_u = u_vec3.clone( ).multiplyScalar( cos ).add( v_vec3.clone( ).multiplyScalar( -sin ) );
  const rotated_v = u_vec3.clone( ).multiplyScalar( sin ).add( v_vec3.clone( ).multiplyScalar(  cos ) );

  const u = vertex.dot( rotated_u ) * ( 1 / line_data.uv_scale.x ) + uv_offset.x;
  const v = vertex.dot( rotated_v ) * ( 1 / line_data.uv_scale.y ) + uv_offset.y;
  
  return new THREE.Vector2(
    u / texture.image.width,
    v / texture.image.height
  );
}

function createFaceGeometry( verts, face_data, texture ) {
  getUVAxis( face_data.plane.normal );
  
  const verts_2d = verts.map( v => new THREE.Vector2( v.dot( u_vec3 ), v.dot( v_vec3 ) ) );
  const triangles = THREE.ShapeUtils.triangulateShape( verts_2d, [ ] );

  const uvs = [ ];
  const positions = [ ];
  
  for ( let v_idx = 0; v_idx < verts.length; ++v_idx ) {
    const vert = verts[ v_idx ];

    const uv = computeUVForVertex( vert, face_data, texture );

    positions.push( vert.x, vert.y, vert.z );
    uvs.push( uv.x, uv.y );
  }
  
  const indices = [ ];
  for ( let t_idx = 0; t_idx < triangles.length; ++t_idx ) {
    const tri = triangles[ t_idx ];
    
    indices.push( tri[0], tri[1], tri[2] );
  }
  
  const geometry = new THREE.BufferGeometry( );
  geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( positions, 3 ) );
  geometry.setAttribute( 'uv', new THREE.Float32BufferAttribute( uvs, 2 ) );
  geometry.setIndex( indices );

  geometry.computeVertexNormals( );
  return geometry;
}

const quake_palette = getQuakePalette( );
function createTextureFromMip( mip_tex, is_valve_fmt ) {
  const palette = ( is_valve_fmt ) ? mip_tex.palette : quake_palette;
  const { name, width, height, data } = mip_tex;

  const canvas = document.createElement( "canvas" );
  canvas.height = height;
  canvas.width = width;
  canvas.id = name;

  const ctx = canvas.getContext( "2d" );
  const img_data = ctx.createImageData( width, height );

  for ( let idx = 0; idx < data.length; ++idx ) {
    const palette_idx = data[ idx ];

    // fullbright ignores fire/lighting
    let alpha = 255;
    if ( !is_valve_fmt && palette_idx >= 0xE0 )
      alpha = 0;

    const [ r, g, b ] = palette[ palette_idx ];
    const i = idx * 4;

    img_data.data[ i + 0 ] = r;
    img_data.data[ i + 1 ] = g;
    img_data.data[ i + 2 ] = b;
    img_data.data[ i + 3 ] = alpha;
  }

  ctx.putImageData( img_data, 0, 0 );

  const cdiv = document.createElement( "div" );
  cdiv.classList.add( 'texture_showcase' );
  cdiv.innerText = name;
  cdiv.id = name;

  cdiv.appendChild( canvas );
  texture_showcase.appendChild( cdiv );
  
  const texture = new THREE.Texture( canvas );
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  texture.flipY = false;

  return texture;
}

function sortTexturesById( ) {
  if ( !texture_showcase )
    return;

  const elements = Array.from( texture_showcase.children );

  if ( !elements )
    return;

  elements.sort( ( a, b ) => {
    const id_a = a.id.toUpperCase( );
    const id_b = b.id.toUpperCase( );

    if ( id_a < id_b )
      return -1;
    
    if ( id_a > id_b )
      return  1;

    return 0;
  });

  for ( let e_idx = 0; e_idx < elements.length; ++e_idx )
    texture_showcase.appendChild( elements[ e_idx ] );
}

function setCamPos( x, y, z ) {
  cam.rotation.set( 0, HALF_PI, HALF_PI );
  cam.position.set( x, y, z );
}

const origin_regex = /"origin"\s*"(-?\d+)\s+(-?\d+)\s+(-?\d+)"/;
function parseMap( is_valve_fmt, map_data, wad ) {
  const map = new THREE.Group( );

  let unique_textures = new Set( );
  let texture_list = new Map( );

  const blocks = map_data.split( "}" ).join( "" )
                    .split( "{" )
                    .map( b => b.trim( ) )
                    .filter( b => b.length );

  let spawn_found = false;
  for ( let b_idx = 0; b_idx < blocks.length; ++b_idx ) {
    const block = blocks[ b_idx ];
    const face_data = [ ];

    const lines = block.split( "\n" )
                       .map( l => l.trim( ) )
                       .filter( l => l.length );

    for ( let l_idx = 0; l_idx < lines.length; ++l_idx ) {
      const line = lines[ l_idx ];

      if ( !spawn_found && line.startsWith( '"origin"' ) ) {
        const is_spawn = block.includes( "info_player_deathmatch" )
                      || block.includes( "info_player_start" );
        const match = line.match( origin_regex );

        if ( match && is_spawn ) {
          setCamPos(
            parseFloat( match[ 1 ] ),
            parseFloat( match[ 2 ] ),
            parseFloat( match[ 3 ] )
          );
          spawn_found = true;
        }
      }

      if ( !line.startsWith( "(" ) )
        continue;

      let line_data = ( is_valve_fmt )
        ? parseValveMapLine( line )
        : parseQuakeMapLine( line );

      if ( !line_data )
        continue;

      line_data.plane = new THREE.Plane( ).setFromCoplanarPoints( line_data.v0, line_data.v1, line_data.v2 );
      face_data.push( line_data );
    }

    if ( block[ 0 ] !== '(' )
      continue;

    if ( face_data.length < 4 ) {
      console.error( `too few planes ( ${ face_data.length } ) for brush:`, block );
      continue;
    }

    const vertices = [ ];
    const planes = face_data.map( fd => fd.plane );

    for ( let x = 0; x < planes.length; ++x ) {
      for ( let y = x + 1; y < planes.length; ++y ) {
        for ( let z = y + 1; z < planes.length; ++z ) {
          const pt = computeIntersection( planes[ x ], planes[ y ], planes[ z ] );

          if ( !pt )
            continue;

          if ( !isPointInsideBrush( pt, planes ) )
            continue;

          if ( vertices.some( v => v.distanceToSquared( pt ) < FLT_EPSILON ) )
            continue;

          vertices.push( pt );
        }
      }
    }

    if ( !vertices.length ) {
      console.error( "no vertices computed for brush" );
      return;
    }

    const brushes = new THREE.Group( );

    for ( let f_idx = 0; f_idx < face_data.length; ++f_idx ) {
      const fd = face_data[ f_idx ];

      const face_verts = getFacePolygon( fd.plane, vertices );

      if ( !face_verts || face_verts.length < 3 ) {
        console.error( "failed to compute face polygon for face:", fd );
        continue;
      }

      if ( !texture_list.has( fd.texture ) ) {
        if ( unique_textures.has( fd.texture ) )
          texture_list.set( fd.texture, texture_list.get( fd.texture ) );
        else {
          const matching_texture = wad.extractTextureFromName( fd.texture, is_valve_fmt );
  
          if ( !matching_texture ) {
            console.error( `failed to find texture '${ fd.texture }' in WAD dir` );
            continue;
          }
  
          const texture = createTextureFromMip( matching_texture, is_valve_fmt );
          texture_list.set( fd.texture, texture );
          unique_textures.add( fd.texture );
        }
      }

      const texture = texture_list.get( fd.texture );
      const face_geometry = createFaceGeometry( face_verts, fd, texture );
      const face_material = new THREE.MeshBasicMaterial({
        side: THREE.BackSide,
        map: texture
      });

      const face_mesh = new THREE.Mesh( face_geometry, face_material );
      brushes.add( face_mesh );
    }

    map.add( brushes );
  }

  sortTexturesById( );
  scene.add( map );
  return true;
}

function setHudNames( m, w ) {
  if ( !map_name || !wad_name )
    return;

  map_name.innerText = m;
  wad_name.innerText = w;
}

const wad_regex = /^"wad"\s*"([^";]+?\.wad)(?=;|")/;
function extractFirstWadName( map_data ) {
  const lines = map_data.split( "\n" )
                        .map( l => l.trim( ) )
                        .filter( l => l.length );

  for ( let l_idx = 0; l_idx < lines.length; ++l_idx ) {
    const line = lines[ l_idx ];

    if ( !line.startsWith( '"wad"' ) )
      continue;

    const match = line.match( wad_regex );
    
    if ( !match )
      continue;

    return match[ 1 ];
  }

  return null;
}

async function loadDefaultMap( map ) {
  let ret = true;

  try {
    const map_file = await fetch( map );
    const map_data = await map_file.text( );

    const wad_name = extractFirstWadName( map_data );

    if ( !wad_name )
      throw new Error( `failed to find wad in ${ map }` );

    const wad_file = await fetch( wad_name );
    const wad_data = await wad_file.arrayBuffer( );

    if ( loadMap( map_data, wad_data ) ) {
      setHudNames(
        map.split( "/" ).slice( -1 )[ 0 ],
        wad_name.split( "/" ).slice( -1 )[ 0 ]
      );
    }
    else
      ret = false;
  } catch ( err ) {
    console.error( "failed to load default map:", err );
    ret = false;
  }

  hideProgress( );
  return ret;
}

function loadMap( map_data, wad_data ) {
  const valve_map = map_data.includes( "[" ) || map_data.includes( "]" );
  const wad = loadWad( wad_data );
  return parseMap( valve_map, map_data, wad );
}

let cam;
let renderer;
let controls;
const scene = new THREE.Scene( );

async function init( ) {
  if ( !WebGL.isWebGL2Available( ) )
    return false;

  const w = window.innerWidth;
  const h = window.innerHeight;

  renderer = new THREE.WebGLRenderer( );
  document.body.appendChild( renderer.domElement );

  cam = new THREE.PerspectiveCamera( 69, w / h, 0.1, 2000 );
  
  controls = new FlyControls( cam, renderer.domElement );
  
  cam.position.set( 0, 0, 0 );
  renderer.setSize( w, h );
  
  controls.dragToLook = ( w > h );
  controls.movementSpeed = 100;
  controls.rollSpeed = 0.5;

  return await loadDefaultMap( "files/valve/c1a0.map" );
}

function render( ) {
  requestAnimationFrame( render );
  controls.update( UPDATE_TIME );
  renderer.render( scene, cam );
}

function toggleSideCollapsibleSection( e ) {
  const btn = e.target;
  
  texture_showcase.classList.toggle( 'active' );
  btn.classList.toggle( 'active' );
  
  btn.innerText = ( !btn.classList.contains( 'active' ) ) ? '+' : '-';
  btn.style.left = ( !btn.classList.contains( 'active' ) ) ? "8px" : "25%";
}

function toggleBottomCollapsibleSection( e ) {
  const btn = e.target;

  if ( !settings )
    return;
  
  settings.classList.toggle( 'active' );
  btn.classList.toggle( 'active' );
  
  if ( settings.classList.contains( 'active' ) )
    texture_showcase.style.height = "calc( 100% - 132px )";
  else
    texture_showcase.style.height = "100%";

  btn.innerText = ( !btn.classList.contains( 'active' ) ) ? '+' : '-';
  btn.style.bottom = ( !btn.classList.contains( 'active' ) ) ? "8px" : "136px";
}

let prev_map_selection = null;
function selectChangeMap( e ) {
  const selection = e.target.value;

  if ( selection === "File Upload" || selection === prev_map_selection )
    return;

  if ( wireframe_cb && wireframe_cb.checked )
    wireframe_cb.checked = false;

  scene.clear( );
  texture_showcase.innerHTML = "";
  prev_map_selection = e.target.value;
  Promise.resolve( loadDefaultMap( e.target.value ) );
}

function toggleWireframe( e ) {
  scene.traverse( c => {
    if ( c.isMesh && c.material ) {
      c.material.wireframe = !c.material.wireframe;
      c.material.needsUpdate = true;
    }
  });
}

function mapFileChange( e ) {
  const files = e.target.files;

  let map_found = false;
  for ( let f_idx = 0; f_idx < files.length; ++f_idx ) {
    const file = files[ f_idx ];

    if ( file.size === 0 )
      continue;
    
    if ( !file.name.endsWith( ".map" ) )
      continue;

    map_found = true;
    break;
  }

  if ( !map_found )
    throw new Error( "no map found" );

  // set select element w/ id map_picker to option 'File Upload'

  // validate wad in map data
  //  if wad is not uploaded, throw error & wait for wadFileChange
  //  if wad is uploaded, continue
  
  // make sure to set wireframe_cb.checked to false
  
  // copy selectChangeMap here
}

function wadFileChange( e ) {
  const files = e.target.files;

  let wad_found = false;
  for ( let f_idx = 0; f_idx < files.length; ++f_idx ) {
    const file = files[ f_idx ];

    if ( file.size === 0 )
      continue;
    
    if ( !file.name.endsWith( ".wad" ) )
      continue;

    wad_found = true;
    break;
  }

  if ( !wad_found )
    throw new Error( "no wad found" );

  // validate this is the correct wad with map data
  //  if map is not uploaded&matched, throw error & wait for mapFileChange
  //  if map is uploaded, continue
  
  // make sure to set wireframe_cb.checked to false

  // copy selectChangeMap here
}

function hideProgress( ) {
  if ( !progress )
    return;

  progress.style.display = "none";
}

function setProgress( val ) {
  if ( !progress )
    return;

  if ( typeof val !== "number" )
    return;

  progress.style.display = "block";
  progress.value = val;
}

let texture_showcase, settings, wireframe_cb, map_picker, progress, map_name, wad_name;
document.addEventListener( "DOMContentLoaded", ( ) => {
  setProgress( 0 );

  texture_showcase = document.getElementById( 'side_collapsible_section' );
  settings = document.getElementById( 'bottom_collapsible_section' );
  wireframe_cb = document.getElementById( 'wireframe' );
  map_picker = document.getElementById( 'map_picker' );
  progress = document.getElementById( 'progress' );
  map_name = document.getElementById( 'map_name' );
  wad_name = document.getElementById( 'wad_name' );

  document.getElementById( 'bottom_collapsible_btn' ).onclick = toggleBottomCollapsibleSection;
  document.getElementById( 'side_collapsible_btn' ).onclick = toggleSideCollapsibleSection;
  document.getElementById( 'map' ).onchange = mapFileChange;
  document.getElementById( 'wad' ).onchange = wadFileChange;
  
  wireframe_cb.onclick = toggleWireframe;
  map_picker.onchange = selectChangeMap;
});

onkeyup = ( e ) => {
  if ( !wireframe_cb )
    return;

  if ( e.key !== 'x' )
    return;

  wireframe_cb.click( );
};

onkeydown = ( e ) => {
  if ( !map_picker )
    return;

  if ( e.target !== map_picker )
    return;

  e.preventDefault( );
};

onresize = ( ) => {
  const h = window.innerHeight;
  const w = window.innerWidth;
  renderer.setSize( w,  h );
  cam.aspect = w / h;

  cam.updateProjectionMatrix( );
};

if ( await init( ) )
  render( );
else
  document.body.appendChild( WebGL.getWebGL2ErrorMessage( ) );