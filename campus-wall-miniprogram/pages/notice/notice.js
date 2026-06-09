//pages/notice/notice.js
const API_BASE = 'http://154.37.221.232/api';

Page({
  data: {
    currentTab: 0,
    notices: [],
    filteredNotices: []
  },

  onLoad() {
    this.loadAll();
  },

  onShow() {
    this.loadAll();
  },

  loadAll() {
    // 同时获取公告、通知列表和认证信息
    Promise.all([
      this.fetchAnnouncement(),
      this.fetchNotices(),
      this.fetchCertInfo()
    ]).then(([announcement, noticeList, certItems]) => {
      let merged = [];
      // 公告作为第一条通知
      if (announcement) {
        merged.push({
          id: 'announcement',
          title: '📢 ' + (announcement.title || '公告'),
          content: announcement.content || '',
          type: 'system',
          time: announcement.publishedAt || '',
          readed: false
        });
      }
      // 追加认证通知
      merged = merged.concat(certItems);
      // 追加通知列表
      merged = merged.concat(noticeList);
      this.setData({ notices: merged });
      this.filterNotices();
    }).catch(() => {
      this.setData({ notices: [], filteredNotices: [] });
    });
  },

  // 获取公告
  fetchAnnouncement() {
    return new Promise((resolve) => {
      wx.request({
        url: `${API_BASE}/announcement`,
        success: (res) => {
          if (res.data && res.data.ok && res.data.data && res.data.data.title) {
            resolve(res.data.data);
          } else {
            resolve(null);
          }
        },
        fail: () => resolve(null)
      });
    });
  },

  // 获取通知列表
  fetchNotices() {
    return new Promise((resolve) => {
      wx.request({
        url: `${API_BASE}/notices`,
        success: (res) => {
          if (res.data && res.data.ok && res.data.data) {
            const list = res.data.data.map(n => ({
              id: n.id,
              title: n.title || '',
              content: n.content || '',
              type: n.type || 'system',
              time: n.createdAt || '',
              readed: n.readed || false
            }));
            resolve(list);
          } else {
            resolve([]);
          }
        },
        fail: () => resolve([])
      });
    });
  },

  // 获取认证信息（同步同学认证通知）
  fetchCertInfo() {
    return new Promise((resolve) => {
      const token = wx.getStorageSync('token');
      if (!token) { resolve([]); return; }
      wx.request({
        url: `${API_BASE}/user/me/zhixue-info`,
        header: { 'x-user-token': token },
        success: (res) => {
          const items = [];
          if (res.data && res.data.ok && res.data.data) {
            const cd = res.data.data;
            if (cd.status === 'rejected' && cd.rejectReason) {
              items.push({
                id: 'cert_rejected',
                title: '❌ 同学认证被驳回',
                content: cd.rejectReason,
                type: 'system',
                time: cd.rejectedAt || '',
                readed: false
              });
            }
            if (cd.status === 'approved') {
              items.push({
                id: 'cert_approved',
                title: '🎉 同学认证已通过',
                content: '你的同学认证已通过审核，现在可以使用智学账号登录和找回密码了。',
                type: 'system',
                time: '',
                readed: false
              });
            }
          }
          resolve(items);
        },
        fail: () => resolve([])
      });
    });
  },

  // 根据当前 Tab 筛选通知
  filterNotices() {
    const tab = this.data.currentTab;
    let filtered = this.data.notices;
    if (tab === 1) {
      filtered = filtered.filter(n => !n.readed);
    } else if (tab === 2) {
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
    if (id !== 'announcement') {
      wx.request({
        url: `${API_BASE}/notices/${id}/read`,
        method: 'POST',
        fail: () => {}
      });
    }
  }
});
