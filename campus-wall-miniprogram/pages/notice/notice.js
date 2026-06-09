//pages/notice/notice.js
const API_BASE = 'http://154.37.221.232/api';

Page({
  data: {
    currentTab: 0,
    notices: []
  },

  onLoad() {
    this.loadNotices();
  },

  onShow() {
    this.loadNotices();
  },

  loadNotices() {
    const token = wx.getStorageSync('token');
    if (!token) {
      this.setData({ notices: [] });
      return;
    }

    wx.request({
      url: `${API_BASE}/notices`,
      header: { 'Authorization': `Bearer ${token}` },
      success: (res) => {
        if (res.data.success) {
          this.setData({ notices: res.data.notices || [] });
        }
      },
      fail: () => {
        this.setData({ notices: [] });
      }
    });
  },

  switchTab(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({ currentTab: index });
    this.loadNotices();
  },

  viewDetail(e) {
    const id = e.currentTarget.dataset.id;
    const notices = this.data.notices.map(n => {
      if (n.id === id) n.readed = true;
      return n;
    });
    this.setData({ notices });
    // 标记已读
    const token = wx.getStorageSync('token');
    if (token) {
      wx.request({
        url: `${API_BASE}/notices/${id}/read`,
        method: 'POST',
        header: { 'Authorization': `Bearer ${token}` }
      });
    }
  }
});