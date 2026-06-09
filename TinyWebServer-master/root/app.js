/**
 * AimScope v2.0 — 自瞄调试面板
 * Vue 3 + ROS Bridge + Three.js 3D 可视化
 */
document.addEventListener('DOMContentLoaded', () => {
  const { createApp, ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } = Vue;

  const app = createApp({
    setup() {
      // ============================================================
      // 主题系统
      // ============================================================
      const theme = ref(localStorage.getItem('aimscope-theme') || 'dark');
      function applyTheme(t) {
        document.documentElement.setAttribute('data-theme', t);
        localStorage.setItem('aimscope-theme', t);
      }
      applyTheme(theme.value);
      function toggleTheme() {
        theme.value = theme.value === 'dark' ? 'light' : 'dark';
        applyTheme(theme.value);
      }

      // ============================================================
      // 连接状态
      // ============================================================
      const rosUrl = 'ws://192.168.186.136:9090';
      const connStatus = ref('连接中...');
      const connClass = ref('connecting');

      // ============================================================
      // 响应式数据
      // ============================================================
      const imuData = reactive({
        roll: 0, pitch: 0, yaw: 0,
        camp: 0, shoot: false, bulletVec: 0
      });
      const angleData = reactive({ x: 0, y: 0, z: 0 });
      const debugData = reactive({ dbg0: 0, dbg1: 0, dbg2: 0 });
      const timestamp = ref('');
      const activeView = ref('raw');
      const displayFps = ref(0);
      const rawFps = ref(0);
      const resultFps = ref(0);

      // 闪烁动画标记
      const flashKeys = reactive({ roll: false, pitch: false, yaw: false });
      let prevImu = { roll: 0, pitch: 0, yaw: 0 };
      function triggerFlash(key) {
        flashKeys[key] = true;
        setTimeout(() => { flashKeys[key] = false; }, 400);
      }

      // 图像接收状态
      const rawImgReceived = ref(false);
      const resultImgReceived = ref(false);

      // ============================================================
      // Canvas 引用 (template refs)
      // ============================================================
      const rawCanvas = ref(null);
      const resultCanvas = ref(null);
      const mainContent = ref(null);
      const threeContainer = ref(null);
      const threeReady = ref(false);

      // ============================================================
      // FPS 计数器
      // ============================================================
      let rawFpsCount = 0;
      let resultFpsCount = 0;
      let fpsTimer = 0;
      function startFpsCounter() {
        fpsTimer = setInterval(() => {
          rawFps.value = rawFpsCount; rawFpsCount = 0;
          resultFps.value = resultFpsCount; resultFpsCount = 0;
          displayFps.value = rawFps.value + resultFps.value;
        }, 1000);
      }

      // ============================================================
      // 图像解码（保留原有 Base64 修复逻辑）
      // ============================================================
      function decodeImageData(msgData) {
        let imageData;
        if (typeof msgData === 'string') {
          const binaryString = atob(msgData);
          imageData = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            imageData[i] = binaryString.charCodeAt(i);
          }
        } else if (Array.isArray(msgData)) {
          imageData = new Uint8Array(msgData);
        } else if (msgData instanceof Uint8Array) {
          imageData = msgData;
        } else {
          console.error('[AimScope] 未知的图像数据类型:', typeof msgData);
          return null;
        }
        return imageData;
      }

      function renderToCanvas(canvas, imageData, label) {
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const blob = new Blob([imageData], { type: 'image/jpeg' });
        const img = new Image();
        img.onload = () => {
          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);
          URL.revokeObjectURL(img.src);
        };
        img.onerror = (err) => {
          console.error(`[AimScope] ${label} 图像解码失败`, err);
          URL.revokeObjectURL(img.src);
        };
        img.src = URL.createObjectURL(blob);
      }

      // ============================================================
      // ROS 连接（保持 roslib 对象在 Vue 响应式系统之外）
      // ============================================================
      let ros = null;

      function connectROS() {
        ros = new ROSLIB.Ros({ url: rosUrl });

        ros.on('connection', () => {
          connStatus.value = '已连接';
          connClass.value = 'connected';
        });
        ros.on('error', (err) => {
          connStatus.value = '错误';
          connClass.value = 'disconnected';
          console.error('[AimScope] ROS 连接错误:', err);
        });
        ros.on('close', () => {
          connStatus.value = '断开';
          connClass.value = 'disconnected';
        });

        // 1. 视觉 → 电控 角度
        new ROSLIB.Topic({
          ros, name: '/auto_angle', messageType: 'geometry_msgs/Vector3'
        }).subscribe(msg => {
          angleData.x = msg.x;
          angleData.y = msg.y;
          angleData.z = msg.z;
        });

        // 2. 电控 → 自瞄 串口数据
        new ROSLIB.Topic({
          ros, name: '/RmSerialData', messageType: 'rm_msgs/RmSerial'
        }).subscribe(msg => {
          const newRoll = msg.Roll;
          const newPitch = msg.Pitch;
          const newYaw = msg.Yaw;

          if (Math.abs(newRoll - prevImu.roll) > 0.05) triggerFlash('roll');
          if (Math.abs(newPitch - prevImu.pitch) > 0.05) triggerFlash('pitch');
          if (Math.abs(newYaw - prevImu.yaw) > 0.3) triggerFlash('yaw');

          imuData.roll = newRoll;
          imuData.pitch = newPitch;
          imuData.yaw = newYaw;
          imuData.camp = msg.Camp;
          imuData.shoot = msg.ShootFlag === 1;
          imuData.bulletVec = msg.BulletVec;

          prevImu.roll = newRoll;
          prevImu.pitch = newPitch;
          prevImu.yaw = newYaw;

          update3DScene();
        });

        // 3-5. Debug 数据
        new ROSLIB.Topic({
          ros, name: '/debugpub', messageType: 'std_msgs/Float64'
        }).subscribe(msg => { debugData.dbg0 = msg.data; });

        new ROSLIB.Topic({
          ros, name: '/debugpub1', messageType: 'std_msgs/Float64'
        }).subscribe(msg => { debugData.dbg1 = msg.data; });

        new ROSLIB.Topic({
          ros, name: '/debugpub2', messageType: 'std_msgs/Float64'
        }).subscribe(msg => { debugData.dbg2 = msg.data; });

        // 6. 原始相机图像
        new ROSLIB.Topic({
          ros, name: '/hikrobot_camera/rgb/compressed',
          messageType: 'sensor_msgs/CompressedImage'
        }).subscribe(msg => {
          const imageData = decodeImageData(msg.data);
          if (!imageData) return;
          rawImgReceived.value = true;
          rawFpsCount++;
          // 只在当前显示原始画面时才渲染，避免隐藏 canvas 上浪费绘制
          if (activeView.value === 'raw') {
            renderToCanvas(rawCanvas.value, imageData, 'Raw');
          }
        });

        // 7. 重投影图像
        new ROSLIB.Topic({
          ros, name: '/tracker/result_image/compressed',
          messageType: 'sensor_msgs/CompressedImage'
        }).subscribe(msg => {
          const imageData = decodeImageData(msg.data);
          if (!imageData) return;
          resultImgReceived.value = true;
          resultFpsCount++;
          if (activeView.value === 'result') {
            renderToCanvas(resultCanvas.value, imageData, 'Result');
          }
        });
      }

      // ============================================================
      // 时间戳更新
      // ============================================================
      let tsTimer = null;
      function startTimestamp() {
        tsTimer = setInterval(() => {
          timestamp.value = new Date().toLocaleTimeString();
        }, 200);
      }

      // ============================================================
      // Three.js 3D 场景
      // ============================================================
      let threeScene = null;
      let threeRenderer = null;
      let threeCamera = null;
      let threeAnimId = null;
      let threeResizeObs = null;
      // 鼠标拖拽旋转
      let dragState = { isDragging: false, prevX: 0, prevY: 0, theta: 0.8, phi: 0.6, radius: 5.5 };
      // 3D 场景对象
      let gimbalYaw = null;
      let gimbalPitch = null;
      let targetSphere = null;
      let muzzleMat = null;
      let targetMat = null;

      function init3D() {
        if (threeReady.value) return;
        const container = threeContainer.value;
        if (!container || typeof THREE === 'undefined') return;

        try {
          threeScene = new THREE.Scene();
          threeScene.background = new THREE.Color(0x0a0e17);
          threeScene.fog = new THREE.Fog(0x0a0e17, 5, 20);

          const w = container.clientWidth || 640;
          const h = container.clientHeight || 480;
          threeCamera = new THREE.PerspectiveCamera(50, w / h, 0.1, 50);
          threeCamera.position.set(3, 2.5, 5);
          threeCamera.lookAt(0, 0.4, 0);

          threeRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
          threeRenderer.setSize(w, h);
          threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
          threeRenderer.shadowMap.enabled = true;
          container.appendChild(threeRenderer.domElement);

          // 鼠标拖拽旋转
          const canvas = threeRenderer.domElement;
          canvas.style.cursor = 'grab';
          canvas.addEventListener('mousedown', onMouseDown);
          canvas.addEventListener('mousemove', onMouseMove);
          canvas.addEventListener('mouseup', onMouseUp);
          canvas.addEventListener('mouseleave', onMouseUp);
          canvas.addEventListener('wheel', onWheel, { passive: false });

          // 灯光
          threeScene.add(new THREE.AmbientLight(0x1a2a4a, 1.2));
          const dirLight = new THREE.DirectionalLight(0x00e5ff, 1.5);
          dirLight.position.set(5, 8, 3);
          dirLight.castShadow = true;
          threeScene.add(dirLight);
          const ptLight = new THREE.PointLight(0x6366f1, 1, 8);
          ptLight.position.set(0, 2, 0);
          threeScene.add(ptLight);

          // 网格地面
          threeScene.add(new THREE.PolarGridHelper(4, 32, 24, 64, 0x1e2d45, 0x1e2d45));

          // --- 构建云台模型 ---
          const gimbalGroup = new THREE.Group();

          // 底座
          const baseGeo = new THREE.CylinderGeometry(0.3, 0.35, 0.15, 32);
          const baseMesh = new THREE.Mesh(baseGeo, new THREE.MeshStandardMaterial({
            color: 0x1e2d45, roughness: 0.4, metalness: 0.8
          }));
          baseMesh.position.y = -0.05;
          baseMesh.castShadow = true;
          baseMesh.receiveShadow = true;
          gimbalGroup.add(baseMesh);

          // Yaw 组
          gimbalYaw = new THREE.Group();
          gimbalGroup.add(gimbalYaw);

          // 立柱
          const pillarGeo = new THREE.BoxGeometry(0.06, 0.35, 0.06);
          const pillarMat = new THREE.MeshStandardMaterial({
            color: 0x334155, roughness: 0.3, metalness: 0.9
          });
          const lp = new THREE.Mesh(pillarGeo, pillarMat);
          lp.position.set(-0.18, 0.2, 0);
          lp.castShadow = true;
          gimbalYaw.add(lp);
          const rp = new THREE.Mesh(pillarGeo, pillarMat);
          rp.position.set(0.18, 0.2, 0);
          rp.castShadow = true;
          gimbalYaw.add(rp);

          // Pitch 组
          gimbalPitch = new THREE.Group();
          gimbalPitch.position.y = 0.35;
          gimbalYaw.add(gimbalPitch);

          // 枪管
          const barrelGeo = new THREE.CylinderGeometry(0.03, 0.04, 0.7, 16);
          barrelGeo.rotateX(Math.PI / 2);
          const barrel = new THREE.Mesh(barrelGeo, new THREE.MeshStandardMaterial({
            color: 0x64748b, roughness: 0.25, metalness: 0.95
          }));
          barrel.position.z = -0.35;
          barrel.castShadow = true;
          gimbalPitch.add(barrel);

          // 枪口发光环
          muzzleMat = new THREE.MeshStandardMaterial({
            color: 0x00e5ff, roughness: 0.2, metalness: 0.3,
            emissive: 0x00e5ff, emissiveIntensity: 0.8
          });
          const muzzleRing = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.01, 8, 16), muzzleMat);
          muzzleRing.position.z = -0.7;
          gimbalPitch.add(muzzleRing);

          // 瞄准线
          const aimLineGeo = new THREE.BufferGeometry();
          aimLineGeo.setAttribute('position',
            new THREE.BufferAttribute(new Float32Array([0, 0.35, -0.7, 0, 0.35, -3.0]), 3));
          const aimLine = new THREE.Line(aimLineGeo, new THREE.LineBasicMaterial({
            color: 0x00e5ff, transparent: true, opacity: 0.5
          }));
          gimbalPitch.add(aimLine);

          // 目标球
          targetMat = new THREE.MeshStandardMaterial({
            color: 0xf87171, roughness: 0.3, metalness: 0.2,
            emissive: 0xf87171, emissiveIntensity: 0.6
          });
          targetSphere = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 16), targetMat);
          targetSphere.position.set(0, 0.3, -2.5);
          threeScene.add(targetSphere);

          const crossRing = new THREE.Mesh(
            new THREE.TorusGeometry(0.12, 0.015, 8, 16),
            new THREE.MeshStandardMaterial({ color: 0xf87171, roughness: 0.3, emissive: 0xf87171, emissiveIntensity: 0.4 })
          );
          targetSphere.add(crossRing);

          threeScene.add(gimbalGroup);
          threeReady.value = true;

          // 动画循环
          function animate() {
            threeAnimId = requestAnimationFrame(animate);
            updateCameraPosition();
            const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.01);
            if (muzzleMat) muzzleMat.emissiveIntensity = 0.4 + pulse * 1.2;
            if (targetMat) targetMat.emissiveIntensity = 0.3 + pulse * 0.8;
            threeRenderer.render(threeScene, threeCamera);
          }
          animate();

          // Resize
          threeResizeObs = new ResizeObserver(() => {
            if (!threeRenderer || !threeCamera || !container) return;
            const cw = container.clientWidth;
            const ch = container.clientHeight;
            threeRenderer.setSize(cw, ch);
            threeCamera.aspect = cw / Math.max(ch, 1);
            threeCamera.updateProjectionMatrix();
          });
          threeResizeObs.observe(container);
        } catch (e) {
          console.error('[AimScope] 3D 初始化失败:', e);
          threeReady.value = false;
        }
      }

      function updateCameraPosition() {
        if (!threeCamera) return;
        const d = dragState;
        threeCamera.position.x = d.radius * Math.sin(d.phi) * Math.cos(d.theta);
        threeCamera.position.y = d.radius * Math.cos(d.phi);
        threeCamera.position.z = d.radius * Math.sin(d.phi) * Math.sin(d.theta);
        threeCamera.lookAt(0, 0.4, 0);
      }

      function onMouseDown(e) {
        dragState.isDragging = true;
        dragState.prevX = e.clientX;
        dragState.prevY = e.clientY;
        e.target.style.cursor = 'grabbing';
      }
      function onMouseMove(e) {
        if (!dragState.isDragging) return;
        const dx = e.clientX - dragState.prevX;
        const dy = e.clientY - dragState.prevY;
        dragState.theta -= dx * 0.005;
        dragState.phi = Math.max(0.15, Math.min(1.4, dragState.phi - dy * 0.005));
        dragState.prevX = e.clientX;
        dragState.prevY = e.clientY;
      }
      function onMouseUp(e) {
        dragState.isDragging = false;
        if (e && e.target) e.target.style.cursor = 'grab';
      }
      function onWheel(e) {
        e.preventDefault();
        dragState.radius = Math.max(2, Math.min(12, dragState.radius + e.deltaY * 0.01));
      }

      function update3DScene() {
        if (!gimbalYaw || !gimbalPitch || !targetSphere) return;
        gimbalYaw.rotation.y = imuData.yaw;
        gimbalPitch.rotation.x = -imuData.pitch;

        const dist = 2.5;
        const tx = angleData.x * dist;
        const ty = angleData.y * dist + 0.3;
        const tz = -Math.cos(angleData.x) * dist;
        targetSphere.position.lerp(new THREE.Vector3(tx, ty, tz), 0.3);
      }

      function destroy3D() {
        if (threeAnimId) cancelAnimationFrame(threeAnimId);
        if (threeResizeObs) threeResizeObs.disconnect();
        if (threeRenderer) {
          const canvas = threeRenderer.domElement;
          canvas.removeEventListener('mousedown', onMouseDown);
          canvas.removeEventListener('mousemove', onMouseMove);
          canvas.removeEventListener('mouseup', onMouseUp);
          canvas.removeEventListener('mouseleave', onMouseUp);
          canvas.removeEventListener('wheel', onWheel);
          threeRenderer.dispose();
          if (threeContainer.value && canvas.parentElement) {
            threeContainer.value.removeChild(canvas);
          }
        }
        threeScene = null;
        threeRenderer = null;
        threeCamera = null;
        threeResizeObs = null;
        gimbalYaw = null;
        gimbalPitch = null;
        targetSphere = null;
        muzzleMat = null;
        targetMat = null;
        threeReady.value = false;
      }

      // ============================================================
      // 生命周期
      // ============================================================
      onMounted(() => {
        connectROS();
        startFpsCounter();
        startTimestamp();
      });

      onUnmounted(() => {
        if (ros) ros.close();
        if (tsTimer) clearInterval(tsTimer);
        if (fpsTimer) clearInterval(fpsTimer);
        destroy3D();
      });

      // 视图切换时初始化/销毁 3D
      watch(activeView, (newVal, oldVal) => {
        if (newVal === '3d') {
          nextTick(() => init3D());
        } else if (oldVal === '3d') {
          destroy3D();
        }
      });

      // ============================================================
      // 暴露给模板
      // ============================================================
      return {
        theme, toggleTheme,
        connStatus, connClass, rosUrl,
        imuData, angleData, debugData, flashKeys,
        timestamp, displayFps, rawFps, resultFps,
        activeView, rawImgReceived, resultImgReceived, threeReady,
        rawCanvas, resultCanvas, mainContent, threeContainer,
        init3D,
      };
    }
  });

  app.mount('#app');
});
