//pages/login/login.js
const API_BASE = 'http://154.37.221.232/api';

Page({
  data: {
    status: '',
    qrToken: ''
  },

  onLoad() {
    // 等待扫码
  },

  scanQrCode() {
    wx.scanCode({
      onlyFromCamera: true,
      success: (res) => {
        this.handleScanResult(res.result);
      },
      fail: (err) => {
        wx.showToast({ title: '扫码失败', icon: 'none' });
      }
    });
  },

  async handleScanResult(result) {
    // 解析 QR 码内容：campuswall://login/xxx 或直接 token
    let qrToken = '';
    if (result.includes('campuswall://login/')) {
      qrToken = result.split('campuswall://login/')[1];
    } else if (result.startsWith('login/')) {
      qrToken = result.split('login/')[1];
    } else {
      qrToken = result;
    }

    if (!qrToken) {
      // 尝试从完整URL中提取token
      const urlMatch = result.match(/[?&]token=([^&]+)/);
      if (urlMatch) {
        qrToken = urlMatch[1];
      } else {
        wx.showToast({ title: '无效二维码', icon: 'none' });
        return;
      }
    }

    this.setData({ qrToken, status: '⏳ 扫描成功，确认中...' });

    // 轮询等待用户确认
    this.pollStatus(qrToken);
  },

  async pollStatus(qrToken) {
    let attempts = 0;
    const maxAttempts = 30; // 最多 60 秒

    const timer = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) {
        clearInterval(timer);
        this.setData({ status: '⏱️ 超时，请重试' });
        return;
      }

      try {
        const res = await new Promise((resolve, reject) => {
          wx.request({
            url: `${API_BASE}/user/qrcode/status?qrToken=${qrToken}`,
            success: (res) => resolve(res.data),
            fail: reject
          });
        });

        if (res.confirmed && res.user) {
          clearInterval(timer);
          // 登录成功
          wx.setStorageSync('token', res.user.token);
          wx.setStorageSync('userInfo', {
            id: res.user.id,
            nickname: res.user.nickname,
            avatar: res.user.avatar
          });
          this.setData({ status: '✅ 登录成功！' });
          wx.showToast({ title: '登录成功', icon: 'success' });
          setTimeout(() => {
            wx.switchTab({ url: '/pages/notice/notice' });
          }, 1000);
        } else if (res.scanned) {
          this.setData({ status: '⏳ 用户已扫码，等待确认...' });
        } else if (!res.ok) {
          clearInterval(timer);
          this.setData({ status: res.msg || '错误' });
        }
      } catch (err) {
        clearInterval(timer);
        this.setData({ status: '网络错误' });
      }
    }, 2000);
  }
});