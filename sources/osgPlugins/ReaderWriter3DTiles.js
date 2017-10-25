'use strict';
var P = require( 'bluebird' );

var requestFile = require( 'osgDB/requestFile.js' );
// var notify = require('osg/notify');
var Registry = require ('osgDB/Registry');
var ReaderWriterB3DM = require( 'osgPlugins/ReaderWriterB3DM' );
var MatrixTransform = require( 'osg/MatrixTransform' );
var PagedLOD = require( 'osg/PagedLOD' );
var Lod = require( 'osg/Lod' );
var BoundingBox = require( 'osg/BoundingBox' );
var BoundingSphere = require( 'osg/BoundingSphere' );
var vec3 = require( 'osg/glMatrix' ).vec3;
var vec4 = require( 'osg/glMatrix' ).vec4;
var mat4 = require( 'osg/glMatrix' ).mat4;
var quat = require( 'osg/glMatrix' ).quat;

var recursiones = 0;
var NUM_MAX_RECURSIONES = 2;
var childNumber = 0;
var GEOMETRIC_ERROR_SCALE = 1;

var ReaderWriter3DTiles = function () {
    this._b3dmReader = new ReaderWriterB3DM();
    this._databasePath = '';
};

ReaderWriter3DTiles.prototype = {

    readNodeURL: function ( url, options ) {

        if ( options && options.databasePath !== undefined ) {
            this._databasePath = options.databasePath;
        }

        if ( options && options.subBasePath !== undefined ) {
            this._subBasePath = options.subBasePath;
        }
        if ( options && options.parentBounding !== undefined ) {
            this._parentBounding = options.parentBounding;
        }

        var self = this;
        // remove pseudoloader .3dt
        url = url.substr( 0, url.lastIndexOf( '.' ) );
        var filePromise = requestFile( url );

        return filePromise.then( function ( file ) {
            return self.readTileSet( file );
        } );
    },

    readTileSet: function ( file ) {
        var tilesetJson = JSON.parse( file );
        var rootTile = this.readRootTile( tilesetJson.root );
        return rootTile;
    },


    readChildrenTiles: function ( parent ) {
        var defer = P.defer();
        var numChilds = 0;
        var group = new MatrixTransform();
        var self = this;
        recursiones++;

        if (recursiones > NUM_MAX_RECURSIONES){
          defer.reject();
          return;
        }

        var createTileLOD = function ( tileLOD, tag, rw ) {
            var ext = tag.content.url.substr( tag.content.url.lastIndexOf( '.' ),tag.content.url.lenght );

            var fileURL =  rw._databasePath;
            if (self._subBasePath)
            fileURL+= self._subBasePath;
            fileURL+= tag.content.url;

            var rangeMin = ( tileLOD.json.geometricError !== undefined ) ? tileLOD.json.geometricError : 0;
            rangeMin *= rangeMin * GEOMETRIC_ERROR_SCALE;

            // position object
            var bs = self.getBounding(tag.boundingVolume);
            var tileTransform = new MatrixTransform();
            // console.log(self._bounding.center() + ' child bound ' + bs.center());
            var transVec = vec3.sub(vec3.create(),self._bounding.center(), bs.center());
            var scale = vec3.ONE;
            var rot = vec4.create();
            quat.setAxisAngle(rot,vec3.fromValues(1,0,0), Math.PI / 2.0) ;
            var trans = vec3.fromValues(transVec[0],transVec[1],transVec[2]) ;
            var mat = mat4.create();
            mat4.fromRotationTranslationScale( mat, rot, trans, scale );
            tileTransform.setMatrix(mat);


            if (ext === '.b3dm'){
              var b3dmrw = new ReaderWriterB3DM();

              b3dmrw.readNodeURL( fileURL ).then( function ( child ) {
                var tt = new MatrixTransform();
                // tt.setMatrix( mat4.fromTranslation(mat4.create(),vec3.fromValues(transVec[0],transVec[1],transVec[2]) ));
                mat4.fromRotation( tt.getMatrix(), Math.PI / 2.0, vec3.fromValues( 1, 0, 0 ) );
                tt.addChild(child);
                tileLOD.addChild( tt, rangeMin, Number.MAX_VALUE );
                tileLOD.setRangeMode(Lod.PIXEL_SIZE_ON_SCREEN);

                if ( tileLOD.json.children !== undefined ) {
                  self._bounding = bs;
                  tileLOD.setFunction( 1, rw.readChildrenTiles.bind( rw ) );
                  tileLOD.setRange( 1, rangeMin, Number.MAX_VALUE );
                }
                numChilds--;
                if ( numChilds <= 0 )
                defer.resolve( group );
              } );
            } else if (ext === '.json')
            {
              //console.log('loading 3dt child');
              var modelURL = fileURL + '.3dt';
              var rwB3DM = new ReaderWriter3DTiles();
              var tiledmodelPromise = rwB3DM.readNodeURL( modelURL, {
                  databasePath: self._databasePath,
                  subBasePath: 'Data/',
                  parentBounding: self._bounding
              } );
              tiledmodelPromise.then( function ( tiledmodel ) {
                  //tileTransform.addChild(tiledmodel);
                  var tt = new MatrixTransform();
                  // tt.setMatrix( tiledmodel.fromTranslation(mat4.create(),vec3.fromValues(transVec[0],transVec[1],transVec[2]) ));
                  mat4.fromRotation( tt.getMatrix(), Math.PI / 2.0, vec3.fromValues( 1, 0, 0 ) );
                  tt.addChild(tiledmodel);
                  tileLOD.addChild( tt, rangeMin, Number.MAX_VALUE );
                  tileLOD.setRangeMode(Lod.PIXEL_SIZE_ON_SCREEN);
                  defer.resolve( tiledmodel );
              } );

            }
        };

        var childrenJson = parent.json.children;
        if (!childrenJson){
          defer.reject();
          return;
        }

        numChilds = childrenJson.length;
        for ( var i = 0; i < childrenJson.length; i++ ) {
            var contentURL = childrenJson[ i ].content.url;
            var tileLOD = new PagedLOD();
            tileLOD.setName( contentURL );
            tileLOD.setDatabasePath( parent.getDatabasePath() );
            if ( contentURL === undefined ) break;
            tileLOD.json = childrenJson[ i ];
            createTileLOD( tileLOD, childrenJson[ i ], this );

            // transform each child
            var bs = self.getBounding(childrenJson[ i ].boundingVolume);
            var tileChildTransform = new MatrixTransform();
            var transVec = vec3.sub(vec3.create(),self._bounding.center(), bs.center());
            console.log('parent ' + self._bounding + ' child ' + bs + ' difference ' + transVec);
            tileChildTransform.setMatrix( mat4.fromTranslation(mat4.create(),vec3.fromValues(transVec[0],transVec[1],transVec[2]) ));
            tileChildTransform.addChild(tileLOD);
            group.addChild( tileChildTransform );
        }
        return defer.promise;
    },

    readRootTile: function ( tileJson ) {
        var self = this;
        var tileTransform = new MatrixTransform();
        var tileLOD = new PagedLOD();
        tileLOD.setDatabasePath( this._databasePath );
        tileTransform.addChild( tileLOD );
        // FIXME: transforms seems to be column major
        // So no transforms right now
        // tileTransform.setMatrix( tileJson.transform );
        var bs = tileJson.boundingVolume.sphere;
        // if (this._bounding)

        if (tileJson.transform)
            console.log('TIENE TRANSFORMACIONES!!!!!');
        this.readBoundingVolume( tileJson, tileLOD );
        // if (this._bounding && this._parentBounding){
        //   var transVec = vec3.sub(vec3.create(),this._bounding.center(), this._parentBounding.center());
        //   if (transVec[0] !== 0 && transVec[1] !== 0 &&transVec[2] !== 0)
        // tileTransform.setMatrix( mat4.fromTranslation(mat4.create(),vec3.fromValues(transVec[0],transVec[1],transVec[2]) ));
        // }

        mat4.fromRotation( tileTransform.getMatrix(), Math.PI / 2.0, vec3.fromValues( 1, 0, 0 ) );

        var contentURL = tileJson.content.url;
        if ( contentURL === undefined ) return;
        var fileURL =  this._databasePath;
        if (this._subBasePath)
          fileURL+= this._subBasePath;
        fileURL+=contentURL;
        this._b3dmReader.readNodeURL( fileURL ).then( function ( node ) {
            tileLOD.setRangeMode(Lod.PIXEL_SIZE_ON_SCREEN);
            //tileLOD.addChild( node, tileJson.geometricError, Number.MAX_VALUE );
            var range = tileJson.geometricError * tileJson.geometricError * GEOMETRIC_ERROR_SCALE;
            tileLOD.addChild( node, 0, range );
            tileLOD.json = tileJson;
            tileLOD.setFunction( 1, self.readChildrenTiles.bind( self ) );
            tileLOD.setRange( 1,range, Number.MAX_VALUE );
        } );
        return tileTransform;
    },

    readBoundingVolume: function ( tileJson, tileLOD ) {
        if ( tileJson.boundingVolume.box !== undefined ) {
            var box = tileJson.boundingVolume.box;
            // It's a box
            var bbox = new BoundingBox();
            bbox.expandByvec3( vec3.fromValues( box[ 3 ], box[ 7 ], box[ 11 ] ) );
            bbox.expandByvec3( vec3.fromValues( -box[ 3 ], -box[ 7 ], -box[ 11 ] ) );
            this._bounding = bbox;
            //tileLOD.setCenter( bbox.center( vec3.create() ) );
            //tileLOD.setRadius( bbox.radius() );
        } else if (tileJson.boundingVolume.sphere !== undefined){
           var sphere = tileJson.boundingVolume.sphere;
           var bs = new BoundingSphere();
           bs.set(vec3.fromValues(sphere[0],sphere[1],sphere[2]),sphere[3]);
           this._bounding = bs;
          //  console.log( bs.center( vec3.create() ) + ' radio ' + bs.radius());
           ///tileLOD.setCenter( bs.center( vec3.create() ) );
           //tileLOD.setRadius( bs.radius() );
        } else {
            console.console.log( 'this bounding volume is not implement yet' );
            // Notify.error( 'this bounding volume is not implement yet' );
        }
    },

    getBounding: function ( boundingTag ) {
        if ( boundingTag.box !== undefined ) {
            var box = boundingTag.box;
            // It's a box
            var bbox = new BoundingBox();
            bbox.expandByvec3( vec3.fromValues( box[ 3 ], box[ 7 ], box[ 11 ] ) );
            bbox.expandByvec3( vec3.fromValues( -box[ 3 ], -box[ 7 ], -box[ 11 ] ) );
            return bbox;
        } else if (boundingTag.sphere !== undefined){
           var sphere = boundingTag.sphere;
           var bs = new BoundingSphere();
           bs.set(vec3.fromValues(sphere[0],sphere[1],sphere[2]),sphere[3]);
           return bs;
        } else {
            console.console.log( 'this bounding volume is not implement yet' );
            // Notify.error( 'this bounding volume is not implement yet' );
        }
    }
};

Registry.instance().addReaderWriter( '3dt', new ReaderWriter3DTiles() );

module.exports = ReaderWriter3DTiles;
