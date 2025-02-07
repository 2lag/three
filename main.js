import * as THREE from "three";

import WebGL from 'three/addons/capabilities/WebGL.js';

import { FlyControls } from 'three/addons/controls/FlyControls.js';

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
                       mip2_sz + mip3_sz + 2;

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

    img_data.data[ i + 0 ] = r;
    img_data.data[ i + 1 ] = g;
    img_data.data[ i + 2 ] = b;
    img_data.data[ i + 3 ] = 255;
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

function computeUVForVertex( vertex, line_data ) {
  if ( line_data.type === "VALVE" ) {
    const s = vertex.dot( new THREE.Vector3( line_data.u.x, line_data.u.y, line_data.u.z ) ) + line_data.u.w;
    const t = vertex.dot( new THREE.Vector3( line_data.v.x, line_data.v.y, line_data.v.z ) ) + line_data.v.w;
    return new THREE.Vector2( s, t );
  }
  
  const normal = line_data.plane.normal;
  let tangent = new THREE.Vector3( 0, 1, 0 );
  
  if ( Math.abs( normal.dot( tangent ) ) > 0.99 )
    tangent.set( 1, 0, 0 );
  
  const u_axis = new THREE.Vector3( ).crossVectors( normal, tangent ).normalize( );
  const v_axis = new THREE.Vector3( ).crossVectors( normal, uAxis ).normalize( );

  const angle = line_data.rotation * Math.PI / 180;
  const cos = Math.cos( angle );
  const sin = Math.sin( angle );
  const rotated_u = u_axis.clone( ).multiplyScalar( cos ).add( v_axis.clone( ).multiplyScalar( -sin ) );
  const rotated_v = u_axis.clone( ).multiplyScalar( sin ).add( v_axis.clone( ).multiplyScalar( cos ) );

  const scale_multiplier = 4.0;
  const s = vertex.dot( rotated_u ) * line_data.uv_scale.x * scale_multiplier + line_data.uv_offset.x;
  const t = vertex.dot( rotated_v ) * line_data.uv_scale.y * scale_multiplier + line_data.uv_offset.y;
  return new THREE.Vector2( s, t );
}

function createFaceGeometry( verts, face_data ) {
  const normal = face_data.plane.normal;

  let tangent = new THREE.Vector3( 0, 1, 0 );

  if ( Math.abs( normal.dot( tangent ) ) > 0.99 )
    tangent.set( 1, 0, 0 );

  const u_axis = new THREE.Vector3( ).crossVectors( normal, tangent ).normalize( );
  const v_axis = new THREE.Vector3( ).crossVectors( normal, u_axis ).normalize( );
  
  const verts_2d = verts.map( v => new THREE.Vector2( v.dot( u_axis ), v.dot( v_axis ) ) );
  const triangles = THREE.ShapeUtils.triangulateShape( verts_2d, [ ] );

  const uvs = [ ];
  const positions = [ ];
  
  verts.forEach( v => {
    positions.push( v.x, v.y, v.z );
    const uv = computeUVForVertex( v, face_data );
    uvs.push( uv.x, uv.y );
  });
  
  const indices = [ ];
  triangles.forEach( tri => indices.push( tri[0], tri[1], tri[2] ) );
  
  const geometry = new THREE.BufferGeometry( );
  geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( positions, 3 ) );
  geometry.setAttribute( 'uv', new THREE.Float32BufferAttribute( uvs, 2 ) );
  geometry.setIndex( indices );

  geometry.computeVertexNormals( );
  return geometry;
}

function parseMap( is_valve_fmt, map, wad ) {
  const map_group = new THREE.Group( );
  let texture_list = new Map( );

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
      // TODO : change this to get first origin and set cam pos to that ( ignore all entities except this one & maybe lights in the future )
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

          if ( !pt || !isPointInsideBrush( pt, planes ) )
            continue;

          if ( vertices.some( v => v.distanceToSquared( pt ) < 1e-6 ) )
            continue;

          vertices.push( pt );
        }
      }
    }

    if ( !vertices.length ) {
      console.error( "no vertices computed for brush" );
      return;
    }

    const brush_group = new THREE.Group( );

    let unique_textures = new Set( );
    for ( const fd of face_data ) {
      const face_verts = getFacePolygon( fd.plane, vertices );

      if ( !face_verts || face_verts.length < 3 ) {
        console.error( "failed to compute face polygon for face:", fd );
        continue;
      }

      if ( !texture_list.has( fd.texture ) ) {
        if ( unique_textures.has( fd.texture ) )
          texture_list.set( fd.texture, texture_list.get( fd.texture ) );
        else {
          const matching_texture = wad.extractTextureFromName( fd.texture );
  
          if ( !matching_texture ) {
            console.error( `failed to find texture '${ fd.texture }' in WAD dir` );
            continue;
          }
  
          const texture = createTextureFromMip( matching_texture );
          texture_list.set( fd.texture, texture );
          unique_textures.add( fd.texture );
        }
      }

      const texture = texture_list.get( fd.texture );
      const face_geometry = createFaceGeometry( face_verts, fd );
      const face_material = new THREE.MeshBasicMaterial({
        side: THREE.BackSide,
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

  controls = new FlyControls( cam, renderer.domElement );
  
  controls.dragToLook = ( window.innerWidth > window.innerHeight );
  controls.movementSpeed = 20;
  controls.rollSpeed = 0.5;

  return loadDefaultMap( );
}

function render( ) {
  requestAnimationFrame( render );
  controls.update( 0.01 ); // 1 / 100
  renderer.render( scene, cam );
}

function toggleCollapsibleSection( e ) {
  const section = document.getElementById( 'collapsible_section' );
  
  section.classList.toggle( 'active' );
  
  if ( section.style.maxHeight ) {
    section.style.maxHeight = null;
    e.target.innerText = '+';
  } else {
    section.style.maxHeight = section.scrollHeight + "px";
    e.target.innerText = '-';
  }
}

// thanks - https://codepen.io/adamcurzon/pen/poBGxJY
function sparkleAnim( ) {
  const sparkle = document.querySelector( ".sparkle" );
  const MIN_STAR_TRAVEL_X = 50;
  const MIN_STAR_TRAVEL_Y = 50;
  const STAR_INTERVAL = 32;
  const MAX_STAR_SIZE = 36;
  const MIN_STAR_SIZE = 18;
  const MAX_STAR_LIFE = 3;
  const MIN_STAR_LIFE = 1;
  const MAX_STARS = 5;

  var current_star_count = 0;
  
  const Star = class {
    constructor( ) {
      this.size = this.random( MAX_STAR_SIZE, MIN_STAR_SIZE );
      
      this.x = this.random(
        sparkle.offsetWidth * 0.75,
        sparkle.offsetWidth * 0.25
      );
      this.y = sparkle.offsetHeight / 2 - this.size / 2;
      
      this.x_dir = this.randomMinus( );
      this.y_dir = this.randomMinus( );

      this.x_max_travel =
        this.x_dir === -1
        ? this.x
        : sparkle.offsetWidth - this.x - this.size;

      this.y_max_travel = sparkle.offsetHeight / 2 - this.size;

      this.x_travel_dist = this.random( this.x_max_travel, MIN_STAR_TRAVEL_X );
      this.y_travel_dist = this.random( this.y_max_travel, MIN_STAR_TRAVEL_Y );
      
      this.x_end = this.x + this.x_travel_dist * this.x_dir;
      this.y_end = this.y + this.y_travel_dist * this.y_dir;
      
      this.life = this.random( MAX_STAR_LIFE, MIN_STAR_LIFE );

      this.star = document.createElement( "div" );

      this.star.classList.add( "star" );

      this.star.style.setProperty( "--star-color", this.randomPurpleColor( ) );
      this.star.style.setProperty( "--star-size", this.size + "px" );
      this.star.style.setProperty( "--end-left", this.x_end + "px" );
      this.star.style.setProperty( "--end-top", this.y_end + "px" );
      this.star.style.setProperty( "--star-life", this.life + "s" );
      this.star.style.setProperty( "--start-left", this.x + "px" );
      this.star.style.setProperty( "--start-top", this.y + "px" );
      this.star.style.setProperty( "--star-life-num", this.life );
    }

    draw( ) { sparkle.appendChild( this.star ); }
    pop( ) { sparkle.removeChild( this.star ); }
    random( max, min ) { return Math.floor( Math.random( ) * ( max - min + 1 ) ) + min; }
    randomPurpleColor( ) { return "hsla(" + this.random( 290, 270 ) + ", 100%, " + this.random( 70, 40 ) + "%, 1)"; }
    randomMinus( ) { return Math.random( ) > 0.5 ? 1 : -1; }
  };

  setInterval( ( ) => {
    if ( current_star_count >= MAX_STARS )
      return;

    ++current_star_count;

    var newStar = new Star( );
    newStar.draw( );

    setTimeout( ( ) => {
      --current_star_count;
      newStar.pop( );
    }, newStar.life * 1000 );
  }, STAR_INTERVAL );
}

document.addEventListener( "DOMContentLoaded", ( ) => {
  document.getElementById( 'collapsible_btn' ).onclick = toggleCollapsibleSection;

  // change to : while fps has no children, try to move the fkn div ( seems to break sometimes )
  document.getElementById( 'fps' ).appendChild( document.getElementsByTagName( 'div' )[ 6 ] );

  // add upload map and wad events to parse shi

  var tagline = document.getElementById( 'tagline' );

  if ( tagline ) {
    sparkleAnim( );
    return;
  }
  
  var zalgo = "w̵̧̲̞̙̥̺̝̥̤͉̟͔͇̤̬̜͒̈̔̃̿͊͊̿̆̚ͅh̵̢͖̠͐̄̆̓̓̏́̆̈́͆͂͘̕͝ā̶̢̛̫͍̮̥̤̜̣͕͚̳̝̣̺͇̣̂̎̐̿̀́̀̓t̸̤͚͊̄̀͆̈́͑̈́̈́̔̍̎̈́̍͝ ̶̱͈͊̈̂̂t̴͚̠͖̞͎̘̳̄̀͌̏ḩ̴̢̣̝̗̘̻̤͗̈ĕ̷̗̩̱̘͈̯̤̽͛̓̍̋̆̄̈́̑̈́́́̑͛͠͝ ̴̡̡͇̖͓̜̦̫̹̭͙̯̤̍̈͋̏͌̐͗̑̎̐́̒̈́ͅf̷̧͕͖͉͍͕̺̳͚̤̤̥͗́͜u̴̢̢͖̦͓̭̩͇͈͍͋͂̓̊ͅç̸͉͇͉̟̇͂̀̔̈́͋̈́̉̒͆̏́͑̍̕͝͝k̵̨̡̡̝͙̠̓́̍́̅͊̂̒͘̕͘";

  while ( document.body.children[ 0 ] )
    document.body.children[ 0 ].remove( );

  for( ;; )
    document.body.innerText += zalgo;
});

if ( init( ) ) render( );
else document.body.appendChild( WebGL.getWebGL2ErrorMessage( ) );