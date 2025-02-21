/**
 * @author James Baicoianu / http://www.baicoianu.com/
 */

// translated to JS & expanded by day ))

import * as THREE from "three";

export class CamCtl {
  constructor( camera, domElement ) {
    this.camera = camera;
    this.domElement = domElement;

    if ( domElement )
      this.domElement.setAttribute( "tabindex", "-1" );

    this.movementSpeed = 100;
    this.rollSpeed = 0.005;
    this.tmpQuaternion = new THREE.Quaternion( );

    this.moveState = {
      up: 0, down: 0, left: 0, right: 0, fwd: 0, back: 0,
      pitchUp: 0, pitchDown: 0, yawLeft: 0, yawRight: 0, rollLeft: 0, rollRight: 0
    }
    
    this.movementSpeedMultiplier = 1;
    this.moveVector = new THREE.Vector3( 0, 0, 0 );
    this.rotationVector = new THREE.Vector3( 0, 0, 0 );

    this._mousemove = this.bind( this, this.mousemove );
    this._mousedown = this.bind( this, this.mousedown );
    this._keydown = this.bind( this, this.keydown );
    this._keyup = this.bind( this, this.keyup );

    this.hotkeys = { };

    this.domElement.addEventListener( "contextmenu", this.contextmenu, false );
    this.domElement.addEventListener( "mousemove", this._mousemove, false );
    this.domElement.addEventListener( "mousedown", this._mousedown, false );
    this.domElement.addEventListener( "mouseup", this._mouseup, false );
    
    document.addEventListener( "pointerlockchange", lockChangeAlert.bind( this ), false );
    document.addEventListener( "mozpointerlockerror", lockChangeAlert.bind( this ), false );
    
    function lockChangeAlert( ) {
      this.controlsFocused = ( document.pointerLockElement === this.domElement );
    }

    window.addEventListener( "keydown", this._keydown, false );
    window.addEventListener( "keyup", this._keyup, false );

    this.updateMovementVector( );

    this.controlsFocused = false;
  }

  keydown( event ) {
    if ( event.altKey )
      return;

    switch( event.keyCode ) {
    /*shift*/case 16: this.movementSpeedMultiplier = 3; break;
    /*lctrl*/case 17: this.moveState.down = 1; break;
    /*space*/case 32: this.moveState.up = 1; break;
    /*w*/case 87: this.moveState.fwd = 1; break;
    /*a*/case 83: this.moveState.back = 1; break;
    /*s*/case 65: this.moveState.left = 1; break;
    /*d*/case 68: this.moveState.right = 1; break;
    /*f*/case 70: this.toggleFullscreen( ); break;
    }

    if ( this.hotkeys[ event.keyCode ] )
      this.hotkeys[ event.keyCode ]( );

    this.updateMovementVector( );
    event.preventDefault( );
  }

  keyup( event ) {
    switch( event.keyCode ) {
    /*shift*/case 16: this.movementSpeedMultiplier = 1; break;
    /*lctrl*/case 17: this.moveState.down = 0; break;
    /*space*/case 32: this.moveState.up = 0; break;
    /*w*/case 87: this.moveState.fwd = 0; break;
    /*a*/case 83: this.moveState.back = 0; break;
    /*s*/case 65: this.moveState.left = 0; break;
    /*d*/case 68: this.moveState.right = 0; break;
    }

    this.updateMovementVector( );
    event.preventDefault( );
  }

  mousedown( event ) {
    this.domElement.requestPointerLock( );
    event.preventDefault( );
    event.stopPropagation( );
  }

  mousemove( event ) {
    if ( !this.controlsFocused )
      return;

    let x_axis = new THREE.Vector3( 1, 0, 0 );
    let y_axis = new THREE.Vector3( 0, 0, 1 );

    this.camera.rotateOnAxis( x_axis, event.movementY * -0.002 );
    this.camera.rotateOnWorldAxis( y_axis, event.movementX * -0.002 );
  }

  toggleFullscreen( ) {
    if ( document.fullscreenElement ) {
      document.exitFullscreen( );
      return;
    }

    this.domElement.requestPointerLock( );
    this.domElement.requestFullscreen( ).catch( ( err ) => {
      alert( `Error attempting to enable fullscreen: ${ err.message } ( ${ err.name } )`)
    });
  }

  registerHotkey( keyCode, callback ) {
    this.hotkeys[ keyCode ] = callback;
  }

  update( delta ) {
    let moveMult = delta * this.movementSpeed * this.movementSpeedMultiplier;
    let rotMult = delta * this.rollSpeed;

    this.camera.translateX( this.moveVector.x * moveMult );
    this.camera.translateY( this.moveVector.y * moveMult );
    this.camera.translateZ( this.moveVector.z * moveMult );
    
    this.tmpQuaternion.set(
      this.rotationVector.x * rotMult,
      this.rotationVector.y * rotMult,
      this.rotationVector.z * rotMult,
      1
    ).normalize( );

    this.camera.quaternion.multiply( this.tmpQuaternion );
    this.camera.rotation.setFromQuaternion(
      this.camera.quaternion,
      this.camera.rotation.order
    );
  }

  updateMovementVector( ) {
    let fwd = this.moveState.fwd || ( false && !this.moveState.back ) ? 1 : 0;

    this.moveVector.x = -this.moveState.left + this.moveState.right;
    this.moveVector.y = -this.moveState.down + this.moveState.up;
    this.moveVector.z = -fwd + this.moveState.back;
  }

  bind( scope, fn ) {
    return function ( ) {
      fn.apply( scope, arguments );
    };
  }

  contextmenu( event ) {
    event.preventDefault( );
  }

  dispose( ) {
    this.domElement.removeEventListener( "contextmenu", this.contextmenu, false );
    this.domElement.removeEventListener( "mousedown", this._mousedown, false );
    this.domElement.removeEventListener( "mousemove", this._mousemove, false );

    window.removeEventListener( "keydown", this._keydown, false );
    window.removeEventListener( "keyup", this._keyup, false );
  }
};