// 等待 DOM 加载完毕后执行（确保 canvas 已存在）
document.addEventListener('DOMContentLoaded', () => {
  const ros = new ROSLIB.Ros({ url: 'ws://192.168.186.136:9090' });

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

  // 视觉→电控
  new ROSLIB.Topic({ ros, name: '/auto_angle', messageType: 'geometry_msgs/Vector3' }).subscribe(msg => {
    document.getElementById('vis-angle').textContent = `x:${msg.x.toFixed(4)} y:${msg.y.toFixed(4)} z:${msg.z.toFixed(4)}`;
  });

  // 电控→自瞄
  new ROSLIB.Topic({ ros, name: '/RmSerialData', messageType: 'rm_msgs/RmSerial' }).subscribe(msg => {
    document.getElementById('imu-roll').textContent  = msg.Roll.toFixed(2);
    document.getElementById('imu-pitch').textContent = msg.Pitch.toFixed(2);
    document.getElementById('imu-yaw').textContent   = msg.Yaw.toFixed(2);
    document.getElementById('imu-camp').textContent  = msg.Camp;
    document.getElementById('imu-shoot').textContent = msg.ShootFlag;
    document.getElementById('imu-bv').textContent    = msg.BulletVec.toFixed(1);
  });

  // // 原始相机图像（已验证可用的代码）
  // const rawCanvas = document.getElementById('raw-canvas');
  // if (rawCanvas) {
  //   const rawCtx = rawCanvas.getContext('2d');
  //   new ROSLIB.Topic({ ros, name: '/hikrobot_camera/rgb/compressed', messageType: 'sensor_msgs/CompressedImage' }).subscribe(msg => {
  //     const blob = new Blob([new Uint8Array(msg.data)], { type: 'image/jpeg' });
  //     const img = new Image();
  
  //     const first10 = new Uint8Array(msg.data).slice(0,10);
  //     console.log('前10字节：', Array.from(first10));

  //     img.onload = () => {
  //       rawCanvas.width = img.width;
  //       rawCanvas.height = img.height;
  //       rawCtx.drawImage(img, 0, 0);
  //       URL.revokeObjectURL(img.src);
  //     };
  //     img.src = URL.createObjectURL(blob);
  //   });
  // } else {
  //   console.error('raw-canvas 不存在');
  // }

  // // 重投影图像
  // const resultCanvas = document.getElementById('result-canvas');
  // if (resultCanvas) {
  //   const resultCtx = resultCanvas.getContext('2d');
  //   new ROSLIB.Topic({ ros, name: '/tracker/result_image/compressed', messageType: 'sensor_msgs/CompressedImage' }).subscribe(msg => {
  //     const blob = new Blob([new Uint8Array(msg.data)], { type: 'image/jpeg' });
  //     const img = new Image();
  //     img.onload = () => {
  //       resultCanvas.width = img.width;
  //       resultCanvas.height = img.height;
  //       resultCtx.drawImage(img, 0, 0);
  //       URL.revokeObjectURL(img.src);
  //     };
  //     img.src = URL.createObjectURL(blob);
  //   });
  // }


  // bug1: 
  /*
    数据路径: 
    Python 节点 → ROS 消息（CompressedImage.data = list(jpg_bytes)） 
         → rosbridge（WebSocket）→ 浏览器 JavaScript
  
    1.Python节点发送的数据
      在Python节点中
      raw_msg.data = list(jpg_bytes)   # jpg_bytes 是 bytes 类型
      jpg_bytes 是 JPEG 编码后的字节串，例如 b'\xff\xd8\xff...'。
      list(jpg_bytes) 把这个字节串转换成了一个 Python 整数列表，例如 [255, 216, 255, ...]。
      所以Python发送的是一个非常大的整数数组


    2.rosbridge的自动转换
    list(jpg_bytes) 把这个字节串转换成了一个 Python 整数列表，例如 [255, 216, 255, ...]。
    对于uint8[]类型的字段,rosbridge默认会进行Base64编码(为了节省带宽和避免JASON数组过大)
    也就是说,发送的数组,在rosbridge发往浏览器之前,被自动转换成了一个Base64子夫差un
  
    这是关键：浏览器收到的 msg.data 不是数组，而是一个 Base64 字符串。

    在JavaScript中,new Uint8Array(string)会将字符串当作字符数组来创建
    但是Base64字符串包含大量非new Uint8Array(string) 这些字符的 Unicode 码点并不是原始 JPEG 字节值
    结果得到的Uint8Array是无效的二进制数据,长度也可能为0

    为 new Uint8Array(msg.data) 对 Base64 字符串无效，所以first10的长度为0,导致输出[]
  */


  // 原始相机图像
  const rawCanvas = document.getElementById('raw-canvas');
  if (rawCanvas) {
    const rawCtx = rawCanvas.getContext('2d');
    new ROSLIB.Topic({ ros, name: '/hikrobot_camera/rgb/compressed', messageType: 'sensor_msgs/CompressedImage' }).subscribe(msg => {
      try {
        // 1. 将 Base64 字符串解码为二进制数据
        let imageData;
        if (typeof msg.data === 'string') {
          const binaryString = atob(msg.data);               // Base64 → 二进制字符串
          imageData = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            imageData[i] = binaryString.charCodeAt(i);
          }
        } else if (Array.isArray(msg.data)) {
          imageData = new Uint8Array(msg.data);
        } else if (msg.data instanceof Uint8Array) {
          imageData = msg.data;
        } else {
          console.error('未知的图像数据类型:', typeof msg.data);
          return;
        }

        // 可选：打印前10字节检查 JPEG 文件头 (255, 216, 255, ...)
        console.log('[Raw] 前10字节:', Array.from(imageData.slice(0, 10)));

        // 2. 创建 Blob 并显示
        const blob = new Blob([imageData], { type: 'image/jpeg' });
        const img = new Image();
        img.onload = () => {
          rawCanvas.width = img.width;
          rawCanvas.height = img.height;
          rawCtx.drawImage(img, 0, 0);
          URL.revokeObjectURL(img.src);
          console.log('[Raw] 图像显示成功', img.width, 'x', img.height);
        };
        img.onerror = (err) => {
          console.error('[Raw] 图像解码失败', err);
          URL.revokeObjectURL(img.src);
        };
        img.src = URL.createObjectURL(blob);
      } catch (e) {
        console.error('[Raw] 处理异常', e);
      }
    });
  } else {
    console.error('raw-canvas 不存在');
  }

  // 重投影图像
  const resultCanvas = document.getElementById('result-canvas');
  if (resultCanvas) {
    const resultCtx = resultCanvas.getContext('2d');
    new ROSLIB.Topic({ ros, name: '/tracker/result_image/compressed', messageType: 'sensor_msgs/CompressedImage' }).subscribe(msg => {
      try {
        let imageData;
        if (typeof msg.data === 'string') {
          const binaryString = atob(msg.data);
          imageData = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            imageData[i] = binaryString.charCodeAt(i);
          }
        } else if (Array.isArray(msg.data)) {
          imageData = new Uint8Array(msg.data);
        } else if (msg.data instanceof Uint8Array) {
          imageData = msg.data;
        } else {
          console.error('未知的图像数据类型:', typeof msg.data);
          return;
        }

        console.log('[Result] 前10字节:', Array.from(imageData.slice(0, 10)));

        const blob = new Blob([imageData], { type: 'image/jpeg' });
        const img = new Image();
        img.onload = () => {
          resultCanvas.width = img.width;
          resultCanvas.height = img.height;
          resultCtx.drawImage(img, 0, 0);
          URL.revokeObjectURL(img.src);
          console.log('[Result] 图像显示成功', img.width, 'x', img.height);
        };
        img.onerror = (err) => {
          console.error('[Result] 图像解码失败', err);
          URL.revokeObjectURL(img.src);
        };
        img.src = URL.createObjectURL(blob);
      } catch (e) {
        console.error('[Result] 处理异常', e);
      }
    });
  }


  // Debug 数据
  new ROSLIB.Topic({ ros, name: '/debugpub',  messageType: 'std_msgs/Float64' }).subscribe(msg => document.getElementById('dbg0').textContent = msg.data.toFixed(6));
  new ROSLIB.Topic({ ros, name: '/debugpub1', messageType: 'std_msgs/Float64' }).subscribe(msg => document.getElementById('dbg1').textContent = msg.data.toFixed(6));
  new ROSLIB.Topic({ ros, name: '/debugpub2', messageType: 'std_msgs/Float64' }).subscribe(msg => document.getElementById('dbg2').textContent = msg.data.toFixed(6));

  // 时间戳
  setInterval(() => {
    const ts = document.getElementById('timestamp');
    if (ts) ts.textContent = new Date().toLocaleTimeString();
  }, 200);
});
