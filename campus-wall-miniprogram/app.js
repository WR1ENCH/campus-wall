//app.js
App({
  onLaunch() {
    // 检查登录状态
    const token = wx.getStorageSync('token');
    if (token) {
      // 验证 token 有效性
      wx.request({
        url: 'http://localhost:3000/api/me',
        header: { 'Authorization': `Bearer ${token}` },
        success: (res) => {
          if (!res.data.success) {
            wx.clearStorageSync();
          }
        }
      });
    }
  }
});