/**
 * 智学网登录 + 获取用户信息
 * 使用Python库 zhixuewang 处理登录
 * 
 * 依赖：
 * - Python 3.x
 * - zhixuewang 库 (pip install zhixuewang playwright)
 * - playwright (playwright install chromium)
 *
 * 重要说明：
 * - Python脚本会弹出浏览器，用户需要手动完成人机验证
 * - 本模块通过 child_process 调用Python脚本
 *
 * 使用方式：
 *   const { loginZhixue } = require('./zhixue');
 *   const info = await loginZhixue('账号', '密码');
 *   // info = { realName, schoolName, className, gradeName, scores }
 */

const { spawn } = require('child_process');
const path = require('path');

/**
 * 调用Python脚本登录智学网
 *
 * @param {string} username - 智学网账号
 * @param {string} password - 智学网密码
 * @param {number} timeoutMs - 超时时间（ms），默认 180 秒
 * @returns {Promise<object>} 用户信息
 */
async function loginZhixue(username, password, timeoutMs = 180000) {
  if (!username || !password) {
    throw new Error('智学网账号和密码不能为空');
  }

  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    console.log('[zhixue] 开始调用智学网登录...');
    console.log('[zhixue] 账号:', username);
    console.log('[zhixue] 浏览器将弹出，请完成人机验证！');
    console.log('[zhixue] 超时时间:', timeoutMs / 1000, '秒');
    console.log();
    
    // Python脚本路径
    const scriptPath = path.join(__dirname, 'zhixue_helper.py');
    
    // 检查Python脚本是否存在
    const fs = require('fs');
    if (!fs.existsSync(scriptPath)) {
      reject(new Error(`Python脚本不存在: ${scriptPath}`));
      return;
    }
    
    // 调用Python脚本
    // 使用 python3 或 python 命令
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    
    console.log('[zhixue] 调用Python脚本:', scriptPath);
    console.log('[zhixue] Python命令:', pythonCmd);
    
    const python = spawn(pythonCmd, [scriptPath, username, password], {
      stdio: ['ignore', 'pipe', 'pipe']  // stdin忽略，stdout/stdout分别处理
    });
    
    let stdout = '';
    let stderr = '';
    let isTimeout = false;
    
    // 超时处理
    const timeoutHandle = setTimeout(() => {
      isTimeout = true;
      console.error('[zhixue] 超时！终止Python进程...');
      python.kill();
      reject(new Error(`登录超时（${timeoutMs / 1000}秒），请重试`));
    }, timeoutMs);
    
    // 接收stdout（JSON结果）
    python.stdout.on('data', (data) => {
      stdout += data.toString();
      // 输出进度信息（如果有的话）
      const lines = stdout.split('\n');
      for (const line of lines) {
        if (line.trim()) {
          try {
            const json = JSON.parse(line);
            if (json.status) {
              console.log(`[zhixue] ${json.message || json.status}`);
            }
          } catch (e) {
            // 不是JSON，忽略
          }
        }
      }
    });
    
    // 接收stderr（进度信息）
    python.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg) {
        console.log(`[zhixue-python] ${msg}`);
      }
    });
    
    // Python进程结束
    python.on('close', (code) => {
      clearTimeout(timeoutHandle);
      
      if (isTimeout) return;  // 已经超时处理了
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[zhixue] Python进程结束，退出码: ${code}，耗时: ${duration}秒`);
      
      if (code === 0) {
        // 成功，解析JSON结果
        try {
          // 只取最后一个完整的JSON行（前面的可能是进度信息）
          const lines = stdout.trim().split('\n');
          let jsonLine = '';
          for (const line of lines) {
            if (line.trim().startsWith('{') || line.trim().startsWith('[')) {
              jsonLine = line.trim();
            }
          }
          
          if (!jsonLine) {
            // 尝试整个stdout
            jsonLine = stdout.trim();
          }
          
          const result = JSON.parse(jsonLine);
          
          if (result.success) {
            console.log('[zhixue] 登录成功！');
            console.log('[zhixue] 用户信息:', JSON.stringify(result.data, null, 2));
            
            // 转换为统一格式
            const userInfo = {
              realName: result.data.name || '',
              schoolName: result.data.school || '',
              className: result.data.class || '',
              gradeName: result.data.grade || '',
              type: result.data.type || 'unknown',
              scores: result.data.scores || []
            };
            
            resolve(userInfo);
          } else {
            reject(new Error(`智学网登录失败：${result.message}`));
          }
          
        } catch (e) {
          console.error('[zhixue] 解析JSON失败:', e.message);
          console.error('[zhixue] stdout:', stdout);
          reject(new Error(`解析Python输出失败：${e.message}`));
        }
      } else {
        // 失败
        console.error('[zhixue] Python脚本执行失败');
        console.error('[zhixue] stdout:', stdout);
        console.error('[zhixue] stderr:', stderr);
        reject(new Error(`智学网登录失败（退出码 ${code}）：${stderr || stdout || '未知错误'}`));
      }
    });
    
    // 错误处理
    python.on('error', (err) => {
      clearTimeout(timeoutHandle);
      console.error('[zhixue] 启动Python进程失败:', err.message);
      reject(new Error(`启动Python失败：${err.message}`));
    });
    
  });
}

module.exports = { loginZhixue };
