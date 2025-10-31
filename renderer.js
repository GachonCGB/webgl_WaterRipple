/*
 * WebGL Water
 * https://madebyevan.com/webgl-water/
 *
 * Copyright 2011 Evan Wallace
 * Released under the MIT license
 */

function Renderer() {
  this.tileTexture = GL.Texture.fromImage(document.getElementById('tiles'), {
    minFilter: gl.LINEAR_MIPMAP_LINEAR,
    wrap: gl.REPEAT,
    format: gl.RGB
  });
  // Light from directly above (center, pointing down)
  this.lightDir = new GL.Vector(0.0, 1.0, 0.0).unit();
  this.causticTex = new GL.Texture(1024, 1024);
  this.waterMesh = GL.Mesh.plane({ detail: 200 });
  
  // Load helper functions and create water shaders
  var helperFunctions = document.getElementById('helper-functions').text;
  this.waterShaders = [];
  this.waterShaders[0] = new GL.Shader('water-surface-vertex', helperFunctions + '\n' + document.getElementById('water-surface-abovewater-fragment').text);
  this.waterShaders[1] = new GL.Shader('water-surface-vertex', helperFunctions + '\n' + document.getElementById('water-surface-underwater-fragment').text);
  
  this.sphereMesh = GL.Mesh.sphere({ detail: 10 });
  this.sphereShader = new GL.Shader(helperFunctions + '\n' + document.getElementById('sphere-vertex').text, 
                                     helperFunctions + '\n' + document.getElementById('sphere-fragment').text);
  
  this.cubeMesh = GL.Mesh.cube();
  this.cubeMesh.triangles.splice(4, 2);
  this.cubeMesh.compile();
  this.cubeShader = new GL.Shader(helperFunctions + '\n' + document.getElementById('cube-vertex').text,
                                   helperFunctions + '\n' + document.getElementById('cube-fragment').text);
  
  this.sphereCenter = new GL.Vector();
  this.sphereRadius = 0;
  
  var hasDerivatives = !!gl.getExtension('OES_standard_derivatives');
  var causticsFragmentId = hasDerivatives ? 'caustics-fragment-derivatives' : 'caustics-fragment';
  this.causticsShader = new GL.Shader(helperFunctions + '\n' + document.getElementById('caustics-vertex').text,
                                       helperFunctions + '\n' + document.getElementById(causticsFragmentId).text);
}

Renderer.prototype.updateCaustics = function(water) {
  if (!this.causticsShader) return;
  var this_ = this;
  this.causticTex.drawTo(function() {
    gl.clear(gl.COLOR_BUFFER_BIT);
    water.textureA.bind(0);
    this_.causticsShader.uniforms({
      light: this_.lightDir,
      water: 0,
      sphereCenter: this_.sphereCenter,
      sphereRadius: this_.sphereRadius
    }).draw(this_.waterMesh);
  });
};

Renderer.prototype.renderWater = function(water, sky) {
  var tracer = new GL.Raytracer();
  water.textureA.bind(0);
  this.tileTexture.bind(1);
  sky.bind(2);
  this.causticTex.bind(3);
  gl.enable(gl.CULL_FACE);
  for (var i = 0; i < 2; i++) {
    gl.cullFace(i ? gl.BACK : gl.FRONT);
    this.waterShaders[i].uniforms({
      light: this.lightDir,
      water: 0,
      tiles: 1,
      sky: 2,
      causticTex: 3,
      eye: tracer.eye,
      sphereCenter: this.sphereCenter,
      sphereRadius: this.sphereRadius
    }).draw(this.waterMesh);
  }
  gl.disable(gl.CULL_FACE);
};

Renderer.prototype.renderSphere = function() {
  water.textureA.bind(0);
  this.causticTex.bind(1);
  this.sphereShader.uniforms({
    light: this.lightDir,
    water: 0,
    causticTex: 1,
    sphereCenter: this.sphereCenter,
    sphereRadius: this.sphereRadius
  }).draw(this.sphereMesh);
};

Renderer.prototype.renderCube = function() {
  gl.enable(gl.CULL_FACE);
  water.textureA.bind(0);
  this.tileTexture.bind(1);
  this.causticTex.bind(2);
  this.cubeShader.uniforms({
    light: this.lightDir,
    water: 0,
    tiles: 1,
    causticTex: 2,
    sphereCenter: this.sphereCenter,
    sphereRadius: this.sphereRadius
  }).draw(this.cubeMesh);
  gl.disable(gl.CULL_FACE);
};
