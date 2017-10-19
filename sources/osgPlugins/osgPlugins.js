'use strict';
var ReaderWriterGLTF = require('osgPlugins/ReaderWriterGLTF');
var ReaderWriterZIP = require('osgPlugins/ReaderWriterZIP');
var ReaderWriter3DTiles = require('osgPlugins/ReaderWriter3DTiles');
var ReaderWriterB3DM = require('osgPlugins/ReaderWriterB3DM');
var ReaderWriterGLB = require('osgPlugins/ReaderWriterGLB');
var ReaderWriterGLTF_1_0 = require('osgPlugins/ReaderWriterGLTF_1_0');

var osgPlugins = {};

osgPlugins.ReaderWriterGLTF = ReaderWriterGLTF;
osgPlugins.ReaderWriterZIP = ReaderWriterZIP;
osgPlugins.ReaderWriter3DTiles = ReaderWriter3DTiles;
osgPlugins.ReaderWriterB3DM = ReaderWriterB3DM;
osgPlugins.ReaderWriterGLB = ReaderWriterGLB;
osgPlugins.ReaderWriterGLTF_1_0 = ReaderWriterGLTF_1_0;

module.exports = osgPlugins;
