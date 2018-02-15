( function () {
    'use strict';

    var OSG = window.OSG;
    var osg = OSG.osg;
    var osgViewer = OSG.osgViewer;
    var osgDB = OSG.osgDB;
    var osgGA = OSG.osgGA;
    var osgUtil = OSG.osgUtil;
    var ExampleOSGJS = window.ExampleOSGJS;

    // // orlando
    var modelURL = 'https://d3h9zulrmcj1j6.cloudfront.net/Orlando_Cesium/root.json.3dt';
    var databasePath = 'https://d3h9zulrmcj1j6.cloudfront.net/Orlando_Cesium/';

    // marseille
    // var modelURL = 'https://d3h9zulrmcj1j6.cloudfront.net/Marseille_Cesium/root.json.3dt';
    // var databasePath = 'https://d3h9zulrmcj1j6.cloudfront.net/Marseille_Cesium/';

    // Context capture
    // var modelURL = './context/Scene/Data/Tile_p007_p010/Tile_p007_p010.json.3dt';
    // var databasePath = './context/Scene/Data/Tile_p007_p010/';
    // var modelURL = './context/Scene/3dmesh.json.3dt';
    // var databasePath = './context/Scene/';


    //
    // var modelURL = '../media/tilesets/TilesetWithDiscreteLOD/tileset.json.3dt';
    // var databasePath = '../media/tilesets/TilesetWithDiscreteLOD/';
    // var modelURL = '../media/models/3DTiles/tileset.json.3dt';
    // var databasePath = '../media/models/3DTiles/';


    var Example = function () {
        this._viewer = undefined;
        this._canvas = undefined;
        this._rootNode = new osg.Node();
        this._displayGraph = osgUtil.DisplayGraph.instance();
    };
    Example.prototype = osg.objectInherit( ExampleOSGJS.prototype, {

        run: function () {
            // The 3D canvas.
            this._canvas = document.getElementById( 'View' );
            // The viewer
            this._viewer = new osgViewer.Viewer( this._canvas, {
                'enableFrustumCulling': true
            } );
            this._viewer.init();
            this._viewer.getCamera().setClearColor([1,0,0,1] );

            var tiledmodelPromise = osgDB.readNodeURL( modelURL, {
                databasePath: databasePath
            } );
            var self = this;
            tiledmodelPromise.then( function ( tiledmodel ) {
                var mt = new osg.MatrixTransform();
                // mt.setMatrix(osg.mat4.fromRotation( mt.getMatrix(), Math.PI / 2.0, osg.vec3.fromValues( 1, 0, 0 ) ));
                mt.addChild( tiledmodel );
                self._rootNode.addChild( mt );
                self._viewer.getManipulator().computeHomePosition();
                // var displayGraph = osgUtil.DisplayGraph.instance();
                // self._displayGraph.setDisplayGraphRenderer(true);
                // self._displayGraph.createGraph(self._rootNode);
            } );

            this._viewer.setSceneData( this._rootNode );

            this._cadManipulator = new osgGA.CADManipulator();

            this._viewer.setupManipulator(  this._cadManipulator);
            // this._viewer.setupManipulator();

            this._viewer.run();
        },

        reloadDebugGraph: function(){
          this._displayGraph.reset();
          this._displayGraph.createGraph(this._rootNode);
        }
    } );

    window.addEventListener( 'load', function () {
        var example = new Example();
        example.run();

        document.getElementById('reload').addEventListener('click',function(){
          console.log('pulsado');
          example.reloadDebugGraph();
        },true);
    }, true );



} )();
