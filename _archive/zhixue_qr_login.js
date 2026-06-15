/**
 * 智学网扫码登录模块
 * 
 * 流程：
 * 1. 获取登录二维码
 * 2. 显示二维码给用户
 * 3. 用户用智学网APP扫码
 * 4. 轮询扫码状态
 * 5. 扫码成功后获取用户信息（姓名、学校、班级）
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

// 智学网API基础地址
const BASE_URL = 'www.zhixue.com';
const API_BASE = 'https://www.zhixue.com';

/**
 * 发送HTTP请求
 */
function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': 'https://www.zhixue.com/',
        ...options.headers
      }
    };
    
    const req = client.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json, raw: data });
        } catch (e) {
          resolve({ status: res.statusCode, data: data, raw: data });
        }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('请求超时'));
    });
    
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    
    req.end();
  });
}

/**
 * 获取扫码登录二维码
 * 
 * @returns {Promise<{uuid: string, qrCode: string, expiresIn: number}>}
 */
async function getQRCode() {
  console.log('[zhixue-qr] 获取扫码登录二维码...');
  
  // 尝试智学网扫码登录API
  // 这个API路径需要通过抓包确认
  const possibleUrls = [
    `${API_BASE}/login/qrcode`,
    `${API_BASE}/api/login/qrcode`,
    `${API_BASE}/passport/qrcode`,
    `${API_BASE}/zhixue-web/qrcode/get`,
    `${API_BASE}/user/qrcode`
  ];
  
  for (const url of possibleUrls) {
    try {
      console.log(`[zhixue-qr] 尝试: ${url}`);
      const result = await httpRequest(url);
      
      if (result.status === 200 && result.data) {
        console.log(`[zhixue-qr] ✅ 成功: ${url}`);
        console.log(`[zhixue-qr] 响应:`, JSON.stringify(result.data).substring(0, 500));
        return result.data;
      }
    } catch (e) {
      console.log(`[zhixue-qr] ❌ 失败: ${url} - ${e.message}`);
    }
  }
  
  throw new Error('无法获取二维码，请手动抓包确认API');
}

/**
 * 查询扫码状态
 * 
 * @param {string} uuid - 二维码的UUID
 * @returns {Promise<{status: string, userInfo?: object}>}
 */
async function checkQRStatus(uuid) {
  console.log(`[zhixue-qr] 查询扫码状态: ${uuid}`);
  
  // 尝试不同的API路径
  const possibleUrls = [
    `${API_BASE}/login/qrcode/status?uuid=${uuid}`,
    `${API_BASE}/api/login/qrcode/status/${uuid}`,
    `${API_BASE}/passport/qrcode/check?uuid=${uuid}`,
    `${API_BASE}/zhixue-web/qrcode/polling/${uuid}`
  ];
  
  for (const url of possibleUrls) {
    try {
      const result = await httpRequest(url);
      
      if (result.status === 200 && result.data) {
        console.log(`[zhixue-qr] 状态响应:`, JSON.stringify(result.data).substring(0, 300));
        return result.data;
      }
    } catch (e) {
      // 继续尝试下一个
    }
  }
  
  return { status: 'pending' };
}

/**
 * 获取扫码登录后的用户信息
 * 
 * @param {string} token - 扫码成功后获得的token
 * @returns {Promise<{name: string, school: string, class: string}>}
 */
async function getUserInfo(token) {
  console.log(`[zhixue-qr] 获取用户信息，token: ${token?.substring(0, 20)}...`);
  
  const possibleUrls = [
    `${API_BASE}/api/user/info`,
    `${API_BASE}/user/info`,
    `${API_BASE}/student/info`,
    `${API_BASE}/zhixue-web/user/info`
  ];
  
  for (const url of possibleUrls) {
    try {
      const result = await httpRequest(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Token': token,
          'X-Token': token
        }
      });
      
      if (result.status === 200 && result.data) {
        // 解析用户信息
        const data = result.data.result || result.data.data || result.data;
        
        if (data && (data.name || data.realName || data.studentName)) {
          console.log(`[zhixue-qr] ✅ 获取到用户信息`);
          return {
            name: data.name || data.realName || data.studentName || '',
            school: data.schoolName || data.school || '',
            class: data.className || data.class || data.clazzName || '',
            grade: data.gradeName || data.grade || ''
          };
        }
      }
    } catch (e) {
      // 继续
    }
  }
  
  throw new Error('无法获取用户信息');
}

/**
 * 完整的扫码登录流程
 * 
 * @param {function} onQRCode - 收到二维码时的回调
 * @param {function} onStatusChange - 状态变化时的回调
 * @param {number} timeout - 超时时间（毫秒）
 * @returns {Promise<{name, school, class, grade}>}
 */
async function qrLogin(onQRCode, onStatusChange, timeout = 180000) {
  return new Promise(async (resolve, reject) => {
    const startTime = Date.now();
    
    try {
      // 1. 获取二维码
      const qrData = await getQRCode();
      
      // 提取二维码内容和UUID
      let uuid = qrData.uuid || qrData.qrUuid || qrData.token || '';
      let qrCodeUrl = qrData.qrCode || qrData.qrcode || qrData.qr_url || qrData.url || '';
      let qrCodeImage = qrData.qrCodeImage || qrData.image || '';
      
      console.log(`[zhixue-qr] UUID: ${uuid}`);
      console.log(`[zhixue-qr] 二维码URL: ${qrCodeUrl.substring(0, 100)}...`);
      
      // 回调通知前端显示二维码
      if (onQRCode) {
        onQRCode({
          uuid,
          qrCodeUrl,
          qrCodeImage,
          expiresIn: qrData.expiresIn || 300
        });
      }
      
      // 2. 轮询扫码状态
      const pollInterval = 2000; // 2秒轮询一次
      let status = 'pending';
      
      const pollTimer = setInterval(async () => {
        // 检查超时
        if (Date.now() - startTime > timeout) {
          clearInterval(pollTimer);
          reject(new Error('扫码登录超时，请重试'));
          return;
        }
        
        try {
          const result = await checkQRStatus(uuid);
          
          // 检查状态变化
          if (result.status !== status) {
            status = result.status;
            console.log(`[zhixue-qr] 状态变化: ${status}`);
            
            if (onStatusChange) {
              onStatusChange(status, result);
            }
          }
          
          // 扫码成功
          if (status === 'scanned' || status === 'confirmed' || status === 'success') {
            clearInterval(pollTimer);
            
            // 获取用户信息
            const token = result.token || result.data?.token || result.sessionToken;
            
            if (token || result.data) {
              const userInfo = result.data?.userInfo || result.data || await getUserInfo(token);
              
              resolve({
                name: userInfo.name || userInfo.realName || userInfo.studentName || '',
                school: userInfo.schoolName || userInfo.school || '',
                class: userInfo.className || userInfo.class || userInfo.clazzName || '',
                grade: userInfo.gradeName || userInfo.grade || '',
                token: token
              });
            } else {
              reject(new Error('扫码成功但未获取到token'));
            }
          }
          
          // 超时或失效
          if (status === 'expired' || status === 'timeout') {
            clearInterval(pollTimer);
            reject(new Error('二维码已过期，请刷新重试'));
          }
          
        } catch (e) {
          console.log(`[zhixue-qr] 轮询错误: ${e.message}`);
        }
        
      }, pollInterval);
      
    } catch (e) {
      reject(e);
    }
  });
}

// 导出模块
module.exports = {
  getQRCode,
  checkQRStatus,
  getUserInfo,
  qrLogin
};

// 如果直接运行，进行测试
if (require.main === module) {
  console.log('='.repeat(50));
  console.log('智学网扫码登录测试');
  console.log('='.repeat(50));
  console.log();
  
  qrLogin(
    (qrData) => {
      console.log('收到二维码数据:');
      console.log('UUID:', qrData.uuid);
      console.log('二维码URL:', qrData.qrCodeUrl);
      console.log('过期时间:', qrData.expiresIn, '秒');
      console.log();
      console.log('请用智学网APP扫码...');
    },
    (status, data) => {
      console.log(`[状态变化] ${status}`, data ? JSON.stringify(data).substring(0, 100) : '');
    }
  ).then(result => {
    console.log();
    console.log('='.repeat(50));
    console.log('✅ 登录成功！');
    console.log('='.repeat(50));
    console.log('姓名:', result.name);
    console.log('学校:', result.school);
    console.log('班级:', result.class);
    console.log('年级:', result.grade);
  }).catch(err => {
    console.error('❌ 登录失败:', err.message);
  });
}
