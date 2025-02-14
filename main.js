import * as THREE from "three";
import WebGL from 'three/addons/capabilities/WebGL.js';
import { FlyControls } from 'three/addons/controls/FlyControls.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { getQuakePalette } from './js/static.js'
import WadParser from './js/WadParser.js';

const FULLBRIGHT_IDX = 0xE0;
const HALF_PI = Math.PI / 2;
const UPDATE_TIME = 1 / 60;
const FLT_EPSILON = 1e-6;

let dom_texture_showcase,
    dom_map_picker,
    dom_wireframe,
    dom_settings,
    dom_progress,
    dom_map_name,
    dom_wad_name,
    dom_error;

let map_data = "",
    wad_data = "";

function loadWad( ) {
  let parser = new WadParser( wad_data );

  try { parser.parseHeader( ); }
  catch( err ) { setErrorMessage( err.message ); }

  parser.parseDirectory( );
  return parser;
}

function setErrorMessage( msg ) {
  dom_error.style.display = "flex";
  dom_error.innerText = msg;

  setTimeout( ( ) => { dom_error.style.display = "none"; }, 3333 );
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
    u: new THREE.Vector4( Number( match[ 11 ] ), Number( match[ 12 ] ), Number( match[ 13 ] ), Number( match[ 14 ] ) ),
    v: new THREE.Vector4( Number( match[ 15 ] ), Number( match[ 16 ] ), Number( match[ 17 ] ), Number( match[ 18 ] ) ),
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
let v_vec3 = new THREE.Vector3( ); /* vivek ramaswamy mentioned ?? */
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

  for ( let f_idx = 0; f_idx < face_verts_2d.length; ++f_idx )
    center.add( face_verts_2d[ f_idx ] );

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

    let alpha = 255;
    if ( !is_valve_fmt && palette_idx >= FULLBRIGHT_IDX )
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
  dom_texture_showcase.appendChild( cdiv );
  
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
  if ( !dom_texture_showcase )
    return;

  const elements = Array.from( dom_texture_showcase.children );

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
    dom_texture_showcase.appendChild( elements[ e_idx ] );
}

function setCamPos( x, y, z ) {
  cam.rotation.set( 0, HALF_PI, HALF_PI );
  cam.position.set( x, y, z );
}

function computeBrushVertices( planes ) {
  const len = planes.length;
  const verts = [ ];

  for ( let i0 = 0; i0 < len; ++i0 ) {
    for ( let i1 = i0 + 1; i1 < len; ++i1 ) {
      for ( let i2 = i1 + 1; i2 < len; ++i2 ) {
        const pt = computeIntersection( planes[ i0 ], planes[ i1 ], planes[ i2 ] );

        if ( !pt )
          continue;

        if ( !isPointInsideBrush( pt, planes ) )
          continue;

        if ( verts.some( v => v.distanceToSquared( pt ) < FLT_EPSILON ) )
          continue;

        verts.push( pt );
      }
    }
  }

  return verts;
}

const origin_regex = /"origin"\s*"(-?\d+)\s+(-?\d+)\s+(-?\d+)"/;
function parseMap( is_valve_fmt, wad ) {
  let unique_textures = new Set( );
  const map = new THREE.Group( );
  let texture_list = new Map( );
  let spawn_found = false;

  const blocks = map_data.split( "}" ).join( "" )
                    .split( "{" )
                    .map( b => b.trim( ) )
                    .filter( b => b );

  let progress_track = getProgress( );
  const delta_progress = 95 - progress_track;
  const block_delta = delta_progress / blocks.length;
  for ( let b_idx = 0; b_idx < blocks.length; ++b_idx ) {
    progress_track += block_delta;
    setProgress( progress_track );

    const block = blocks[ b_idx ];
    const face_data = [ ];

    const lines = block.split( "\n" )
                       .map( l => l.trim( ) )
                       .filter( l => l );

    for ( let l_idx = 0; l_idx < lines.length; ++l_idx ) {
      const line = lines[ l_idx ];

      if ( !spawn_found && line.startsWith( '"origin"' ) ) {
        if ( !block.includes( "info_player_deathmatch" ) && !block.includes( "info_player_start" ) )
          continue;

        const match = line.match( origin_regex );

        if ( !match )
          continue;

        spawn_found = true;

        setCamPos(
          parseFloat( match[ 1 ] ),
          parseFloat( match[ 2 ] ),
          parseFloat( match[ 3 ] )
        );
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

    const vertices = computeBrushVertices(
      face_data.map( fd => fd.plane )
    );

    if ( !vertices.length ) {
      console.error( "no vertices computed for brush" );
      continue;
    }

    const brushes = new THREE.Group( );
    const geometries = new Map( );

    for ( let f_idx = 0; f_idx < face_data.length; ++f_idx ) {
      const fd = face_data[ f_idx ];

      const face_verts = getFacePolygon( fd.plane, vertices );

      if ( !face_verts || face_verts.length < 3 ) {
        console.error( "failed to compute face polygon for face:", fd );
        continue;
      }

      if ( !texture_list.has( fd.texture ) ) {
        if ( !unique_textures.has( fd.texture ) ) {
          const matching_texture = wad.extractTextureFromName( fd.texture, is_valve_fmt );

          if ( !matching_texture ) {
            console.error( `failed to find texture '${ fd.texture }' in wad dir` );
            continue;
          }

          const texture = createTextureFromMip( matching_texture, is_valve_fmt );
          texture_list.set( fd.texture, texture );
          unique_textures.add( fd.texture );
        }
      }

      const texture = texture_list.get( fd.texture );
      const face_geometry = createFaceGeometry( face_verts, fd, texture );
      
      if ( !geometries.has( fd.texture ) )
        geometries.set( fd.texture, [ ] );
        
      geometries.get( fd.texture ).push( face_geometry );
    }
    
    const keys = Array.from( geometries.keys( ) );
    for ( let g_idx = 0; g_idx < keys.length; ++g_idx ) {
      const tex_name = keys[ g_idx ];
      const geoms = geometries.get( tex_name );
      const merged_geoms = BufferGeometryUtils.mergeGeometries( geoms, true );
      const texture = texture_list.get( tex_name );
      const face_mtl = new THREE.MeshBasicMaterial({
        side: THREE.BackSide,
        map: texture
      });

      const merged_mesh = new THREE.Mesh( merged_geoms, face_mtl );
      brushes.add( merged_mesh );
    }

    map.add( brushes );
  }
  
  sortTexturesById( );
  scene.add( map );
  
  setProgress( 100 );

  return true;
}

function setHudNames( m, w ) {
  if ( !dom_map_name || !dom_wad_name )
    return;

  dom_map_name.innerText = m;
  dom_wad_name.innerText = w;
}

const wad_regex = /^"wad"\s*"([^";]+?\.wad)(?=;|")/;
function extractFirstWadName( ) {
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

    setProgress( 3 );

    map_data = await map_file.text( );

    setProgress( 6 );

    const wad_name = extractFirstWadName( );

    if ( !wad_name )
      throw new Error( `Failed to find WAD in ${ map }` );

    const wad_file = await fetch( wad_name );

    setProgress( 10 );

    wad_data = await wad_file.arrayBuffer( );

    setProgress( 15 );

    if ( loadMap( ) ) {
      setHudNames(
        map.split( "/" ).slice( -1 )[ 0 ],
        wad_name.split( "/" ).slice( -1 )[ 0 ]
      );
    }
    else ret = false;
  } catch ( err ) {
    hideProgress( );
    
    setErrorMessage( "Failed to load default map:", err );
    ret = false;
  }

  return ret;
}

function loadMap( ) {
  const valve_map = map_data.includes( "[" ) || map_data.includes( "]" );
  const wad = loadWad( );

  setProgress( 20 );

  const ret = Promise.resolve( parseMap( valve_map, wad ) );
  hideProgress( );
  return ret;
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

function hideProgress( ) {
  if ( !dom_progress )
    return;

  dom_progress.style.display = "none";
}

function setProgress( val ) {
  if ( !dom_progress )
    return;

  if ( typeof val !== "number" )
    return;

  dom_progress.style.display = "block";
  dom_progress.value = Math.round( val );
}

function getProgress( ) {
  if ( !dom_progress )
    return 0;

  return Number( dom_progress.value );
}

function render( ) {
  requestAnimationFrame( render );
  controls.update( UPDATE_TIME );
  renderer.render( scene, cam );
}

//#region Event Handlers
let prev_map_selection = null;

function toggleBottomCollapsibleSection( e ) {
  const btn = e.target;

  if ( !dom_settings )
    return;
  
  dom_settings.classList.toggle( 'active' );
  btn.classList.toggle( 'active' );
  
  if ( dom_settings.classList.contains( 'active' ) )
    dom_texture_showcase.style.height = "calc( 100% - 132px )";
  else
    dom_texture_showcase.style.height = "100%";

  btn.innerText = ( !btn.classList.contains( 'active' ) ) ? '+' : '-';
  btn.style.bottom = ( !btn.classList.contains( 'active' ) ) ? "8px" : "136px";
}

function toggleSideCollapsibleSection( e ) {
  const btn = e.target;
  
  dom_texture_showcase.classList.toggle( 'active' );
  btn.classList.toggle( 'active' );
  
  btn.innerText = ( !btn.classList.contains( 'active' ) ) ? '+' : '-';
  btn.style.left = ( !btn.classList.contains( 'active' ) ) ? "8px" : "25%";
}

async function mapFileChange( e ) {
  const files = e.target.files;

  setProgress( 0 );

  let file;
  let map_found = false;
  for ( let f_idx = 0; f_idx < files.length; ++f_idx ) {
    const f = files[ f_idx ];

    if ( f.size === 0 )
      continue;
    
    if ( !f.name.endsWith( ".map" ) )
      continue;

    map_found = true;
    file = f;
    break;
  }

  setProgress( 1 );

  try {
    if ( !map_found )
      throw new Error( "No map found" );
    
    setProgress( 2 );

    map_data = await file.text( );
    let wad_name = extractFirstWadName( );

    setProgress( 5 );
  
    if ( !wad_name || !wad_name.endsWith( '.wad' ) )
      throw new Error( `WAD name not found in ${ file.name }` );
  
    const cur_wad = dom_wad_name.innerText;
    wad_name = wad_name.split( "/" ).slice( -1 )[ 0 ];
  
    if ( cur_wad !== wad_name )
      throw new Error( `Please upload the WAD first ☺️\nCurrent WAD is ${ cur_wad }` );
  } catch ( err ) {
    hideProgress( );

    setErrorMessage( err.message );
    return;
  }

  prev_map_selection = dom_map_picker.options[ dom_map_picker.selectedIndex ].text;
  dom_map_picker.selectedIndex = dom_map_picker.length - 1;
  
  if ( dom_wireframe.checked )
    dom_wireframe.checked = false;

  setProgress( 10 );

  scene.clear( );
  dom_map_name.innerText = file.name;
  dom_texture_showcase.innerHTML = "";
  loadMap( );
}

async function wadFileChange( e ) {
  const files = e.target.files;

  let file;
  let wad_found = false;
  for ( let f_idx = 0; f_idx < files.length; ++f_idx ) {
    const f = files[ f_idx ];

    if ( f.size === 0 )
      continue;
    
    if ( !f.name.endsWith( ".wad" ) )
      continue;

    wad_found = true;
    file = f;
    break;
  }

  if ( !wad_found ) {
    setErrorMessage( "No WAD found" );
    return;
  }

  dom_wad_name.innerText = file.name;
  wad_data = await file.arrayBuffer( );
}

function selectChangeMap( e ) {
  const selection = e.target.value;

  if ( selection === "File Upload" || selection === prev_map_selection )
    return;

  if ( dom_wireframe && dom_wireframe.checked )
    dom_wireframe.checked = false;

  scene.clear( );
  dom_texture_showcase.innerHTML = "";
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
//#endregion

//#region Events
document.addEventListener( "DOMContentLoaded", async ( ) => {
  dom_progress = document.getElementById( 'progress' );
  setProgress( 0 );

  dom_texture_showcase = document.getElementById( 'side_collapsible_section' );
  dom_settings = document.getElementById( 'bottom_collapsible_section' );
  dom_map_picker = document.getElementById( 'map_picker' );
  dom_wireframe = document.getElementById( 'wireframe' );
  dom_map_name = document.getElementById( 'map_name' );
  dom_wad_name = document.getElementById( 'wad_name' );
  dom_error = document.getElementById( 'error' );

  document.getElementById( 'bottom_collapsible_btn' ).onclick = toggleBottomCollapsibleSection;
  document.getElementById( 'side_collapsible_btn' ).onclick = toggleSideCollapsibleSection;
  document.getElementById( 'map' ).onchange = mapFileChange;
  document.getElementById( 'wad' ).onchange = wadFileChange;
  
  dom_map_picker.onchange = selectChangeMap;
  dom_wireframe.onclick = toggleWireframe;

  if ( await init( ) )
    render( );
  else
    document.body.appendChild( WebGL.getWebGL2ErrorMessage( ) );
});

onkeyup = ( e ) => {
  if ( !dom_wireframe )
    return;

  if ( e.key !== 'x' )
    return;

  dom_wireframe.click( );
};

onkeydown = ( e ) => {
  if ( !dom_map_picker )
    return;

  if ( e.target !== dom_map_picker )
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
//#endregion
