/* 轻岛共享业务层：微信端和浏览器端使用同一份规则，不发起网络请求。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LightIsland = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var KEY = 'light-island-v1';
  var PLANS = [
    { id: 'walk', title: '轻松步行', subtitle: '换一口空气，按自己的节奏', minutes: 15, tag: '户外 / 室内', color: 'sage', symbol: 'walk', steps: ['选择安全、平坦的场地', '以舒适的速度活动，不追求步数', '放慢脚步，舒缓结束'] },
    { id: 'stretch', title: '舒展时光', subtitle: '给久坐的身体一点空间', minutes: 5, tag: '舒展', color: 'peach', symbol: 'stretch', steps: ['留出宽敞、安全的活动空间', '在舒适范围内轻柔舒展，不弹震', '出现疼痛或不适时立即停止'] },
    { id: 'dance', title: '自在律动', subtitle: '跟着喜欢的节奏动起来', minutes: 10, tag: '轻活动', color: 'lavender', symbol: 'dance', steps: ['确保地面防滑，移开周围障碍', '自由活动，以轻松的节奏为主', '慢慢停下，恢复舒适呼吸'] },
    { id: 'relax', title: '舒缓收尾', subtitle: '不必用力，也是在照顾自己', minutes: 6, tag: '恢复', color: 'sky', symbol: 'relax', steps: ['找到安静、舒适的空间', '轻柔放松，保持自然呼吸', '给自己留一点安静的结束时间'] }
  ];
  var HABITS = [
    { id: 'water', title: '记得喝水', subtitle: '按需补水，不强求固定水量', reward: 5, symbol: 'water' },
    { id: 'break', title: '离开座位一会儿', subtitle: '给久坐的日常一个暂停', reward: 5, symbol: 'break' },
    { id: 'rest', title: '留一点休息时间', subtitle: '今天也值得好好照顾自己', reward: 5, symbol: 'moon' }
  ];
  var ITEMS = [
    { id: 'tree', title: '一棵小树', subtitle: '让岛上多一片绿意', cost: 30, symbol: 'tree' },
    { id: 'flowers', title: '花间小径', subtitle: '为日常添一点颜色', cost: 45, symbol: 'flower' },
    { id: 'bench', title: '风里的长椅', subtitle: '总有一个地方可以歇一歇', cost: 60, symbol: 'bench' },
    { id: 'house', title: '林间小屋', subtitle: '慢慢攒出自己的小天地', cost: 100, symbol: 'house' },
    { id: 'pond', title: '一池晴水', subtitle: '把天空留在小岛上', cost: 80, symbol: 'pond' },
    { id: 'windmill', title: '微风风车', subtitle: '让风也替你庆祝', cost: 120, symbol: 'windmill' }
  ];
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function dayKey(date) {
    var d = date || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function shiftDay(key, delta) {
    var bits = key.split('-').map(Number);
    return dayKey(new Date(bits[0], bits[1] - 1, bits[2] + delta, 12));
  }
  function fresh() {
    return { version: 1, profile: { nickname: '小岛居民', dailyGoal: 15 }, consent: false, energy: 0, xp: 0,
      totalMinutes: 0, totalSessions: 0, days: {}, weights: [], owned: [], recentSessions: [], completedSessions: [] };
  }
  function validateState(s) {
    if (!s || s.version !== 1 || !s.profile || !s.days || Array.isArray(s.days) || !Array.isArray(s.weights) || !Array.isArray(s.owned) || !Array.isArray(s.recentSessions) || !Array.isArray(s.completedSessions)) throw new Error('记录格式无法识别，请保留原数据，勿直接覆盖。');
    ['energy', 'xp', 'totalMinutes', 'totalSessions'].forEach(function (k) {
      if (!Number.isFinite(s[k]) || s[k] < 0) throw new Error('本地记录异常，请先保留原数据。');
    });
    if (typeof s.profile.nickname !== 'string' || !Number.isInteger(s.profile.dailyGoal) || s.profile.dailyGoal < 5 || s.profile.dailyGoal > 90) throw new Error('个人设置格式异常。');
    Object.keys(s.days).forEach(function (key) {
      var d = s.days[key];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !d || !Number.isFinite(d.minutes) || d.minutes < 0 || !Number.isFinite(d.moveEnergy) || d.moveEnergy < 0 || d.moveEnergy > 80 || !Array.isArray(d.habits)) throw new Error('每日记录格式异常。');
    });
    s.weights.forEach(function (w) { if (!w || !/^\d{4}-\d{2}-\d{2}$/.test(w.date) || !Number.isFinite(w.value) || w.value < 20 || w.value > 350) throw new Error('体重记录格式异常。'); });
    return s;
  }
  function createStore(adapter, clock) {
    clock = clock || function () { return new Date(); };
    var state;
    var loaded = adapter.read(KEY);
    state = loaded ? validateState(clone(loaded)) : fresh();
    function today() { return dayKey(clock()); }
    function daily(s) {
      var key = today();
      if (!s.days[key]) s.days[key] = { minutes: 0, moveEnergy: 0, habits: [] };
      return s.days[key];
    }
    // 先落盘再更新内存，避免存储失败后界面误报成功。
    function commit(fn) {
      var next = clone(state);
      var result = fn(next);
      var keys = Object.keys(next.days).sort();
      while (keys.length > 365) delete next.days[keys.shift()];
      adapter.write(KEY, next);
      state = next;
      return result;
    }
    function snapshot() {
      var s = clone(state), key = today(), d = s.days[key] || { minutes: 0, moveEnergy: 0, habits: [] };
      var week = [], count = 0, cursor = key;
      if (!s.days[cursor] || s.days[cursor].minutes === 0) cursor = shiftDay(cursor, -1);
      while (s.days[cursor] && s.days[cursor].minutes > 0) { count++; cursor = shiftDay(cursor, -1); }
      for (var i = 6; i >= 0; i--) {
        var k = shiftDay(key, -i), entry = s.days[k];
        var bits = k.split('-').map(Number);
        week.push({ date: k, label: ['日', '一', '二', '三', '四', '五', '六'][new Date(bits[0], bits[1] - 1, bits[2], 12).getDay()], minutes: entry ? entry.minutes : 0, today: i === 0 });
      }
      var totalWeek = week.reduce(function (sum, v) { return sum + v.minutes; }, 0);
      var activeKeys = Object.keys(s.days).filter(function (k) { return s.days[k].minutes > 0; }).sort();
      var activeDays = activeKeys.length, bestStreak = 0, run = 0, previous = null;
      activeKeys.forEach(function (k) { run = previous && shiftDay(previous, 1) === k ? run + 1 : 1; bestStreak = Math.max(bestStreak, run); previous = k; });
      var weights = s.weights.slice().sort(function (a, b) { return a.date.localeCompare(b.date); });
      var last = weights.length ? weights[weights.length - 1].value : null;
      var change = weights.length > 1 ? Math.round((last - weights[0].value) * 10) / 10 : null;
      var level = Math.floor(s.xp / 100) + 1;
      var max = Math.max.apply(null, week.map(function (v) { return v.minutes; }).concat([s.profile.dailyGoal]));
      s.today = d; s.date = key; s.week = week.map(function (v) { v.height = Math.max(4, Math.round(v.minutes / max * 100)); return v; });
      s.streak = count; s.level = level; s.levelProgress = s.xp % 100; s.weekMinutes = totalWeek; s.activeDays = activeDays;
      s.goalPercent = Math.min(100, Math.round(d.minutes / s.profile.dailyGoal * 100));
      s.weights = weights; s.latestWeight = last === null ? '--' : last.toFixed(1); s.weightChange = change === null ? '--' : (change > 0 ? '+' : '') + change.toFixed(1);
      s.habits = HABITS.map(function (h) { var v = clone(h); v.done = d.habits.indexOf(h.id) >= 0; return v; });
      s.items = ITEMS.map(function (it) { var v = clone(it); v.owned = s.owned.indexOf(it.id) >= 0; v.affordable = s.energy >= it.cost; return v; });
      s.achievements = [
        { id: 'first', title: '迈出第一步', description: '记录一次活动', unlocked: s.totalSessions >= 1 },
        { id: 'three', title: '慢慢成为习惯', description: '连续活动 3 天', unlocked: bestStreak >= 3 },
        { id: 'hour', title: '一点一滴', description: '累计活动 60 分钟', unlocked: s.totalMinutes >= 60 },
        { id: 'garden', title: '小岛园丁', description: '解锁 3 件装饰', unlocked: s.owned.length >= 3 },
        { id: 'week', title: '与自己同行', description: '活动记录达到 7 天', unlocked: activeDays >= 7 },
        { id: 'home', title: '风有了归处', description: '解锁林间小屋', unlocked: s.owned.indexOf('house') >= 0 }
      ];
      return s;
    }
    function recordWorkout(planId, minutes, sessionId) {
      var plan = PLANS.find(function (p) { return p.id === planId; });
      minutes = Number(minutes);
      if (!plan) throw new Error('请选择一种活动。');
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 120) throw new Error('请填写 1–120 的整数分钟。');
      if (sessionId && state.completedSessions.indexOf(sessionId) >= 0) return { reward: 0, duplicate: true };
      return commit(function (s) {
        var d = daily(s);
        if (d.minutes + minutes > 180) throw new Error('今日记录已达到 180 分钟上限，休息也很重要。');
        var reward = Math.max(0, Math.min(minutes * 2, 80 - d.moveEnergy));
        d.minutes += minutes; d.moveEnergy += reward;
        s.energy += reward; s.xp += reward; s.totalMinutes += minutes; s.totalSessions++;
        s.recentSessions.unshift({ date: today(), title: plan.title, minutes: minutes, reward: reward });
        s.recentSessions = s.recentSessions.slice(0, 100);
        if (sessionId) { s.completedSessions.push(sessionId); s.completedSessions = s.completedSessions.slice(-200); }
        return { reward: reward, duplicate: false };
      });
    }
    function checkHabit(id) {
      if (!HABITS.some(function (h) { return h.id === id; })) throw new Error('该习惯不存在。');
      if (state.days[today()] && state.days[today()].habits.indexOf(id) >= 0) return { reward: 0, duplicate: true };
      return commit(function (s) { daily(s).habits.push(id); s.energy += 5; s.xp += 5; return { reward: 5, duplicate: false }; });
    }
    function buyItem(id) {
      var item = ITEMS.find(function (it) { return it.id === id; });
      if (!item) throw new Error('该装饰不存在。');
      if (state.owned.indexOf(id) >= 0) throw new Error('这件装饰已经在岛上了。');
      if (state.energy < item.cost) throw new Error('能量还不够，先完成一项轻松活动吧。');
      return commit(function (s) { s.energy -= item.cost; s.owned.push(id); return item.title; });
    }
    function saveWeight(value) {
      if (!state.consent) throw new Error('请先阅读并同意本地体重记录说明。');
      if (typeof value === 'string' && !/^\d+(\.\d{1,2})?$/.test(value.trim())) throw new Error('请输入有效的体重数值。');
      value = Number(value);
      if (!Number.isFinite(value) || value < 20 || value > 350) throw new Error('请输入 20–350 kg 范围的有效数值。这只是录入校验，不是健康标准。');
      value = Math.round(value * 10) / 10;
      return commit(function (s) {
        s.weights = s.weights.filter(function (w) { return w.date !== today(); });
        s.weights.push({ date: today(), value: value });
        s.weights.sort(function (a, b) { return a.date.localeCompare(b.date); });
        s.weights = s.weights.slice(-365);
        return value;
      });
    }
    function setConsent(value) {
      return commit(function (s) { s.consent = !!value; if (!value) s.weights = []; });
    }
    function setProfile(nickname, dailyGoal) {
      nickname = String(nickname).trim(); dailyGoal = Number(dailyGoal);
      if (!nickname || nickname.length > 20) throw new Error('昵称请填写 1–20 个字符。');
      if (!Number.isInteger(dailyGoal) || dailyGoal < 5 || dailyGoal > 90) throw new Error('活动目标请填写 5–90 的整数分钟。');
      return commit(function (s) { s.profile = { nickname: nickname, dailyGoal: dailyGoal }; });
    }
    function reset() { var next = fresh(); adapter.write(KEY, next); state = next; }
    function exportData() { return JSON.stringify(state, null, 2); }
    function deleteWeight(date) { return commit(function (s) { s.weights = s.weights.filter(function (w) { return w.date !== date; }); }); }
    return { snapshot: snapshot, recordWorkout: recordWorkout, checkHabit: checkHabit, buyItem: buyItem, saveWeight: saveWeight,
      setConsent: setConsent, setProfile: setProfile, reset: reset, exportData: exportData, deleteWeight: deleteWeight };
  }
  function demoState(date) {
    var s = fresh(), key = dayKey(date || new Date());
    s.profile.nickname = '云渡禅穹'; s.consent = true;
    [15, 25, 0, 20, 15, 30, 10].forEach(function (v, i) {
      var k = shiftDay(key, i - 6);
      s.days[k] = { minutes: v, moveEnergy: Math.min(80, v * 2), habits: i === 6 ? ['water'] : [] };
      s.totalMinutes += v;
      if (v) { s.totalSessions++; s.recentSessions.unshift({ date: k, title: '轻松步行', minutes: v, reward: v * 2 }); }
    });
    s.weights = [69.2, 69.0, 69.1, 68.9, 68.8, 68.9, 68.7].map(function (v, i) { return { date: shiftDay(key, i - 6), value: v }; });
    s.xp = 235; s.energy = 100; s.owned = ['tree', 'flowers', 'bench'];
    return s;
  }
  return { KEY: KEY, PLANS: PLANS, HABITS: HABITS, ITEMS: ITEMS, createStore: createStore, fresh: fresh, dayKey: dayKey, shiftDay: shiftDay, demoState: demoState };
});
