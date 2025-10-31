// ============================================================================
// Cubemap Class
// ============================================================================
function Cubemap(images) {
  this.id = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.id);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_CUBE_MAP_NEGATIVE_X, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, images.xneg);
  gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, images.xpos);
  gl.texImage2D(gl.TEXTURE_CUBE_MAP_NEGATIVE_Y, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, images.yneg);
  gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_Y, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, images.ypos);
  gl.texImage2D(gl.TEXTURE_CUBE_MAP_NEGATIVE_Z, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, images.zneg);
  gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_Z, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, images.zpos);
}

Cubemap.prototype.bind = function(unit) {
  gl.activeTexture(gl.TEXTURE0 + (unit || 0));
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.id);
};

Cubemap.prototype.unbind = function(unit) {
  gl.activeTexture(gl.TEXTURE0 + (unit || 0));
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);
};

// ============================================================================
// Water Class
// ============================================================================
function Water() {
  this.plane = GL.Mesh.plane();
  if (!GL.Texture.canUseFloatingPointTextures()) {
    throw new Error('This demo requires the OES_texture_float extension');
  }
  var filter = GL.Texture.canUseFloatingPointLinearFiltering() ? gl.LINEAR : gl.NEAREST;
  this.textureA = new GL.Texture(256, 256, { type: gl.FLOAT, filter: filter });
  this.textureB = new GL.Texture(256, 256, { type: gl.FLOAT, filter: filter });
  if ((!this.textureA.canDrawTo() || !this.textureB.canDrawTo()) && GL.Texture.canUseHalfFloatingPointTextures()) {
    filter = GL.Texture.canUseHalfFloatingPointLinearFiltering() ? gl.LINEAR : gl.NEAREST;
    this.textureA = new GL.Texture(256, 256, { type: gl.HALF_FLOAT_OES, filter: filter });
    this.textureB = new GL.Texture(256, 256, { type: gl.HALF_FLOAT_OES, filter: filter });
  }
  
  // Use shaders from HTML
  this.dropShader = new GL.Shader('water-vertex', 'water-drop-fragment');
  this.updateShader = new GL.Shader('water-vertex', 'water-update-fragment');
  this.normalShader = new GL.Shader('water-vertex', 'water-normal-fragment');
}

Water.prototype.addDrop = function(x, y, radius, strength) {
  var this_ = this;
  this.textureB.drawTo(function() {
    this_.textureA.bind();
    this_.dropShader.uniforms({
      center: [x, y],
      radius: radius,
      strength: strength
    }).draw(this_.plane);
  });
  this.textureB.swapWith(this.textureA);
};

Water.prototype.stepSimulation = function() {
  var this_ = this;
  this.textureB.drawTo(function() {
    this_.textureA.bind();
    this_.updateShader.uniforms({
      delta: [1 / this_.textureA.width, 1 / this_.textureA.height]
    }).draw(this_.plane);
  });
  this.textureB.swapWith(this.textureA);
};

Water.prototype.updateNormals = function() {
  var this_ = this;
  this.textureB.drawTo(function() {
    this_.textureA.bind();
    this_.normalShader.uniforms({
      delta: [1 / this_.textureA.width, 1 / this_.textureA.height]
    }).draw(this_.plane);
  });
  this.textureB.swapWith(this.textureA);
};

// ============================================================================
// Renderer Class
// ============================================================================
function Renderer() {
  this.tileTexture = GL.Texture.fromImage(document.getElementById('tiles'), {
    minFilter: gl.LINEAR_MIPMAP_LINEAR,
    wrap: gl.REPEAT,
    format: gl.RGB
  });
  // Directional light
  this.lightDir = new GL.Vector(0.0, -1.0, 0.0).unit();
  this.causticTex = new GL.Texture(1024, 1024);
  this.waterMesh = GL.Mesh.plane({ detail: 200 });
  
  // Load helper functions and create water shaders
  var helperFunctions = document.getElementById('helper-functions').text;
  this.waterShaders = [];
  this.waterShaders[0] = new GL.Shader('water-surface-vertex', helperFunctions + '\n' + document.getElementById('water-surface-abovewater-fragment').text);
  this.waterShaders[1] = new GL.Shader('water-surface-vertex', helperFunctions + '\n' + document.getElementById('water-surface-underwater-fragment').text);
  
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
  
  // Droplet rendering
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
    causticTex: 2,
    sphereCenter: this.sphereCenter,
    sphereRadius: this.sphereRadius
  }).draw(this.cubeMesh);
  gl.disable(gl.BLEND);
  gl.disable(gl.CULL_FACE);
};

Renderer.prototype.renderDroplets = function(droplets) {
  if (!droplets || droplets.length === 0) return;
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  for (var i = 0; i < droplets.length; i++) {
    var d = droplets[i];
    if (d.dead) continue;
    gl.pushMatrix();
    gl.translate(d.position.x, d.position.y, d.position.z);
    gl.scale(d.radius, d.radius, d.radius);
    this.dropletShader.uniforms({ color: [0.92, 0.95, 0.98, 0.6] }).draw(this.dropletMesh);
    gl.popMatrix();
  }
  gl.disable(gl.BLEND);
};

// ============================================================================
// Main Application
// ============================================================================
var gl = GL.create();
var water;
var cubemap;
var renderer;
var angleX = -25;
var angleY = -200.5;

var paused = false;
var randomEnabled = true;

// Droplet system
function Droplet(x, z) {
  this.position = new GL.Vector(x, 1.5, z);
  this.velocity = new GL.Vector(0, -1.5, 0);
  this.radius = 0.03;
  this.dead = false;
}

var droplets = [];

window.onload = function() {
  var ratio = window.devicePixelRatio || 1;

  function onresize() {
    var width = innerWidth;
    var height = innerHeight;
    gl.canvas.width = width * ratio;
    gl.canvas.height = height * ratio;
    gl.canvas.style.width = width + 'px';
    gl.canvas.style.height = height + 'px';
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.matrixMode(gl.PROJECTION);
    gl.loadIdentity();
    gl.perspective(45, gl.canvas.width / gl.canvas.height, 0.01, 100);
    gl.matrixMode(gl.MODELVIEW);
    draw();
  }

  document.body.appendChild(gl.canvas);
  gl.clearColor(0.82, 0.85, 0.88, 1.0);

  water = new Water();
  renderer = new Renderer();
  cubemap = new Cubemap({
    xneg: document.getElementById('xneg'),
    xpos: document.getElementById('xpos'),
    yneg: document.getElementById('ypos'),
    ypos: document.getElementById('ypos'),
    zneg: document.getElementById('zneg'),
    zpos: document.getElementById('zpos')
  });

  if (!water.textureA.canDrawTo() || !water.textureB.canDrawTo()) {
    throw new Error('Rendering to floating-point textures is required but not supported');
  }

  document.getElementById('loading').innerHTML = '';
  onresize();

  var requestAnimationFrame =
    window.requestAnimationFrame ||
    window.webkitRequestAnimationFrame ||
    function(callback) { setTimeout(callback, 0); };

  var prevTime = new Date().getTime();
  var dropTimer = 0;
  function animate() {
    var nextTime = new Date().getTime();
    if (!paused) {
      update((nextTime - prevTime) / 1000);
      draw();
    }
    prevTime = nextTime;
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);

  window.onresize = onresize;

  var oldX, oldY;
  var mode = -1;
  var MODE_ADD_DROPS = 0;
  var MODE_ORBIT_CAMERA = 1;
  var lastDragDropTime = 0;

  function startDrag(x, y) {
    oldX = x;
    oldY = y;
    var tracer = new GL.Raytracer();
    var ray = tracer.getRayForPixel(x * ratio, y * ratio);
    var pointOnPlane = tracer.eye.add(ray.multiply(-tracer.eye.y / ray.y));
    
    if (Math.abs(pointOnPlane.x) < 1 && Math.abs(pointOnPlane.z) < 1) {
      droplets.push(new Droplet(pointOnPlane.x, pointOnPlane.z));
      lastDragDropTime = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      mode = MODE_ADD_DROPS;
    } else {
      mode = MODE_ORBIT_CAMERA;
    }
  }

  function duringDrag(x, y) {
    switch (mode) {
      case MODE_ADD_DROPS: {
        var tracer = new GL.Raytracer();
        var ray = tracer.getRayForPixel(x * ratio, y * ratio);
        var p = tracer.eye.add(ray.multiply(-tracer.eye.y / ray.y));
        if (Math.abs(p.x) < 1 && Math.abs(p.z) < 1) {
          var now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
          if (now - lastDragDropTime > 70) {
            droplets.push(new Droplet(p.x, p.z));
            lastDragDropTime = now;
          }
        }
        break;
      }
      case MODE_ORBIT_CAMERA: {
        angleY -= x - oldX;
        angleX -= y - oldY;
        angleX = Math.max(-89.999, Math.min(89.999, angleX));
        oldX = x;
        oldY = y;
        break;
      }
    }
    if (paused) draw();
  }

  function stopDrag() {
    mode = -1;
  }

  document.onmousedown = function(e) {
    e.preventDefault();
    startDrag(e.pageX, e.pageY);
  };

  document.onmousemove = function(e) {
    duringDrag(e.pageX, e.pageY);
  };

  document.onmouseup = function() {
    stopDrag();
  };

  document.ontouchstart = function(e) {
    if (e.touches.length === 1) {
      e.preventDefault();
      startDrag(e.touches[0].pageX, e.touches[0].pageY);
    }
  };

  document.ontouchmove = function(e) {
    if (e.touches.length === 1) {
      duringDrag(e.touches[0].pageX, e.touches[0].pageY);
    }
  };

  document.ontouchend = function(e) {
    if (e.touches.length == 0) {
      stopDrag();
    }
  };

  document.onkeydown = function(e) {
    if (e.which == ' '.charCodeAt(0)) paused = !paused;
  };
  
  var btn = document.getElementById('randBtn');
  if (btn) {
    btn.textContent = 'Random Drops: On';
    btn.onclick = function(){
      randomEnabled = !randomEnabled;
      btn.textContent = 'Random Drops: ' + (randomEnabled ? 'On' : 'Off');
      if (randomEnabled) btn.classList.remove('off'); else btn.classList.add('off');
    };
  }

  function update(seconds) {
    if (seconds > 1) return;
    dropTimer += seconds;
    
    // Random droplets
    if (randomEnabled && dropTimer >= 1.0) {
      dropTimer = 0;
      var x = Math.random() * 1.8 - 0.9;
      var z = Math.random() * 1.8 - 0.9;
      droplets.push(new Droplet(x, z));
    }

    // Water simulation
    water.stepSimulation();
    water.stepSimulation();
    water.updateNormals();
    renderer.updateCaustics(water);
    
    // Droplet simulation
    for (var i = 0; i < droplets.length; i++) {
      var d = droplets[i];
      if (d.dead) continue;
      d.velocity.y -= 9.8 * seconds * 0.25;
      d.position = d.position.add(d.velocity.multiply(seconds));
      if (d.position.y <= 0.0) {
        water.addDrop(d.position.x, d.position.z, 0.03, 0.0025);
        d.dead = true;
      }
    }
  }

  function draw() {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.loadIdentity();
    gl.translate(0, 0, -2.5);
    gl.rotate(-angleX, 1, 0, 0);
    gl.rotate(-angleY, 0, 1, 0);
    gl.translate(0, 0.5, 0);

    gl.enable(gl.DEPTH_TEST);
    renderer.sphereCenter = new GL.Vector(0, -2, 0);
    renderer.sphereRadius = 0;
    renderer.renderCube();
    renderer.renderWater(water, cubemap);
    renderer.renderDroplets(droplets);
    gl.disable(gl.DEPTH_TEST);
  }
};
