//pages/index/index.js
Page({
  data: {
    loggedIn: false,
    userInfo: {}
  },

  onLoad() {
    this.checkLogin();
  },

  onShow() {
    this.checkLogin();
  },

  checkLogin() {
    const token = wx.getStorageSync('token');
    const userInfo = wx.getStorageSync('userInfo') || {};
    this.setData({
      loggedIn: !!token,
      userInfo
    });
  },

  login() {
    wx.navigateTo({ url: '/pages/login/login' });
  },

  logout() {
    wx.showModal({
      title: '确认退出',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          wx.clearStorageSync();
          this.setData({
            loggedIn: false,
            userInfo: {}
          });
          wx.showToast({ title: '已退出', icon: 'success' });
        }
      }
    });
  }
});