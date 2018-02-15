'use strict';
var P = require( 'bluebird' );

var requestFile = require( 'osgDB/requestFile.js' );
// var notify = require('osg/notify');
var Registry = require ('osgDB/Registry');
var ReaderWriterB3DM = require( 'osgPlugins/ReaderWriterB3DM' );
var MatrixTransform = require( 'osg/MatrixTransform' );
var Node = require( 'osg/Node' );
var PagedLOD = require( 'osg/PagedLOD' );
var Lod = require( 'osg/Lod' );
var BoundingBox = require( 'osg/BoundingBox' );
var BoundingSphere = require( 'osg/BoundingSphere' );
var vec3 = require( 'osg/glMatrix' ).vec3;
var vec4 = require( 'osg/glMatrix' ).vec4;
var mat4 = require( 'osg/glMatrix' ).mat4;
var quat = require( 'osg/glMatrix' ).quat;

var recursiones = 0;
var NUM_MAX_RECURSIONES = 500;
var childNumber = 0;
var GEOMETRIC_ERROR_SCALE = 1;
var RANGE_IN_PIXELS = 400000;

var ReaderWriter3DTiles = function () {
    this._b3dmReader = new ReaderWriterB3DM();
    this._databasePath = '';
};

ReaderWriter3DTiles.prototype = {

    readNodeURL: function ( url, options ) {
        // console.log('Reading URL->' +  url);
        if ( options && options.databasePath !== undefined ) {
            // if (options.databasePath.indexOf('Data') === -1)
            //     console.log('Seteando mal el data base path');
            this._databasePath = options.databasePath;
        }

        if ( options && options.subBasePath !== undefined ) {
            this._subBasePath = options.subBasePath;
        }
        if ( options && options.parentBounding !== undefined ) {
            this._bounding = options.parentBounding;
            // this._parentBounding = options.parentBounding;
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
        var group = new Node();
      //  group.setMatrix(  mat4.fromRotation( group.getMatrix(), Math.PI / 2.0, vec3.fromValues( 1, 0, 0 ) ));
        var self = this;
        recursiones++;

        // if (recursiones > NUM_MAX_RECURSIONES){
        //   defer.reject();
        //   return;
        // }

        var createTileLOD = function ( tileLOD, tag, rw ) {
            var childDefer = P.defer();
            var ext = tag.content.url.substr( tag.content.url.lastIndexOf( '.' ),tag.content.url.lenght );

            var fileURL =  rw._databasePath;
            if (self._subBasePath)
                fileURL+= self._subBasePath;
            fileURL+= tag.content.url;

            // var rangeMin = ( tileLOD.json.geometricError !== undefined ) ? tileLOD.json.geometricError : 0;
            var rangeMin = RANGE_IN_PIXELS;
            rangeMin = rangeMin * GEOMETRIC_ERROR_SCALE;
            if (ext === '.b3dm'){
              var b3dmrw = new ReaderWriterB3DM();

              // console.log('loading ' + fileURL);

              b3dmrw.readNodeURL( fileURL ).then( function ( child ) {
                // console.log('load ' + fileURL);
                var tt = new MatrixTransform();
                var bs = self.getBounding(tag.boundingVolume);
                var transVec = vec3.sub(vec3.create(), bs.center(),self._bounding.center());

                var matrixTranslate = mat4.create();
                mat4.fromTranslation(matrixTranslate, vec3.fromValues(transVec[0],transVec[1],transVec[2]));

                var matrixRotate = mat4.create();
                mat4.fromRotation(matrixRotate,  Math.PI / 2.0, vec3.fromValues( 1, 0, 0 ) );

                mat4.mul(tt.getMatrix(), matrixTranslate, matrixRotate);

                tt.addChild(child);

                tileLOD.addChild( tt, 0, rangeMin );
                // tileLOD.setRangeMode(Lod.DISTANCE_FROM_EYE_POINT);
                tileLOD.setRangeMode(Lod.PIXEL_SIZE_ON_SCREEN);

                if ( tileLOD.json.children !== undefined ) {
                  //self._bounding = bs;
                  tileLOD.setFunction( 1, rw.readChildrenTiles.bind( rw ) );
                  tileLOD.setRange( 1, rangeMin, Number.MAX_VALUE );
                } else {
                  tileLOD.setRange( 0, 0, Number.MAX_VALUE );
                }
                // numChilds--;
                // if ( numChilds <= 0 )
                childDefer.resolve( tileLOD );
              } );
            }
            else if (ext === '.json')
            {
              //console.log('loading 3dt child');
              var modelURL = fileURL + '.3dt';
              // console.log('Leyendo ' + modelURL);

              var basePath = fileURL.substr(self._databasePath.length)
              basePath = basePath.substr(0,basePath.lastIndexOf('/')+1);

              var rwB3DM = new ReaderWriter3DTiles();
              var tiledmodelPromise = rwB3DM.readNodeURL( modelURL, {
                  databasePath: self._databasePath,
                  subBasePath: basePath,
                  parentBounding: self._bounding,
                  json: tag
              } );
              tiledmodelPromise.then( function ( tiledmodel ) {
                  childDefer.resolve( tiledmodel );
              }, function (){
                  console.log('fallo en peticion');
              } );
            }
            return childDefer.promise;
        };

        var childrenJson = parent.json.children;
        if (!childrenJson){
          defer.reject();
          return;
        }

        numChilds = childrenJson.length;
        var promiseTLOD = [];
        for ( var i = 0; i < childrenJson.length; i++ ) {
            var contentURL = childrenJson[ i ].content.url;
            var tileLOD = new PagedLOD();
            tileLOD.setName( contentURL );
            tileLOD.setDatabasePath( parent.getDatabasePath() );
            if ( contentURL === undefined ) break;
            tileLOD.json = childrenJson[ i ];

            promiseTLOD.push(createTileLOD( tileLOD, childrenJson[ i ], this ));

        }
        P.all(promiseTLOD).then ( function (tileLODArray) {
            for (var i = 0; i < tileLODArray.length; i++) {
                group.addChild( tileLODArray[i] );
            }
            defer.resolve(group);
        });
        return defer.promise;
    },

    readSimpleNode: function ( tileJson, group ) {
      var self = this;


      var readFromJson = function (url, childrenJson){
        var modelURL = url + '.3dt';

        var basePath = url.substr(self._databasePath.length)
        basePath = basePath.substr(0,basePath.lastIndexOf('/')+1);

        var rwB3DM = new ReaderWriter3DTiles();
        var tiledmodelPromise = rwB3DM.readNodeURL( modelURL, {
            databasePath: self._databasePath,
            subBasePath: basePath,
            parentBounding: self._bounding,
            json: childrenJson
        } );
        tiledmodelPromise.then( function ( tiledmodel ) {
            group.addChild(tiledmodel);
        } );
      };


      for ( var i = 0; i < tileJson.length; i++ ) {
          var childrenJson = tileJson[i];
          if ( childrenJson.content !== undefined && childrenJson.content.url !== undefined )
              {
                  readFromJson( this._databasePath + childrenJson.content.url, childrenJson);
              } else {

                var tt = new MatrixTransform();

                var bs = self.getBounding(childrenJson.boundingVolume);
                var transVec = vec3.sub(vec3.create(), bs.center(),self._bounding.center());

                var matrixTranslate = mat4.create();
                mat4.fromTranslation(matrixTranslate, vec3.fromValues(transVec[0],transVec[1],transVec[2]));

                var matrixRotate = mat4.create();
                mat4.fromRotation(matrixRotate,  Math.PI / 2.0, vec3.fromValues( 1, 0, 0 ) );

                mat4.mul(group.getMatrix(), matrixTranslate, matrixRotate);

                if (childrenJson.children && childrenJson.children.length > 0)
                this.readSimpleNode(childrenJson.children,tt);

                group.addChild(tt);
              }
      }
    },


    readRootTile: function ( tileJson ) {
        var self = this;
        var tileTransform = new MatrixTransform();
        // FIXME: transforms seems to be column major
        // So no transforms right now

        if (tileJson.transform)
            console.log('TIENE TRANSFORMACIONES!!!!!');

        this.readBoundingVolume( tileJson );
        // if a node does not have content, try to add his children
        if ( tileJson.content === undefined || tileJson.content.url === undefined )
        {
            var group = new MatrixTransform();
            this.readSimpleNode(tileJson.children, group);
            tileTransform.addChild(group);
        } else {
            var tileLOD = new PagedLOD();
            tileLOD.setDatabasePath( this._databasePath );
            tileTransform.addChild( tileLOD );
            var contentURL = tileJson.content.url;
            var fileURL =  this._databasePath;
            if (this._subBasePath)
              fileURL+= this._subBasePath;
            fileURL+=contentURL;

            var debugURL = fileURL.substr(fileURL.indexOf('https://')+8);
            // if (debugURL.indexOf('Data') === -1 )
            //     console.log('No tiene data');

            this._b3dmReader.readNodeURL( fileURL ).then( function ( node ) {
                tileLOD.setRangeMode(Lod.PIXEL_SIZE_ON_SCREEN);
                //tileLOD.addChild( node, tileJson.geometricError, Number.MAX_VALUE );
                // var range = tileJson.geometricError * tileJson.geometricError * GEOMETRIC_ERROR_SCALE;
                var range = RANGE_IN_PIXELS;

                var tt = new MatrixTransform();
              //  tt.setMatrix(mat4.fromRotation( tt.getMatrix(), Math.PI / 2.0, vec3.fromValues( 1, 0, 0 ) ));
                var bs = self.getBounding(tileJson.boundingVolume);
                var transVec = vec3.sub(vec3.create(), bs.center(),self._bounding.center());
                // tt.setMatrix(  mat4.fromTranslation(tt.getMatrix(),vec3.fromValues(transVec[0],transVec[1],transVec[2]) ));

                var matrixTranslate = mat4.create();
                mat4.fromTranslation(matrixTranslate, vec3.fromValues(transVec[0],transVec[1],transVec[2]));

                var matrixRotate = mat4.create();
                mat4.fromRotation(matrixRotate,  Math.PI / 2.0, vec3.fromValues( 1, 0, 0 ) );

                mat4.mul(tt.getMatrix(), matrixTranslate, matrixRotate);
                tt.addChild(node);
                tileLOD.addChild( tt, 0, range );
                tileLOD.json = tileJson;
                tileLOD.setFunction( 1, self.readChildrenTiles.bind( self ) );
                tileLOD.setRange( 1,range, Number.MAX_VALUE );
            } );
      }
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
           if (this._bounding === undefined)
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
