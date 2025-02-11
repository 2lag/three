import * as THREE from "three";

import WebGL from 'three/addons/capabilities/WebGL.js';

import { FlyControls } from 'three/addons/controls/FlyControls.js';

import { getQuakePalette } from './js/static.js'
import WadParser from './js/WadParser.js';

const UPDATE_TIME = 1 / 60;
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

function parseQuakeMapLine( line ) {
  const regex = /^\(\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s*\)\s*\(\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s*\)\s*\(\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s*\)\s+(\S+)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)/;
  const match = line.match( regex );

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

function parseValveMapLine( line ) {
  const regex = /^\(\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s*\)\s*\(\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s*\)\s*\(\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s*\)\s+(\S+)\s+\[\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+\]\s+\[\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+\]\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)/;
  const match = line.match( regex );

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

function computeIntersection( p0, p1, p2 ) {
  const n0 = p0.normal;
  const n1 = p1.normal;
  const n2 = p2.normal;

  const denominator = n0.dot( new THREE.Vector3( ).crossVectors( n1, n2 ) );

  if ( Math.abs( denominator ) < FLT_EPSILON )
    return null;

  const term0 = new THREE.Vector3( ).crossVectors( n1, n2 ).multiplyScalar( -p0.constant );
  const term1 = new THREE.Vector3( ).crossVectors( n2, n0 ).multiplyScalar( -p1.constant );
  const term2 = new THREE.Vector3( ).crossVectors( n0, n1 ).multiplyScalar( -p2.constant );

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

function getFacePolygon( plane, verts ) {
  const tol = 0.001;

  let face_verts = verts.filter( v => Math.abs( plane.distanceToPoint( v ) ) < tol );

  if ( face_verts.length < 3 )
    return null;

  const normal = plane.normal;
  let tangent = new THREE.Vector3( 0, 1, 0 );

  if ( Math.abs( normal.dot( tangent ) ) > 0.99 )
    tangent.set( 1, 0, 0 );

  const u_axis = new THREE.Vector3( ).crossVectors( normal, tangent ).normalize( );
  const v_axis = new THREE.Vector3( ).crossVectors( normal, u_axis  ).normalize( );
  
  let center = new THREE.Vector2( 0, 0 );
  const face_verts_2d = face_verts.map( v => {
    return new THREE.Vector2( v.dot( u_axis ), v.dot( v_axis ) );
  });

  face_verts_2d.forEach( p => center.add( p ) );
  center.divideScalar( face_verts_2d.length );

  face_verts.sort( ( a, b ) => {
    const pa = new THREE.Vector2( a.dot( u_axis ), a.dot( v_axis ) ).sub( center );
    const pb = new THREE.Vector2( b.dot( u_axis ), b.dot( v_axis ) ).sub( center );
    return Math.atan2( pa.y, pa.x ) - Math.atan2( pb.y, pb.x );
  });

  return face_verts;
}

function computeUVForVertex( vertex, line_data, texture ) {
  const angle = THREE.MathUtils.degToRad( line_data.rotation );
  const cos = Math.cos( angle );
  const sin = Math.sin( angle );

  // vivek ramaswamy mentioned ??
  let u_vec,  v_vec, uv_offset;
  if ( line_data.type === "VALVE" ) {
    u_vec = new THREE.Vector3( line_data.u.x, line_data.u.y, line_data.u.z );
    v_vec = new THREE.Vector3( line_data.v.x, line_data.v.y, line_data.v.z )
    uv_offset = new THREE.Vector2( line_data.u.w, line_data.v.w );
  } else {
    const normal = line_data.plane.normal;
    let tangent = new THREE.Vector3( 0, 1, 0 );
    
    if ( Math.abs( normal.dot( tangent ) ) > 0.99 )
      tangent.set( 1, 0, 0 );

    u_vec = new THREE.Vector3( ).crossVectors( normal, tangent ).normalize( );
    v_vec = new THREE.Vector3( ).crossVectors( normal, u_vec ).normalize( );
    uv_offset = line_data.uv_offset;
  }

  const rotated_u = u_vec.clone( ).multiplyScalar( cos ).add( v_vec.clone( ).multiplyScalar( -sin ) );
  const rotated_v = u_vec.clone( ).multiplyScalar( sin ).add( v_vec.clone( ).multiplyScalar(  cos ) );

  const u = vertex.dot( rotated_u ) * ( 1 / line_data.uv_scale.x ) + uv_offset.x;
  const v = vertex.dot( rotated_v ) * ( 1 / line_data.uv_scale.y ) + uv_offset.y;
  
  return new THREE.Vector2(
    u / texture.image.width,
    v / texture.image.height
  );
}

function createFaceGeometry( verts, face_data, texture ) {
  const normal = face_data.plane.normal;

  // todo: make this a function, it's used more than once
  let tangent = new THREE.Vector3( 0, 1, 0 );

  if ( Math.abs( normal.dot( tangent ) ) > 0.99 )
    tangent.set( 1, 0, 0 );

  const u_axis = new THREE.Vector3( ).crossVectors( normal, tangent ).normalize( );
  const v_axis = new THREE.Vector3( ).crossVectors( normal, u_axis ).normalize( );
  // end func move
  
  const verts_2d = verts.map( v => new THREE.Vector2( v.dot( u_axis ), v.dot( v_axis ) ) );
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

function createTextureFromMip( mip_tex, is_valve_fmt ) {
  const tex_showcase = document.getElementById( 'side_collapsible_section' );
  const palette = ( is_valve_fmt ) ? mip_tex.palette : getQuakePalette( );
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
  tex_showcase.appendChild( cdiv );
  
  const texture = new THREE.Texture( canvas );
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  texture.flipY = false;

  return texture;
}

function sortDomChildrenById( id ) {
  const container = document.getElementById( id );

  if ( !container )
    return;

  const elements = Array.from( container.children );

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
    container.appendChild( elements[ e_idx ] );
}

function parseMap( is_valve_fmt, map_data, wad ) {
  const origin_regex = /"origin"\s*"(-?\d+)\s+(-?\d+)\s+(-?\d+)"/;
  const map = new THREE.Group( );
  let texture_list = new Map( );

  const blocks = map_data.split( "}" ).join( "" )
                    .split( "{" )
                    .map( b => b.trim( ) )
                    .filter( b => b.length );

  let spawn_found = false;
  for ( let b_idx = 0; b_idx < blocks.length; ++b_idx ) {
    const block = blocks[ b_idx ];

    const lines = block.split( "\n" ).map( l => l.trim( ) ).filter( l => l.length );

    const face_data = [ ];
    for ( let l_idx = 0; l_idx < lines.length; ++l_idx ) {
      const line = lines[ l_idx ];

      if ( !spawn_found && line.startsWith( "\"origin\"" ) ) {
        const is_spawn = block.includes( "info_player_deathmatch" )
                      || block.includes( "info_player_start" );
        const match = line.match( origin_regex );

        if ( match && is_spawn ) {
          const origin = new THREE.Vector3(
            parseFloat( match[ 1 ] ),
            parseFloat( match[ 2 ] ),
            parseFloat( match[ 3 ] )
          );

          cam.rotation.set( 0, Math.PI * 0.5, Math.PI * 0.5 );
          cam.position.set( origin.x, origin.y, origin.z );
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

      line_data.plane = new THREE.Plane( ).setFromCoplanarPoints( line_data.v0, line_data.v1, line_data.v2 );;
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

    let unique_textures = new Set( );
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

  sortDomChildrenById( "side_collapsible_section" );

  scene.add( map );
  return true;
}

function setHudNames( m, w ) {
  document.getElementById( 'map_name' ).innerText = m;
  document.getElementById( 'wad_name' ).innerText = w;
}

function extractFirstWadName( map_data ) {
  const wad_regex = /^"wad"\s*"([^";]+?\.wad)(?=;|")/;

  const lines = map_data.split( "\n" )
                        .map( l => l.trim( ) )
                        .filter( l => l.length );

  for ( let l_idx = 0; l_idx < lines.length; ++l_idx ) {
    const line = lines[ l_idx ];

    if ( !line.startsWith( "\"wad\"" ) )
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
    const map_data = await fetch( map ).then( res => res.text( ) );

    const wad_name = extractFirstWadName( map_data );

    if ( !wad_name )
      throw new Error( `failed to find wad in ${ map }` );

    const wad_data = await fetch( wad_name ).then( res => res.arrayBuffer( ) );

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

  if ( parseMap( valve_map, map_data, wad ) )
    return true;
  else
    return false;
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
  const section = document.getElementById( 'side_collapsible_section' );
  const btn = document.getElementById( 'side_collapsible_btn' );
  
  section.classList.toggle( 'active' );
  btn.classList.toggle( 'active' );
  
  btn.innerText = ( !btn.classList.contains( 'active' ) ) ? '+' : '-';
  btn.style.left = ( !btn.classList.contains( 'active' ) ) ? "8px" : "25%";
}

function toggleBottomCollapsibleSection( e ) {
  const side_section = document.getElementById( 'side_collapsible_section' );
  const section = document.getElementById( 'bottom_collapsible_section' );
  const btn = document.getElementById( 'bottom_collapsible_btn' );
  
  section.classList.toggle( 'active' );
  btn.classList.toggle( 'active' );
  
  if ( section.classList.contains( 'active' ) )
    side_section.style.height = "calc( 100% - 132px )";
  else
    side_section.style.height = "100%";

  btn.innerText = ( !btn.classList.contains( 'active' ) ) ? '+' : '-';
  btn.style.bottom = ( !btn.classList.contains( 'active' ) ) ? "8px" : "136px";
}

let prev_map_selection = null;
function selectChangeMap( e ) {
  const tex_showcase = document.getElementById( 'side_collapsible_section' );
  const cb = document.getElementById( 'wireframe' );
  const selection = e.target.value;

  if ( selection === "File Upload" || selection === prev_map_selection )
    return;

  if ( cb.checked )
    cb.checked = false;

  scene.clear( );
  tex_showcase.innerHTML = "";
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
  const tex_showcase = document.getElementById( 'side_collapsible_section' );
  const cb = document.getElementById( 'wireframe' );
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
  
  // copy selectChangeMap here
}

function wadFileChange( e ) {
  const tex_showcase = document.getElementById( 'side_collapsible_section' );
  const cb = document.getElementById( 'wireframe' );
  const files = e.target.files;

  let wad_found = false;
  for ( let f_idx = 0; f_idx < files.length; ++f_idx ) {
    const file = files[ f_idx ];

    if ( file.size === 0 )
      continue;
    
    if ( !file.name.endsWith( ".map" ) )
      continue;

    wad_found = true;
    break;
  }

  if ( !wad_found )
    throw new Error( "no wad found" );

  // validate this is the correct wad with map data
  //  if map is not uploaded&matched, throw error & wait for mapFileChange
  //  if map is uploaded, continue
  
  // copy selectChangeMap here
}

function hideProgress( ) {
  const progress = document.getElementById( 'progress' );

  if ( !progress )
    return;

  progress.style.display = "none";
}

function setProgress( val ) {
  const progress = document.getElementById( 'progress' );

  if ( !progress )
    return;

  if ( typeof val !== "number" )
    return;

  progress.style.display = "block";
  progress.value = val;
}

document.addEventListener( "DOMContentLoaded", ( ) => {
  setProgress( 0 );

  document.getElementById( 'bottom_collapsible_btn' ).onclick = toggleBottomCollapsibleSection;
  document.getElementById( 'side_collapsible_btn' ).onclick = toggleSideCollapsibleSection;
  document.getElementById( 'map_picker' ).onchange = selectChangeMap;
  document.getElementById( 'wireframe' ).onclick = toggleWireframe;
  document.getElementById( 'map' ).onchange = mapFileChange;
  document.getElementById( 'wad' ).onchange = wadFileChange;
});

onkeyup = ( e ) => {
  const cb = document.getElementById( 'wireframe' );

  if ( !cb )
    return;

  if ( e.key !== 'x' )
    return;

  cb.click( );
};

onkeydown = ( e ) => {
  const select = document.getElementById( 'map_picker' );
  
  if ( !select )
    return;

  if ( e.target !== select )
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