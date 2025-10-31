/*
 * WebGL Water
 * https://madebyevan.com/webgl-water/
 *
 * Copyright 2011 Evan Wallace
 * Released under the MIT license
 */

var helperFunctions = '\
  const float IOR_AIR = 1.0;\
  const float IOR_WATER = 1.333;\
  /* make water more transparent and less tinted */\
  const vec3 abovewaterColor = vec3(0.97, 0.985, 1.0);\
  const vec3 underwaterColor = vec3(0.97, 0.985, 1.0);\
  const float poolHeight = 0.5;\
  uniform vec3 light;\
  uniform vec3 sphereCenter;\
  uniform float sphereRadius;\
  uniform sampler2D tiles;\
  uniform sampler2D causticTex;\
  uniform sampler2D water;\
  \
  vec2 intersectCube(vec3 origin, vec3 ray, vec3 cubeMin, vec3 cubeMax) {\
    vec3 tMin = (cubeMin - origin) / ray;\
    vec3 tMax = (cubeMax - origin) / ray;\
    vec3 t1 = min(tMin, tMax);\
    vec3 t2 = max(tMin, tMax);\
    float tNear = max(max(t1.x, t1.y), t1.z);\
    float tFar = min(min(t2.x, t2.y), t2.z);\
    return vec2(tNear, tFar);\
  }\
  \
  float intersectSphere(vec3 origin, vec3 ray, vec3 sphereCenter, float sphereRadius) {\
    vec3 toSphere = origin - sphereCenter;\
    float a = dot(ray, ray);\
    float b = 2.0 * dot(toSphere, ray);\
    float c = dot(toSphere, toSphere) - sphereRadius * sphereRadius;\
    float discriminant = b*b - 4.0*a*c;\
    if (discriminant > 0.0) {\
      float t = (-b - sqrt(discriminant)) / (2.0 * a);\
      if (t > 0.0) return t;\
    }\
    return 1.0e6;\
  }\
  \
  vec3 getSphereColor(vec3 point) {\
    vec3 color = vec3(0.85);\
    \
    /* caustics */\
    vec3 sphereNormal = (point - sphereCenter) / sphereRadius;\
    vec3 refractedLight = refract(-light, vec3(0.0, 1.0, 0.0), IOR_AIR / IOR_WATER);\
    float diffuse = max(0.0, dot(-refractedLight, sphereNormal)) * 0.15;\
    vec4 info = texture2D(water, point.xz * 0.5 + 0.5);\
    if (point.y < info.r) {\
      vec4 caustic = texture2D(causticTex, 0.75 * (point.xz - point.y * refractedLight.xz / refractedLight.y) * 0.5 + 0.5);\
      diffuse += caustic.r * 0.3;\
    }\
    color += diffuse;\
    \
    return color;\
  }\
  \
  vec3 getWallColor(vec3 point) {\
    float ambient = 0.85;\
    \
    vec3 wallColor;\
    vec3 normal;\
    if (abs(point.x) > 0.999) {\
      wallColor = texture2D(tiles, point.yz * 0.5 + vec2(1.0, 0.5)).rgb;\
      normal = vec3(-point.x, 0.0, 0.0);\
    } else if (abs(point.z) > 0.999) {\
      wallColor = texture2D(tiles, point.yx * 0.5 + vec2(1.0, 0.5)).rgb;\
      normal = vec3(0.0, 0.0, -point.z);\
    } else {\
      wallColor = texture2D(tiles, point.xz * 0.5 + 0.5).rgb;\
      normal = vec3(0.0, 1.0, 0.0);\
      /* darken pool floor so ripples/caustics read better */\
      wallColor *= 0.75;\
    }\
    \
    /* caustics */\
    vec3 refractedLight = -refract(-light, vec3(0.0, 1.0, 0.0), IOR_AIR / IOR_WATER);\
    float diffuse = max(0.0, dot(refractedLight, normal)) * 0.15;\
    vec4 info = texture2D(water, point.xz * 0.5 + 0.5);\
    if (point.y < info.r) {\
      vec4 caustic = texture2D(causticTex, 0.75 * (point.xz - point.y * refractedLight.xz / refractedLight.y) * 0.5 + 0.5);\
      /* slightly stronger caustics on the floor */\
      float causticBoost = normal.y > 0.5 ? 0.45 : 0.3;\
      diffuse += caustic.r * causticBoost * caustic.g;\
    }\
    \
    float scale = ambient + diffuse;\
    return wallColor * scale;\
  }\
';

function Renderer() {
  // Use LightGL's built-in id-based shader lookup (same as original project)
  this.tileTexture = GL.Texture.fromImage(document.getElementById('tiles'), {
    minFilter: gl.LINEAR_MIPMAP_LINEAR,
    wrap: gl.REPEAT,
    format: gl.RGB
  });
  this.lightDir = new GL.Vector(0.0, -1.0, 0.0);
  this.causticTex = new GL.Texture(1024, 1024);
  this.waterMesh = GL.Mesh.plane({ detail: 200 });
  this.waterShaders = [];
  this.waterShaders[0] = new GL.Shader('water-surface-vertex', 'water-surface-abovewater-fragment');
  this.waterShaders[1] = new GL.Shader('water-surface-vertex', 'water-surface-underwater-fragment');
  this.cubeMesh = GL.Mesh.cube();
  this.cubeMesh.triangles.splice(4, 2);
  this.cubeMesh.compile();
  this.cubeShader = new GL.Shader('cube-vertex', 'cube-fragment');
  // sphere removed
  // droplet rendering
  this.dropletMesh = GL.Mesh.sphere({ detail: 6 });
  this.dropletShader = new GL.Shader('\
    varying vec3 vPos;\
    void main(){\
      vPos = gl_Vertex.xyz;\
      gl_Position = gl_ModelViewProjectionMatrix * gl_Vertex;\
    }\
  ', '\
    uniform vec4 color;\
    void main(){\
      gl_FragColor = color;\
    }\
  ');
  var hasDerivatives = !!gl.getExtension('OES_standard_derivatives');
  this.causticsShader = new GL.Shader('caustics-vertex', 'caustics-fragment');
}

Renderer.prototype.updateCaustics = function(water) {
  if (!this.causticsShader) return;
  var this_ = this;
  this.causticTex.drawTo(function() {
    gl.clear(gl.COLOR_BUFFER_BIT);
    water.textureA.bind(0);
    this_.causticsShader.uniforms({
      light: this_.lightDir,
      water: 0
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
      eye: tracer.eye
    }).draw(this.waterMesh);
  }
  gl.disable(gl.CULL_FACE);
};


Renderer.prototype.renderCube = function() {
  gl.enable(gl.CULL_FACE);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  water.textureA.bind(0);
  this.tileTexture.bind(1);
  this.causticTex.bind(2);
  this.cubeShader.uniforms({
    light: this.lightDir,
    water: 0,
    tiles: 1,
    causticTex: 2
  }).draw(this.cubeMesh);
  gl.disable(gl.CULL_FACE);
  gl.disable(gl.BLEND);
};

// Draw falling droplets (simple spheres)
Renderer.prototype.renderDroplets = function(droplets) {
  if (!droplets || droplets.length === 0) return;
  gl.enable(gl.DEPTH_TEST);
  for (var i = 0; i < droplets.length; i++) {
    var d = droplets[i];
    if (d.dead) continue;
    gl.pushMatrix();
    gl.translate(d.position.x, d.position.y, d.position.z);
    gl.scale(d.radius, d.radius, d.radius);
    this.dropletShader.uniforms({ color: [0.92, 0.95, 0.98, 0.6] }).draw(this.dropletMesh);
    gl.popMatrix();
  }
};
