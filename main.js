/*
 * WebGL Water
 * https://madebyevan.com/webgl-water/
 *
 * Copyright 2011 Evan Wallace
 * Released under the MIT license
 */

function text2html(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
  }
  
  function handleError(text) {
    var html = text2html(text);
    if (html == 'WebGL not supported') {
      html = 'Your browser does not support WebGL.<br>Please see\
      <a href="https://get.webgl.org/get-a-webgl-implementation/">\
      Getting a WebGL Implementation</a>.';
    }
    var loading = document.getElementById('loading');
    loading.innerHTML = html;
    loading.style.zIndex = 1;
  }
  
  window.onerror = handleError;
  
  var gl = GL.create();
  var water;
  var cubemap;
  var renderer;
  var angleX = -25;
  var angleY = -200.5;
  
  // Removed sphere physics and pause functionality
  
  window.onload = function() {
    var ratio = window.devicePixelRatio || 1;
  
    function onresize() {
      var width = innerWidth ;
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
    // 밝은 배경색 (연한 청록색/회색 계열)
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
  
    // Start with clean water surface
  
    document.getElementById('loading').innerHTML = '';
    onresize();
  
    var requestAnimationFrame =
      window.requestAnimationFrame ||
      window.webkitRequestAnimationFrame ||
      function(callback) { setTimeout(callback, 0); };
  
    var prevTime = new Date().getTime();
    function animate() {
      var nextTime = new Date().getTime();
      update((nextTime - prevTime) / 1000);
      draw();
      prevTime = nextTime;
      requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
  
    window.onresize = onresize;
  
    var isDrawing = false;
    var isRotating = false;
    var oldX, oldY;
  
    function startDrag(x, y) {
      oldX = x;
      oldY = y;
      var tracer = new GL.Raytracer();
      var ray = tracer.getRayForPixel(x * ratio, y * ratio);
      var pointOnPlane = tracer.eye.add(ray.multiply(-tracer.eye.y / ray.y));
      if (Math.abs(pointOnPlane.x) < 1 && Math.abs(pointOnPlane.z) < 1) {
        isDrawing = true;
        duringDrag(x, y);
      } else {
        isRotating = true;
      }
    }
  
    function duringDrag(x, y) {
      if (isDrawing) {
        var tracer = new GL.Raytracer();
        var ray = tracer.getRayForPixel(x * ratio, y * ratio);
        var pointOnPlane = tracer.eye.add(ray.multiply(-tracer.eye.y / ray.y));
        // radius: 파동 퍼지는 크기, strength: 파동 높이
        water.addDrop(pointOnPlane.x, pointOnPlane.z, 0.045, 0.1);
      } else if (isRotating) {
        angleY -= x - oldX;
        angleX -= y - oldY;
        angleX = Math.max(-89.999, Math.min(89.999, angleX));
        oldX = x;
        oldY = y;
      }
    }
  
    function stopDrag() {
      isDrawing = false;
      isRotating = false;
    }
  
    document.onmousedown = function(e) {
        e.preventDefault();
        startDrag(e.pageX, e.pageY);
      }
  
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
  
    function update(seconds) {
      if (seconds > 1) return;
  
      // Update the water simulation and graphics
      water.stepSimulation();
      water.stepSimulation();
      water.updateNormals();
      renderer.updateCaustics(water);
    }
  
    function draw() {
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.loadIdentity();
      gl.translate(0, 0, -4);
      gl.rotate(-angleX, 1, 0, 0);
      gl.rotate(-angleY, 0, 1, 0);
      gl.translate(0, 0.5, 0);
  
      gl.enable(gl.DEPTH_TEST);
      renderer.sphereCenter = new GL.Vector(0, -2, 0); // Move sphere out of view
      renderer.sphereRadius = 0;
      renderer.renderCube();
      renderer.renderWater(water, cubemap);
      gl.disable(gl.DEPTH_TEST);
    }
  };
  