import * as THREE from "three";
import WebGL from 'three/addons/capabilities/WebGL.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { getQuakePalette } from './js/static.js'
import WadParser from './js/WadParser.js';
import { CamCtl } from "./js/CamCtl.js";
import {
  setProgress, getProgress, updateProgress, hideProgress,
  setErrorMessage,
  sortTexturesById,
  setHudNames, getWadName, setWadName, setMapName,
  appendTexture, clearTextures,
  setTextureShowcaseHeight, toggleTextureShowcase,
  toggleSettings, isSettingsActive
} from './js/DOMUtil.js';

const valve_line_regex = /^\(\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s*\)\s*\(\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s*\)\s*\(\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s*\)\s+(\S+)\s+\[\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+\]\s+\[\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+\]\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)/;
const quake_line_regex = /^\(\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s*\)\s*\(\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s*\)\s*\(\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s*\)\s+(\S+)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)/;
const origin_regex = /"origin"\s*"(-?\d+)\s+(-?\d+)\s+(-?\d+)"/;
const wad_regex = /^"wad"\s*"([^";]+?\.wad)(?=;|")/;

const quake_palette = getQuakePalette( );

const HALF_PI = Math.PI * 0.5;
const UPDATE_TIME = 1 / 20;
const PROGRESS_STEPS = 27;
const FLT_EPSILON = 1e-6;

let dom_map_picker, dom_wireframe;
let map_data = "", wad_data = "";

const ci_term0 = new THREE.Vector3( );
const ci_term1 = new THREE.Vector3( );
const ci_term2 = new THREE.Vector3( );
const u_vec3 = new THREE.Vector3( );
const v_vec3 = new THREE.Vector3( );
/* vivek ramaswamy mentioned ?? */
const scene = new THREE.Scene( );
const v0 = new THREE.Vector3( );
const v1 = new THREE.Vector3( );
const v2 = new THREE.Vector3( );
const uv = new THREE.Vector3( );
let controls, renderer, cam;

function loadWad( ) {
  const parser = new WadParser( wad_data );

  try { parser.parseHeader( ); }
  catch( err ) { setErrorMessage( err.message ); }

  parser.parseDirectory( );
  return parser;
}

function parseQuakeMapLine( line ) {
  const match = line.match( quake_line_regex );

  if ( !match ) return null;

  return {
    type: "QUAKE",
    v0: v0.set( Number( match[ 1 ] ), Number( match[ 2 ] ), Number( match[ 3 ] ) ),
    v1: v1.set( Number( match[ 4 ] ), Number( match[ 5 ] ), Number( match[ 6 ] ) ),
    v2: v2.set( Number( match[ 7 ] ), Number( match[ 8 ] ), Number( match[ 9 ] ) ),
    texture: match[ 10 ],
    uv_offset: new THREE.Vector2( Number( match[ 11 ] ), Number( match[ 12 ] ) ),
    rotation: Number( match[ 13 ] ),
    uv_scale: new THREE.Vector2( Number( match[ 14 ] ), Number( match[ 15 ] ) )
  };
}

function parseValveMapLine( line ) {
  const match = line.match( valve_line_regex );

  if ( !match ) return null;

  return {
    type: "VALVE",
    v0: v0.set( Number( match[ 1 ] ), Number( match[ 2 ] ), Number( match[ 3 ] ) ),
    v1: v1.set( Number( match[ 4 ] ), Number( match[ 5 ] ), Number( match[ 6 ] ) ),
    v2: v2.set( Number( match[ 7 ] ), Number( match[ 8 ] ), Number( match[ 9 ] ) ),
    texture: match[ 10 ],
    u: new THREE.Vector4( Number( match[ 11 ] ), Number( match[ 12 ] ), Number( match[ 13 ] ), Number( match[ 14 ] ) ),
    v: new THREE.Vector4( Number( match[ 15 ] ), Number( match[ 16 ] ), Number( match[ 17 ] ), Number( match[ 18 ] ) ),
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

  ci_term0.crossVectors( n1, n2 ).multiplyScalar( -p0.constant );
  ci_term1.crossVectors( n2, n0 ).multiplyScalar( -p1.constant );
  ci_term2.crossVectors( n0, n1 ).multiplyScalar( -p2.constant );

  return new THREE.Vector3( ).add( ci_term0 ).add( ci_term1 ).add( ci_term2 ).divideScalar( denominator );
}

function isPointInsideBrush( point, planes ) {
  for ( let p_idx = 0; p_idx < planes.length; ++p_idx ) {
    const d = planes[ p_idx ].distanceToPoint( point );

    if ( d >= 0.0001 )
      return false;
  }

  return true;
}

const TAN_001 = new THREE.Vector3( 0, 0, 1 );
const TAN_010 = new THREE.Vector3( 0, 1, 0 );
function getUVAxis( normal ) {
  const tangent = Math.abs( normal.dot( TAN_001 ) ) > 0.99 ? TAN_010 : TAN_001;
  u_vec3.crossVectors( normal, tangent ).normalize( );
  v_vec3.crossVectors( normal, u_vec3  ).normalize( );
}

/*
In the original Quake engine, materials are projected onto brush faces along the axes of the coordinate system. In practice, the engine (the compiler, to be precise), uses the normal of a brush face to determine the projection axis - the chose axis is the one that has the smallest angle with the face’s normal. Then, the material is projected onto the brush face along that axis. This leads to some distortion (shearing) that is particularly apparent for slanted brush faces where the face’s normal is linearly dependent on all three coordinate system axes. However, this type of projection, which we call paraxial projection in TrenchBroom, also has an advantage: If the face’s normal is linearly dependent on only two or less coordinate system axes (that is, it lies in the plane defined by two of the axes, e.g., the XY plane), then the paraxial projection ensures that the material still fits the brush faces without having to change the scaling factors.
The main disadvantage of paraxial projection is that it is impossible to do perfect alignment locking. Alignment locking means that the material remains perfectly in place on the brush faces during all transformations of the face. For example, if the brush moves by 16 units along the X axis, then the materials on all faces of the brush do not move relatively to the brush. With paraxial projection, materials may become distorted due to the face normals changing by the transformation, but it is impossible to compensate for that shearing.
This is (probably) one of the reasons why the Valve 220 map format was introduced for Half Life. This map format extends the brush faces with additional information about the UV axes for each brush faces. In principle, this makes it possible to have arbitrary linear transformations for the UV coordinates due to their projection, but in practice, most editors keep the UV axes perpendicular to the face normals. In that case, the material is projected onto the face along the normal of the face (and not a coordinate system axis). In TrenchBroom, this mode of projection is called parallel projection, and it is only available in maps that have the Valve 220 map format.
*/
function computeUVForVertex( vertex, line_data, texture ) {
  let uv_offset;

  if ( line_data.type === "VALVE" ) {
    uv_offset = new THREE.Vector2( line_data.u.w, line_data.v.w );
    u_vec3.set( line_data.u.x, line_data.u.y, line_data.u.z );
    v_vec3.set( line_data.v.x, line_data.v.y, line_data.v.z );
  } else {
    getUVAxis( line_data.plane.normal );
    uv_offset = line_data.uv_offset;
    u_vec3.negate( );

    const rotation = THREE.MathUtils.degToRad( line_data.rotation );
    const cos = Math.cos( rotation );
    const sin = Math.sin( rotation );

    u_vec3.copy( u_vec3.clone( ).multiplyScalar( cos ).sub( v_vec3.clone( ).multiplyScalar( sin ) ) );
    v_vec3.copy( u_vec3.clone( ).multiplyScalar( sin ).add( v_vec3.clone( ).multiplyScalar( cos ) ) );
  }
  
  uv.set(
    vertex.dot( u_vec3 ) / line_data.uv_scale.x + uv_offset.x,
    vertex.dot( v_vec3 ) / line_data.uv_scale.y + uv_offset.y
  );
  
  uv.set(
    uv.x / texture.image.width,
    uv.y / texture.image.height
  );
}

function createFaceGeometry( verts, face_data, texture ) {
  const positions = [ ];
  const indices = [ ];
  const uvs = [ ];

  getUVAxis( face_data.plane.normal );

  const verts_2d = verts.map( v => new THREE.Vector2( v.dot( u_vec3 ), v.dot( v_vec3 ) ) );
  const triangles = THREE.ShapeUtils.triangulateShape( verts_2d, [ ] );

  for ( let v_idx = 0; v_idx < verts.length; ++v_idx ) {
    const vert = verts[ v_idx ];

    computeUVForVertex( vert, face_data, texture );
    positions.push( vert.x, vert.y, vert.z );
    uvs.push( uv.x, uv.y );
  }
  
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

function getFacePolygon( fd, verts ) {
  const plane = fd.plane;
  const tol = 0.001;

  let face_verts = verts.filter( v => Math.abs( plane.distanceToPoint( v ) ) < tol );

  if ( face_verts.length < 3 )
    return null;

  getUVAxis( plane.normal );
  
  let center = new THREE.Vector2( 0, 0 );
  const face_verts_2d = face_verts.map( v => new THREE.Vector2( v.dot( u_vec3 ), v.dot( v_vec3 ) ) );

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

function createTextureFromMip( mip_tex, is_valve_fmt ) {
  const palette = is_valve_fmt ? mip_tex.palette : quake_palette;
  const { name, width, height, data } = mip_tex;

  const canvas = document.createElement( "canvas" );
  canvas.height = height;
  canvas.width = width;
  canvas.id = name;

  const ctx = canvas.getContext( "2d" );
  const img_data = ctx.createImageData( width, height );

  let balpha = false;
  for ( let idx = 0; idx < data.length; ++idx ) {
    const palette_idx = data[ idx ];
    const [ r, g, b ] = palette[ palette_idx ];
    const i = idx * 4;

    let alpha = 255;
    if ( name.startsWith( "glass" ) ) {
      balpha = true;
      alpha = 128;
    }

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
  appendTexture( cdiv );

  const texture = new THREE.Texture( canvas );
  texture.minFilter = texture.magFilter = THREE.NearestFilter;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.premultiplyAlpha = balpha;
  texture.needsUpdate = true;
  texture.flipY = false;
  texture.name = name;

  return texture;
}

function computeBrushVertices( planes ) {
  const verts = [ ];
  const len = planes.length;
  for ( let i0 = 0; i0 < len; ++i0 ) {
    for ( let i1 = i0 + 1; i1 < len; ++i1 ) {
      for ( let i2 = i1 + 1; i2 < len; ++i2 ) {
        const pt = computeIntersection( planes[ i0 ], planes[ i1 ], planes[ i2 ] );

        if ( !pt ) continue;
        if ( !isPointInsideBrush( pt, planes ) ) continue;
        if ( verts.some( v => v.distanceToSquared( pt ) < FLT_EPSILON ) ) continue;

        verts.push( pt );
      }
    }
  }
  return verts;
}

function splitMapBrushBlocks( ) {
  return map_data.split( "}" ).join( "" )
                 .split( "{" )
                 .map( b => b.trim( ) )
                 .filter( b => b )
                 .filter( b => b.includes( '(' ) || b.includes( 'info_player_' ) );
}

function splitMapLines( block ) {
  return block.split( "\n" ).map( l => l.trim( ) ).filter( l => l );
}

function getSpawn( block, line ) {
  if ( !block.includes( "info_player_" ) )
    return false;

  const match = line.match( origin_regex );

  if ( !match ) return false;
  
  cam.rotation.set( 0, HALF_PI, HALF_PI );
  cam.position.set(
    parseFloat( match[ 1 ] ),
    parseFloat( match[ 2 ] ),
    parseFloat( match[ 3 ] )
  );

  return true;
}

function updateTextureList( fd, textures, unique_textures, wad, is_valve_fmt ) {
  if ( !textures.has( fd.texture ) ) {
    if ( !unique_textures.has( fd.texture ) ) {
      const matching_texture = wad.getTextureFromName( fd.texture, is_valve_fmt );
      if ( !matching_texture ) {
        console.error( `failed to find texture '${ fd.texture }' in wad dir` );
        return false;
      }

      const texture = createTextureFromMip( matching_texture, is_valve_fmt );
      textures.set( fd.texture, texture );
      unique_textures.add( fd.texture );
    }
  }
  return true;
}

function processFaces( face_data, vertices, wad, is_valve_fmt, textures, unique_textures, geometries ) {
  for ( let f_idx = 0; f_idx < face_data.length; ++f_idx ) {
    const fd = face_data[ f_idx ];

    const face_verts = getFacePolygon( fd, vertices );

    if ( !face_verts || face_verts.length < 3 ) {
      console.error( "failed to compute face polygon for face:", fd );
      continue;
    }

    const updated = updateTextureList( fd, textures, unique_textures, wad, is_valve_fmt );
    if ( !updated )
      continue;

    const texture = textures.get( fd.texture );
    const face_geometry = createFaceGeometry( face_verts, fd, texture );
    
    if ( !geometries.has( fd.texture ) )
      geometries.set( fd.texture, [ ] );
      
    geometries.get( fd.texture ).push( face_geometry );
  }
}

function processBlock( block, wad, is_valve_fmt, textures, unique_textures, geometries, spawn_found ) {
  const lines = splitMapLines( block );
  let new_spawn_found = false;
  const face_data = [ ];

  for ( let l_idx = 0; l_idx < lines.length; ++l_idx ) {
    const line = lines[ l_idx ];

    if ( !spawn_found && line.startsWith( '"origin"' ) ) {
      new_spawn_found = getSpawn( block, line );
      break;
    }

    if ( !line.startsWith( "(" ) )
      continue;

    const data = ( is_valve_fmt )
      ? parseValveMapLine( line )
      : parseQuakeMapLine( line );

    if ( !data )
      continue;

    data.plane = new THREE.Plane( ).setFromCoplanarPoints( data.v0, data.v2, data.v1 );
    face_data.push( data );
  }

  if ( block[ 0 ] !== '(' )
    return new_spawn_found;

  if ( face_data.length < 4 ) {
    console.error( `too few planes ( ${ face_data.length } ) for brush:`, block );
    return new_spawn_found;
  }

  const vertices = computeBrushVertices( face_data.map( fd => fd.plane ) );
  if ( !vertices.length ) {
    console.error( "no vertices computed for brush" );
    return new_spawn_found;
  }

  processFaces( face_data, vertices, wad, is_valve_fmt, textures, unique_textures, geometries );
  return new_spawn_found;
}

function getMergedBrushes( textures, geometries ) {
  const brushes = new THREE.Group( );
  const keys = Array.from( geometries.keys( ) );
  for ( let g_idx = 0; g_idx < keys.length; ++g_idx ) {
    const tex_name = keys[ g_idx ];
    const geoms = geometries.get( tex_name );
    const merged_geoms = BufferGeometryUtils.mergeGeometries( geoms, true );
    const texture = textures.get( tex_name );
    const face_mtl = new THREE.MeshBasicMaterial({
      transparent: texture.premultiplyAlpha,
      side: THREE.FrontSide,
      map: texture
    });

    const merged_mesh = new THREE.Mesh( merged_geoms, face_mtl );
    brushes.add( merged_mesh );
  }
  return brushes;
}

async function parseMap( wad, is_valve_fmt ) {
  setProgress( 0 );

  const blocks = splitMapBrushBlocks( );
  const unique_textures = new Set( );
  const geometries = new Map( );
  const textures = new Map( );
  let spawn_found = false;
  
  let updates = 0;
  let progress_track = getProgress( );
  const delta_progress = 95 - progress_track;
  const update_interval = Math.ceil( blocks.length / PROGRESS_STEPS );
  const block_delta = delta_progress / update_interval;
  
  for ( let b_idx = 0; b_idx < blocks.length; ++b_idx ) {
    if ( !( b_idx % update_interval ) && updates < PROGRESS_STEPS ) {
      progress_track += block_delta;
      await updateProgress( progress_track );
      ++updates;
    }

    const new_spawn_found = processBlock(
      blocks[ b_idx ],
      wad, is_valve_fmt,
      textures, unique_textures,
      geometries, spawn_found
    );

    if ( new_spawn_found && !spawn_found )
      spawn_found = true;
  }

  const brushes = getMergedBrushes( textures, geometries );
  const map = new THREE.Group( ).add( brushes );
  
  sortTexturesById( );
  setProgress( 100 );
  scene.add( map );
  return true;
}

function extractFirstWadName( ) {
  const lines = map_data.split( "\n" ).map( l => l.trim( ) ).filter( l => l.length );

  for ( let l_idx = 0; l_idx < lines.length; ++l_idx ) {
    const line = lines[ l_idx ];

    if ( !line.startsWith( '"wad"' ) )
      continue;

    const match = line.match( wad_regex );
    
    if ( match )
      return match[ 1 ];
  }
  return null;
}

async function loadMap( ) {
  const is_valve_fmt = map_data.includes( "[" ) || map_data.includes( "]" );
  const wad = loadWad( );
  return await parseMap( wad, is_valve_fmt );
}

async function loadDefaultMap( map ) {
  try {
    const map_file = await fetch( map );
    map_data = await map_file.text( );

    const wad_name = extractFirstWadName( );
    if ( !wad_name )
      throw new Error( `Failed to find WAD in ${ map }` );

    const wad_file = await fetch( wad_name );
    wad_data = await wad_file.arrayBuffer( );

    const loaded = await loadMap( );

    if ( loaded ) {
      setHudNames(
        map.split( "/" ).slice( -1 )[ 0 ],
        wad_name.split( "/" ).slice( -1 )[ 0 ]
      );
    }
    
    return loaded;
  } catch ( err ) {
    hideProgress( );
    setErrorMessage( "Failed to load default map:", err );
    return false;
  }
}

async function init( ) {
  if ( !WebGL.isWebGL2Available( ) )
    return false;

  const w = window.innerWidth;
  const h = window.innerHeight;

  renderer = new THREE.WebGLRenderer( );
  document.body.appendChild( renderer.domElement );

  cam = new THREE.PerspectiveCamera( 69, w / h, 0.1, 2000 );
  
  controls = new CamCtl( cam, renderer.domElement );
  
  cam.position.set( 0, 0, 0 );
  renderer.setSize( w, h );

  return await loadDefaultMap( "files/valve/c1a0.map" );
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

  toggleSettings( );
  btn.classList.toggle( 'active' );
  
  if ( isSettingsActive( ) )
    setTextureShowcaseHeight( "calc( 100% - 128px )" );
  else
    setTextureShowcaseHeight( "100%" );

  btn.innerText = btn.classList.contains( 'active' ) ? '-' : '+';
  btn.style.bottom = btn.classList.contains( 'active' ) ? "136px" : "8px";
}

function toggleSideCollapsibleSection( e ) {
  const btn = e.target;
  
  toggleTextureShowcase( );
  btn.classList.toggle( 'active' );
  
  btn.innerText = btn.classList.contains( 'active' ) ? '-' : '+';
  btn.style.left = btn.classList.contains( 'active' ) ? "25%" : "8px" ;
}

async function mapFileChange( e ) {
  const files = e.target.files;
  
  let file, map_found = false;
  for ( let idx = 0; idx < files.length; ++idx ) {
    const f = files[ idx ];
    if ( !f.size ) continue;
    if ( !f.name.endsWith( ".map" ) ) continue;
    map_found = true;
    file = f;
    break;
  }

  try {
    if ( !map_found )
      throw new Error( "No map found" );

    map_data = await file.text( );
    const wad_name = extractFirstWadName( );

    if ( !wad_name || !wad_name.endsWith( '.wad' ) )
      throw new Error( `WAD name not found in ${ file.name }` );
  
    wad_name = wad_name.split( "/" ).slice( -1 )[ 0 ];
    const cur_wad = getWadName( );
    
    if ( cur_wad !== wad_name )
      throw new Error( `Please upload the WAD first ☺️ !\nCurrent WAD is ${ cur_wad }, not ${ wad_name }.` );
  } catch ( err ) {
    hideProgress( );
    setErrorMessage( err.message );
    return;
  }

  prev_map_selection = dom_map_picker.options[ dom_map_picker.selectedIndex ].text;
  dom_map_picker.selectedIndex = dom_map_picker.length - 1;
  
  scene.clear( );
  clearTextures( );
  setWireframeOff( );
  setMapName( file.name );
  
  await loadMap( );
}

async function wadFileChange( e ) {
  const files = e.target.files;

  let file, wad_found = false;
  for ( let f_idx = 0; f_idx < files.length; ++f_idx ) {
    const f = files[ f_idx ];

    if ( !f.size )
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

  setWadName( file.name );
  wad_data = await file.arrayBuffer( );
}

async function selectChangeMap( e ) {
  const selection = e.target.value;

  if ( selection === "File Upload" || selection === prev_map_selection )
    return;

  scene.clear( );
  clearTextures( );
  setWireframeOff( );
  prev_map_selection = e.target.value;
  await loadDefaultMap( e.target.value );
}

function toggleWireframe( e ) {
  scene.traverse( c => {
    if ( c.isMesh && c.material ) {
      c.material.wireframe = !c.material.wireframe;
      c.material.needsUpdate = true;
    }
  });
}

function clickWireframe( ) {
  if ( dom_wireframe )
    dom_wireframe.click( );
}

function setWireframeOff( ) {
  if ( dom_wireframe )
    dom_wireframe.checked = false;
}
//#endregion

//#region Events
document.addEventListener( "DOMContentLoaded", async ( ) => {
  dom_map_picker = document.getElementById( 'map_picker' );
  dom_wireframe = document.getElementById( 'wireframe' );

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
  if ( e.key === 'x' )
    clickWireframe( );
};

onkeydown = ( e ) => {
  if ( dom_map_picker && e.target === dom_map_picker )
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
