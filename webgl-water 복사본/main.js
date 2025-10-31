  
  var gl = GL.create();
  var water;
  var cubemap;
  var renderer;
  var angleX = -25;
  var angleY = -200.5;
  
var paused = false;
var randomEnabled = true;
  
  // simple droplet system
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
    gl.clearColor(0.85, 0.85, 0.85, 1);
  
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
        // spawn first droplet and enter continuous-drop mode while dragging
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
            if (now - lastDragDropTime > 70) { // ~14 drops/sec while dragging
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
      e.preventDefault();
      startDrag(e.touches[0].pageX, e.touches[0].pageY);
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
  
    var frame = 0;
  
    function update(seconds) {
      if (seconds > 1) return;
      frame += seconds * 2;
      dropTimer += seconds;
      if (randomEnabled && dropTimer >= 1.0) {
        dropTimer = 0;
        var x = Math.random() * 1.8 - 0.9;
        var z = Math.random() * 1.8 - 0.9;
        droplets.push(new Droplet(x, z));
      }
  
      // Update the water simulation and graphics
      water.stepSimulation();
      water.stepSimulation();
      water.updateNormals();
      renderer.updateCaustics(water);
      // simulate droplets
      for (var i = 0; i < droplets.length; i++) {
        var d = droplets[i];
        if (d.dead) continue;
        d.velocity.y -= 9.8 * seconds * 0.25; // gravity
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
      gl.translate(0, 0, -4);
      gl.rotate(-angleX, 1, 0, 0);
      gl.rotate(-angleY, 0, 1, 0);
      gl.translate(0, 0.5, 0);
  
      gl.enable(gl.DEPTH_TEST);
      renderer.renderCube();
      renderer.renderWater(water, cubemap);
      renderer.renderDroplets(droplets);
      gl.disable(gl.DEPTH_TEST);
    }
  };
  