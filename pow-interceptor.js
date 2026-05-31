/**
 * PoW 过期全局拦截器
 * 放在所有页面 </body> 前，拦截 403 { pow_required:true }
 * 自动刷新页面重新过 PoW 盾
 */
(function () {
  var _fetch = window.fetch;
  window.fetch = async function () {
    var args = arguments;
    try {
      var res = await _fetch.apply(this, args);
      if (res.status === 403) {
        try {
          var clone = res.clone();
          var json = await clone.json();
          if (json && json.pow_required) {
            // PoW token 过期，刷新页面重新验证
            location.reload();
            // 返回 pending promise 阻止后续 then 执行
            return new Promise(function () {});
          }
        } catch (e) { /* 不是 JSON，忽略 */ }
      }
      return res;
    } catch (err) {
      throw err;
    }
  };
})();
