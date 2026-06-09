//app.js
const API_BASE = 'http://154.37.221.232/api';

App({
  onLaunch() {
    // 检查登录状态
    const token = wx.getStorageSync('token');
    const userInfo = wx.getStorageSync('userInfo');
    if (token) {
      // 验证 token 有效性，获取最新用户信息
      wx.request({
        url: `${API_BASE}/user/me`,
        header: { 'x-user-token': token },
        success: (res) => {
          if (res.data.ok) {
            // 更新本地缓存的用户信息
            const u = res.data.data;
            wx.setStorageSync('userInfo', {
              id: u.id,
              nickname: u.nickname,
              avatar: u.avatar,
              username: u.username,
              credit: u.credit
            });
          } else {
            wx.clearStorageSync();
          }
        },
        fail: () => {
          // 网络错误不清理，保留登录状态
        }
      });
    }
  }
});