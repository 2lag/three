import * as THREE from "three";

import WebGL from 'three/addons/capabilities/WebGL.js';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

class WadParser {
  constructor( array_buffer ) {
    this.data = new DataView( array_buffer );
    this.directory = [ ];
    this.header = { };
    this.offset = 0;
  }

  readString( length ) {
    let chars = [ ];

    for ( let idx = 0; idx < length; ++idx )
      chars.push( this.data.getUint8( this.offset++ ) );

    return String.fromCharCode( ...chars ).replace( /\0.*$/, '' );
  }

  readInt32( ) {
    if ( this.offset >= this.data.byteLength )
      throw new Error( `WAD OOB [ ${ this.offset } / ${ this.data.byteLength } ]` );

    let value = this.data.getInt32( this.offset, true );
    this.offset += 4;
    return value;
  }

  parseHeader( ) {
    this.offset = 0;
    this.header.magic = this.readString( 4 );

    if ( this.header.magic !== "WAD3" && this.header.magic !== "WAD2" )
      throw new Error( `invalid WAD file: ${ this.header.magic }` );

    this.header.num_dirs = this.readInt32( );
    this.header.dir_offset = this.readInt32( );
  }

  parseDirectory( ) {
    this.offset = this.header.dir_offset;

    for ( let idx = 0; idx < this.header.num_dirs; ++idx ) {
      let entry = {
        offset: this.readInt32( ),
        disk_size: this.readInt32( ),
        size: this.readInt32( ),
        type: this.data.getUint8( this.offset++ ),
        compressed: this.data.getUint8( this.offset++ ),
        padding: this.data.getUint16( this.offset, true )
      };

      this.offset += 2;
      entry.name = this.readString( 16 );

      this.directory.push( entry );
    }
  }

  extractMipTexture( entry ) {
    this.offset = entry.offset;

    const base = this.offset;
    const name = this.readString( 16 );
    const width = this.readInt32( );
    const height = this.readInt32( );
    const offset = this.readInt32( );
    
    // only using the highest resolution mipmap
    this.offset = entry.offset + offset;
    let size = width * height;

    let data = new Uint8Array( size );
    for ( let d_idx = 0; d_idx < size; ++d_idx )
      data[ d_idx ] = this.data.getUint8( this.offset++ );

    const palette = extractPalette( this.data, base, width, height );

    return { name, width, height, data, palette };
  }

  extractTextureFromName( name ) {
    let dir_entry = null;
    
    for ( const d of this.directory ) {
      if ( d.name === name )
        dir_entry = d;
    }
    
    if ( !dir_entry )
      return null;

    if ( dir_entry.type !== 0x43 ) {
      console.error( `non miptexture: ${ dir_entry.name }` );
      return null;
    }
    
    return this.extractMipTexture( dir_entry );
  }
}

function loadWad( wad_data ) {
  let parser = new WadParser( wad_data );
  parser.parseHeader( );
  parser.parseDirectory( );
  return parser;
}

function extractPalette( data_view, base_offset, w, h ) {
  const header_sz = 40;
  const mip0_sz = w * h;
  const mip1_sz = ( w >> 1 ) * ( h >> 1 );
  const mip2_sz = ( w >> 2 ) * ( h >> 2 );
  const mip3_sz = ( w >> 3 ) * ( h >> 3 );

  let palette_offset = base_offset +
                       header_sz +
                       mip0_sz + mip1_sz +
                       mip2_sz + mip3_sz + 2; // 2 dummy bytes

  const palette = new Array( 256 );

  for ( let idx = 0; idx < 256; ++idx ) {
    const r = data_view.getUint8( palette_offset++ );
    const g = data_view.getUint8( palette_offset++ );
    const b = data_view.getUint8( palette_offset++ );

    palette[ idx ] = [ r, g, b ];
  }

  return palette;
}

function createTextureFromMip( mip_tex ) {
  const { name, width, height, data, palette } = mip_tex;
  const canvas = document.createElement( "canvas" );
  canvas.height = height;
  canvas.width = width;
  canvas.id = name;

  const ctx = canvas.getContext( "2d" );
  const img_data = ctx.createImageData( width, height );

  for ( let idx = 0; idx < data.length; ++idx ) {
    const palette_idx = data[ idx ];

    const [ r, g, b ] = palette[ palette_idx ];
    const i = idx * 4;

    img_data.data[ i + 0 ] = r;   // R
    img_data.data[ i + 1 ] = g;   // G
    img_data.data[ i + 2 ] = b;   // B
    img_data.data[ i + 3 ] = 255; // A
  }

  ctx.putImageData( img_data, 0, 0 );

  document.getElementById( 'collapsible_section' ).appendChild( canvas );

  // https://threejs.org/docs/#api/en/textures/Texture
  const texture = new THREE.Texture( canvas );
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set( 0.01, 0.01 );
  texture.needsUpdate = true;
  return texture;
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

  if ( Math.abs( denominator ) < 1e-6 )
    return null;

  const term0 = new THREE.Vector3( ).crossVectors( n1, n2 ).multiplyScalar( -p0.constant );
  const term1 = new THREE.Vector3( ).crossVectors( n2, n0 ).multiplyScalar( -p1.constant );
  const term2 = new THREE.Vector3( ).crossVectors( n0, n1 ).multiplyScalar( -p2.constant );

  return new THREE.Vector3( ).addVectors( term0 , term1 ).add( term2 ).divideScalar( denominator );
}

function isPointInsideBrush( point, planes ) {
  for ( const plane of planes ) {
    if ( plane.distanceToPoint( point ) < -0.001 ) {
      return false;
    }
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

function computeUVForVertex( vertex, lineData ) {
  const isValve = lineData.type === "VALVE";
  const plane = lineData.plane;

  if (isValve && lineData.u && lineData.v) {
    const s = vertex.dot(new THREE.Vector3(lineData.u.x, lineData.u.y, lineData.u.z)) + lineData.u.w;
    const t = vertex.dot(new THREE.Vector3(lineData.v.x, lineData.v.y, lineData.v.z)) + lineData.v.w;
    return new THREE.Vector2(s, t);
  } else {
    // Build a local coordinate system from the plane.
    const normal = plane.normal;
    let tangent = new THREE.Vector3(0, 1, 0);
    if (Math.abs(normal.dot(tangent)) > 0.99) tangent.set(1, 0, 0);
    const uAxis = new THREE.Vector3().crossVectors(normal, tangent).normalize();
    const vAxis = new THREE.Vector3().crossVectors(normal, uAxis).normalize();

    // Apply rotation (convert degrees to radians).
    const angle = lineData.rotation * Math.PI / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const rotatedU = uAxis.clone().multiplyScalar(cos).add(vAxis.clone().multiplyScalar(-sin));
    const rotatedV = uAxis.clone().multiplyScalar(sin).add(vAxis.clone().multiplyScalar(cos));

    // Introduce a scale multiplier to enlarge the texture mapping.
    const scaleMultiplier = 4.0; // Experiment with this value.
    const s = vertex.dot(rotatedU) * lineData.uv_scale.x * scaleMultiplier + lineData.uv_offset.x;
    const t = vertex.dot(rotatedV) * lineData.uv_scale.y * scaleMultiplier + lineData.uv_offset.y;
    return new THREE.Vector2(s, t);
  }
}


function createFaceGeometry( verts, face_data ) {
  const plane = face_data.plane;
  const lineData = face_data;
  const faceVerts = verts;

  // Build a local 2D coordinate system for triangulation.
  const normal = plane.normal;
  let tangent = new THREE.Vector3(0, 1, 0);
  if (Math.abs(normal.dot(tangent)) > 0.99) tangent.set(1, 0, 0);
  const uAxis = new THREE.Vector3().crossVectors(normal, tangent).normalize();
  const vAxis = new THREE.Vector3().crossVectors(normal, uAxis).normalize();
  
  // Project vertices to 2D for triangulation.
  const verts2D = faceVerts.map(v => new THREE.Vector2(v.dot(uAxis), v.dot(vAxis)));
  const triangles = THREE.ShapeUtils.triangulateShape(verts2D, []);
  
  // Prepare arrays.
  const positions = [];
  const uvs = [];
  
  // Compute UVs for each vertex.
  faceVerts.forEach(v => {
    positions.push(v.x, v.y, v.z);
    const uv = computeUVForVertex(v, lineData);
    uvs.push(uv.x, uv.y);
  });
  
  // Build indices from triangulation.
  const indices = [];
  triangles.forEach(tri => {
    indices.push(tri[0], tri[1], tri[2]);
  });
  
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function parseMap( is_valve_fmt, map, wad ) {
  const map_group = new THREE.Group( );

  const blocks = map.split( "}" ).join( "" )
                    .split( "{" )
                    .map( b => b.trim( ) )
                    .filter( b => b.length );

  for ( const block of blocks ) {
    const lines = block.split( "\n" ).map( l => l.trim( ) ).filter( l => l.length );

    // entity, ignore
    if ( lines[ 0 ].startsWith( "\"" ) )
      continue;

    const face_data = [ ];
    for ( const line of lines ) {
      // TODO : change this to get first origin and set cam pos to that
      if ( !line.startsWith( "(" ) )
        continue;

      let line_data;
      if ( is_valve_fmt )
        line_data = parseValveMapLine( line );
      else
        line_data = parseQuakeMapLine( line );

      if ( line_data ) {
        const plane = new THREE.Plane( ).setFromCoplanarPoints( line_data.v0, line_data.v1, line_data.v2 );
        line_data.plane = plane;

        face_data.push( line_data );
      }
    }

    if ( face_data.length < 4 ) {
      console.error( "too few planes for brush:", block );
      continue;
    }

    const vertices = [ ];
    const planes = face_data.map( fd => fd.plane );

    for ( let x = 0; x < planes.length; ++x ) {
      for ( let y = x + 1; y < planes.length; ++y ) {
        for ( let z = y + 1; z < planes.length; ++z ) {
          const pt = computeIntersection( planes[ x ], planes[ y ], planes[ z ] );

          if ( pt && isPointInsideBrush( pt, planes ) ) {
            if ( !vertices.some( v => v.distanceToSquared( pt ) < 1e-6 ) ) {
              vertices.push( pt );
            }
          }
        }
      }
    }

    if ( !vertices.length ) {
      console.error( "no vertices computed for brush" );
      return;
    }

    const brush_group = new THREE.Group( );

    for ( const fd of face_data ) {
      const face_verts = getFacePolygon( fd.plane, vertices );

      if ( !face_verts || face_verts.length < 3 ) {
        console.error( "failed to compute face polygon for face:", fd );
        continue;
      }

      const matching_texture = wad.extractTextureFromName( fd.texture );

      if ( !matching_texture ) {
        console.error( `failed to find texture '${ fd.texture }' in WAD dir` );
        continue;
      }

      const texture = createTextureFromMip( matching_texture );

      const face_geometry = createFaceGeometry( face_verts, fd );
      const face_material = new THREE.MeshBasicMaterial({
        side: THREE.DoubleSide,
        map: texture
      });

      const face_mesh = new THREE.Mesh( face_geometry, face_material );
      brush_group.add( face_mesh );
    }

    map_group.add( brush_group );
  }

  scene.add( map_group );
  return true;
}

function setHudNames( m, w ) {
  document.getElementById( 'map_name' ).innerText = m;
  document.getElementById( 'wad_name' ).innerText = w;
}

function loadDefaultMap( ) {
  const wad_name = "halflife.wad";
  const map_name = "2024.map";

  Promise.all([
    fetch(`files/valve/${ map_name }`).then( res => res.text( ) ),
    fetch(`files/valve/${ wad_name }`).then( res => res.arrayBuffer( ) )
  ])
  .then( ( [ map_data, wad_data ] ) => {
    const valve_map = map_data.includes( "[" ) || map_data.includes( "]" );
    const wad = loadWad( wad_data );

    if ( parseMap( valve_map, map_data, wad ) ) {

      const map_name_type = map_name + " | " + ( valve_map ? "(VALVE)" : "(QUAKE)" );

      setHudNames( map_name_type, wad_name );
    }
  })
  .catch( err => {
    console.error( 'failed to load default map:', err );
  });

  return true;
}

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

  controls = new OrbitControls( cam, renderer.domElement );

  return loadDefaultMap( );
}

function render( ) {
  requestAnimationFrame( render );
  controls.update( );
  renderer.render( scene, cam );
}

if ( init( ) ) render( );
else document.getElementsByTagName( 'body' )[ 0 ].appendChild( WebGL.getWebGL2ErrorMessage( ) );

function toggleCollapsibleSection( e ) {
  const section = document.getElementById( 'collapsible_section' );

  section.classList.toggle( 'active' );

  if ( section.style.maxHeight )
    section.style.maxHeight = null;
  else
    section.style.maxHeight = section.scrollHeight + "px";
}

document.addEventListener( "DOMContentLoaded", ( ) => {
  document.getElementById( 'collapsible_btn' ).onclick = toggleCollapsibleSection;

  // add upload map and wad events to parse shi
});