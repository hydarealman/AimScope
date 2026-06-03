// 连接到 rosbridge
const ros = new ROSLIB.Ros({
    url: 'ws://localhost:9090'   // 根据实际 IP 修改
  });
  
  ros.on('connection', () => {
    document.getElementById('status').textContent = '已连接';
    document.getElementById('status').style.color = '#4ec9b0';
  });
  ros.on('error', (err) => {
    document.getElementById('status').textContent = '错误';
    console.error(err);
  });
  ros.on('close', () => {
    document.getElementById('status').textContent = '断开';
    document.getElementById('status').style.color = 'red';
  });
  
  // ---------- 1. 视觉→电控数据 ----------
  const visAngleSub = new ROSLIB.Topic({
    ros,
    name: '/auto_angle',
    messageType: 'geometry_msgs/Vector3'
  });
  visAngleSub.subscribe((msg) => {
    document.getElementById('vis-angle').textContent = 
      `x:${msg.x.toFixed(4)} y:${msg.y.toFixed(4)} z:${msg.z.toFixed(4)}`;
  });
  
  // ---------- 2. 电控→自瞄数据 ----------
  // 注意：消息类型需根据实际 rm_msgs/RmSerial 定义字段访问
  const imuSub = new ROSLIB.Topic({
    ros,
    name: '/RmSerialData',
    messageType: 'rm_msgs/RmSerial'   // 确保该消息定义在 roslib 中已知（可预先加载）
  });
  imuSub.subscribe((msg) => {
    document.getElementById('imu-roll').textContent  = msg.Roll.toFixed(2);
    document.getElementById('imu-pitch').textContent = msg.Pitch.toFixed(2);
    document.getElementById('imu-yaw').textContent   = msg.Yaw.toFixed(2);
    document.getElementById('imu-camp').textContent  = msg.Camp;
    document.getElementById('imu-shoot').textContent = msg.ShootFlag;
    document.getElementById('imu-bv').textContent    = msg.BulletVec.toFixed(1);
  });
  
  // ---------- 3. 原始相机图像（使用 web_video_server 的视频流最简单） ----------
  // 假设 web_video_server 运行在 8080 端口，话题为 /hikrobot_camera/rgb
  document.getElementById('raw-img').src = 
    'http://localhost:8080/stream?topic=/hikrobot_camera/rgb&type=ros_compressed';
  
  // ---------- 4. 重投影图像（从 rosbridge 订阅 CompressedImage 渲染到 canvas） ----------
  const resultCanvas = document.getElementById('result-canvas');
  const ctx = resultCanvas.getContext('2d');
  const resultSub = new ROSLIB.Topic({
    ros,
    name: '/hikrobot_camera/rgb/compressed',   // 建议发布压缩图像
    messageType: 'sensor_msgs/CompressedImage'
  });
  resultSub.subscribe((msg) => {
    const blob = new Blob([msg.data], { type: 'image/jpeg' });
    const img = new Image();
    img.onload = () => {
      resultCanvas.width = img.width;
      resultCanvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(blob);
  });
  
  // ---------- 5. Debug 数据 ----------
  const dbg0 = new ROSLIB.Topic({ ros, name: '/debugpub',  messageType: 'std_msgs/Float64' });
  const dbg1 = new ROSLIB.Topic({ ros, name: '/debugpub1', messageType: 'std_msgs/Float64' });
  const dbg2 = new ROSLIB.Topic({ ros, name: '/debugpub2', messageType: 'std_msgs/Float64' });
  dbg0.subscribe(msg => document.getElementById('dbg0').textContent = msg.data.toFixed(6));
  dbg1.subscribe(msg => document.getElementById('dbg1').textContent = msg.data.toFixed(6));
  dbg2.subscribe(msg => document.getElementById('dbg2').textContent = msg.data.toFixed(6));
  
  // 定时刷新时间戳
  setInterval(() => {
    document.getElementById('timestamp').textContent = new Date().toLocaleTimeString();
  }, 200);