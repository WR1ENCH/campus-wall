//pages/notice/notice.js
const API_BASE = 'http://154.37.221.232/api';

Page({
  data: {
    currentTab: 0,
    notices: [],
    filteredNotices: []
  },

  onLoad() {
    this.loadNotices();
  },

  onShow() {
    this.loadNotices();
  },

  loadNotices() {
    wx.request({
      url: `${API_BASE}/notices`,
      success: (res) => {
        if (res.data && res.data.ok && res.data.data) {
          // 映射服务器数据到小程序格式
          const list = res.data.data.map(n => ({
            id: n.id,
            title: n.title || '',
            content: n.content || '',
            type: n.type || 'system',
            time: n.createdAt || '',
            readed: n.readed || false
          }));
          this.setData({ notices: list });
          this.filterNotices();
        }
      },
      fail: () => {
        this.setData({ notices: [], filteredNotices: [] });
      }
    });
  },

  // 根据当前 Tab 筛选通知
  filterNotices() {
    const tab = this.data.currentTab;
    let filtered = this.data.notices;
    if (tab === 1) {
      // 未读
      filtered = filtered.filter(n => !n.readed);
    } else if (tab === 2) {
      // 系统通知
      filtered = filtered.filter(n => n.type === 'system');
    }
    this.setData({ filteredNotices: filtered });
  },

  switchTab(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({ currentTab: index });
    this.filterNotices();
  },

  viewDetail(e) {
    const id = e.currentTarget.dataset.id;
    const notices = this.data.notices.map(n => {
      if (n.id === id) n.readed = true;
      return n;
    });
    this.setData({ notices });
    this.filterNotices();
    // 标记已读（接口可能不存在，忽略失败）
    wx.request({
      url: `${API_BASE}/notices/${id}/read`,
      method: 'POST',
      fail: () => {}
    });
  }
});
