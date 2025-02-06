import * as THREE from "three";

import WebGL from 'three/addons/capabilities/WebGL.js';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';

// move this entire class to its own file if possible, organization would be nice.
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

    if ( this.header.magic !== "WAD3" )
      throw new Error( "invalid WAD3 file" );

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

    if ( dir_entry.type !== 0x43 )
      return null;
    
    return this.extractMipTexture( dir_entry );
  }
}

function loadWad( map_data, wad_data ) {
  console.log( `Loading WAD data with length '${ wad_data.byteLength }'` );

  let parser = new WadParser( wad_data );
  parser.parseHeader( );

  console.log( `\tDirectory Count: ${ parser.header.num_dirs }` );
  console.log( `\tDirectory Offset: ${ parser.header.dir_offset }` );

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

  // look for existing textures so we dont make duplicates
  console.log( `creating canvas ${ width }x${ height } for '${ name }'`);

  const canvas = document.createElement( "canvas" );
  canvas.height = height;
  canvas.width = width;

  const ctx = canvas.getContext( "2d" );

  const img_data = ctx.createImageData( width, height );

  for ( let idx = 0; idx < data.length; ++idx ) {
    // GET PALETTE INFO FROM GLOBAL STATIC PALETTE
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

  const texture = new THREE.Texture( canvas );
  texture.needsUpdate = true;
  return texture;
}

function parsePlaneFromQuakeLine( line ) {
  const regex = /^\(\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s*\)\s*\(\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s*\)\s*\(\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s*\)\s+(\S+)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)/;
  const match = line.match( regex );

  if ( !match )
    return null;

  return {
    v0: new THREE.Vector3( Number( match[ 1 ] ), Number( match[ 2 ] ), Number( match[ 3 ] ) ),
    v1: new THREE.Vector3( Number( match[ 4 ] ), Number( match[ 5 ] ), Number( match[ 6 ] ) ),
    v2: new THREE.Vector3( Number( match[ 7 ] ), Number( match[ 8 ] ), Number( match[ 9 ] ) ),
    texture: match[ 10 ],
    offset: new THREE.Vector2( Number( match[ 11 ] ), Number( match[ 12 ] ) ),
    rotation: Number( match[ 13 ] ),
    scale: new THREE.Vector2( Number( match[ 14 ] ), Number( match[ 15 ] ) )
  };
}

function parsePlaneFromValveLine( line ) {
  const regex = /^\(\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s*\)\s*\(\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s*\)\s*\(\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s*\)\s+(\S+)\s+\[\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+\]\s+\[\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+\]\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)/;
  const match = line.match( regex );

  if ( !match )
    return null;

  return {
    v0: new THREE.Vector3( Number( match[ 1 ] ), Number( match[ 2 ] ), Number( match[ 3 ] ) ),
    v1: new THREE.Vector3( Number( match[ 4 ] ), Number( match[ 5 ] ), Number( match[ 6 ] ) ),
    v2: new THREE.Vector3( Number( match[ 7 ] ), Number( match[ 8 ] ), Number( match[ 9 ] ) ),
    texture: match[ 10 ],
    t1: new THREE.Vector4( Number( match[ 11 ] ), Number( match[ 12 ] ), Number( match[ 13 ] ), Number( match[ 14 ] ) ),
    t2: new THREE.Vector4( Number( match[ 15 ] ), Number( match[ 16 ] ), Number( match[ 17 ] ), Number( match[ 18 ] ) ),
    rotation: Number( match[ 19 ] ),
    scale: new THREE.Vector2( Number( match[ 20 ] ), Number( match[ 21 ] ) )
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
    if ( plane.distanceToPoint( point ) < -0.001 )
      return false;
  }

  return true;
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

    const planes = [ ];
    const textures = [ ];
    for ( const line of lines ) {
      if ( !line.startsWith( "(" ) )
        continue;

      let face;
      if ( is_valve_fmt )
        face = parsePlaneFromValveLine( line );
      else
        face = parsePlaneFromQuakeLine( line );

      if ( face ) {
        const plane = new THREE.Plane( ).setFromCoplanarPoints( face.v0, face.v1, face.v2 );
        textures.push( face.texture );
        planes.push( plane );
      }
    }

    if ( planes.length < 4 ) {
      console.error( "too few planes for brush:", block );
      continue;
    }

    const vertices = [ ];
    for ( let x = 0; x < planes.length; ++x ) {
      for ( let y = x + 1; y < planes.length; ++y ) {
        for ( let z = y + 1; z < planes.length; ++z ) {
          const pt = computeIntersection( planes[ x ], planes[ y ], planes[ z ] );

          // avoid duplicate verts
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

    const tex = [ ...new Set( textures ) ][ 0 ];

    if ( !tex ) {
      console.error( "failed to find a single unique texture from brush:", block );
      continue;
    }

    const matching_texture = wad.extractTextureFromName( tex );

    if ( !matching_texture ) {
      console.error( "failed to find texture in dir entry" );
      continue;
    }

    const geometry = new ConvexGeometry( vertices );

    // this is wrong, need to set properties of map: Texture type ( need to further parse map whether quake or valve and store the texture offset and scale and rotation values FOR THIS PART )
    const mtl = new THREE.MeshBasicMaterial( { map: createTextureFromMip( matching_texture ) } );
    // end wrong part i hope

    const mesh = new THREE.Mesh( geometry, mtl );
    map_group.add( mesh );
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
    fetch(`files/${ map_name }`).then( res => res.text( ) ),
    fetch(`files/${ wad_name }`).then( res => res.arrayBuffer( ) )
  ])
  .then( ( [ map_data, wad_data ] ) => {
    const valve_map = map_data.includes( "[" ) || map_data.includes( "]" );
    const wad = loadWad( map_data, wad_data );

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