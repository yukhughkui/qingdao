/* 单调累积活动时间；后台由调用端 pause，恢复时不会把离开时间计入运动。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.IslandTimer = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function createTimer(totalSeconds, clock) {
    if (!Number.isInteger(totalSeconds) || totalSeconds < 1) throw new Error('计时长度无效。');
    clock = clock || function () { return Date.now(); };
    var elapsed = 0, started = null, status = 'idle';
    function update() {
      if (started !== null) { var now = clock(); elapsed += Math.max(0, now - started); started = now; }
      if (elapsed >= totalSeconds * 1000) { elapsed = totalSeconds * 1000; started = null; status = 'finished'; }
    }
    function snapshot() {
      update();
      var remaining = Math.max(0, Math.ceil(totalSeconds - elapsed / 1000));
      return { status: status, remaining: remaining, elapsedSeconds: Math.floor(elapsed / 1000),
        elapsedMinutes: Math.floor(elapsed / 60000), progress: Math.min(100, elapsed / (totalSeconds * 10)),
        text: String(Math.floor(remaining / 60)).padStart(2, '0') + ':' + String(remaining % 60).padStart(2, '0') };
    }
    function start() { update(); if (status !== 'finished' && started === null) { started = clock(); status = 'running'; } return snapshot(); }
    function pause() { update(); if (status === 'running') { started = null; status = 'paused'; } return snapshot(); }
    return { start: start, pause: pause, snapshot: snapshot };
  }
  return { createTimer: createTimer };
});
