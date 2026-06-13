//pages/notice/notice.js
const API_BASE = 'http://154.37.221.232/api';

// 简易 Markdown → HTML 转换器
function mdToHtml(text) {
  if (!text) return '';
  let html = text
    // 转义 HTML 特殊字符
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // 代码块 (```) - 必须在行内代码之前处理
    .replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    // 行内代码 (`code`)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // 图片 ![alt](url)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">')
    // 链接 [text](url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    // 加粗 **text**
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // 斜体 *text*
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    // 删除线 ~~text~~
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    // 分割线 --- 或 ***
    .replace(/^[-*]{3,}\s*$/gm, '<hr>')
    // 标题 (#### 或 ## 或 #)
    .replace(/^######\s+(.+)$/gm, '<h6>$1</h6>')
    .replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>')
    .replace(/^####\s+(.+)$/gm, '<h4>$1</h4>')
    .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
    .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
    .replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')
    // 引用 > text
    .replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>')
    // 无序列表 - item 或 * item
    .replace(/^[\s]*[-*+]\s+(.+)$/gm, '<li>$1</li>')
    // 有序列表 1. item
    .replace(/^[\s]*\d+\.\s+(.+)$/gm, '<li>$1</li>')
    // 段落：连续两个换行为新段落
    .replace(/\n\s*\n/g, '</p><p>')
    // 换行（非段落分隔的单个换行 -> <br>）
    .replace(/\n/g, '<br>');

  // 包裹段落
  if (!html.startsWith('<h') && !html.startsWith('<pre') && !html.startsWith('<blockquote') && !html.startsWith('<hr') && !html.startsWith('<li') && !html.startsWith('<p') && !html.startsWith('<ul') && !html.startsWith('<ol')) {
    html = '<p>' + html + '</p>';
  }
  // 合并连续的 <li> 到 <ul>
  html = html.replace(/((?:<li>.*?<\/li><br>?)+)/g, '<ul>$1</ul>');
  // 清除孤立的 <br> 在块级元素内/尾
  html = html.replace(/<\/(ul|ol|li|h[1-6]|blockquote|pre|hr|p)><br>/g, '</$1>');
  html = html.replace(/<br><\/(ul|ol|li|h[1-6]|blockquote|pre|hr|p)>/g, '</$1>');

  return html;
}

Page({
  data: {
    currentTab: 0,
    notices: [],
    filteredNotices: [],
    showDetail: false,
    detailItem: {},
    detailHtml: ''
  },

  onLoad() {
    this.loadAll();
  },

  onShow() {
    this.loadAll();
  },

  loadAll() {
    Promise.all([
      this.fetchAnnouncement(),
      this.fetchNotices(),
      this.fetchCertInfo()
    ]).then(([announcement, noticeList, certItems]) => {
      let merged = [];
      if (announcement) {
        merged.push({
          id: 'announcement',
          title: '📢 ' + (announcement.title || '公告'),
          content: announcement.content || '',
          type: 'system',
          typeLabel: '公告',
          time: announcement.publishedAt ? new Date(announcement.publishedAt).toLocaleString('zh-CN') : '',
          readed: false
        });
      }
      merged = merged.concat(certItems);
      merged = merged.concat(noticeList);
      this.setData({ notices: merged });
      this.filterNotices();
    }).catch(() => {
      this.setData({ notices: [], filteredNotices: [] });
    });
  },

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
              typeLabel: n.author || '通知',
              time: n.createdAt ? new Date(n.createdAt).toLocaleString('zh-CN') : '',
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
                typeLabel: '认证',
                time: cd.rejectedAt ? new Date(cd.rejectedAt).toLocaleString('zh-CN') : '',
                readed: false
              });
            }
            if (cd.status === 'approved') {
              items.push({
                id: 'cert_approved',
                title: '🎉 同学认证已通过',
                content: '你的同学认证已通过审核，现在可以使用智学账号登录和找回密码了。',
                type: 'system',
                typeLabel: '认证',
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

  filterNotices(notices) {
    const tab = this.data.currentTab;
    let filtered = notices || this.data.notices;
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

  // 打开详情
  openDetail(e) {
    const idx = e.currentTarget.dataset.index;
    const item = this.data.filteredNotices[idx];
    if (!item) return;

    // 标记已读
    const notices = this.data.notices.map(n => {
      if (n.id === item.id) n.readed = true;
      return n;
    });
    this.setData({ notices });
    // 传已更新的数组，避免 setData 异步导致读到旧数据
    this.filterNotices(notices);

    // 转换 Markdown 为 HTML
    const html = mdToHtml(item.content);

    this.setData({
      showDetail: true,
      detailItem: item,
      detailHtml: html
    });

    // 通知服务器已读
    if (item.id && item.id !== 'announcement' && !item.id.startsWith('cert_')) {
      wx.request({
        url: `${API_BASE}/notices/${item.id}/read`,
        method: 'POST',
        fail: () => {}
      });
    }
  },

  // 关闭详情，返回列表
  closeDetail() {
    this.setData({
      showDetail: false,
      detailItem: {},
      detailHtml: ''
    });
    // 重新过滤列表（刚标记已读的记录应从"未读"标签中消失）
    this.filterNotices();
  }
});
