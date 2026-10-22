/* Mini MOBA: local personal best + Yandex Games public speedrun leaderboard. */
(() => {
  'use strict';
  const BOARD = 'fastest_victory';
  const KEY = 'mini_moba_best_time_v1';
  const format = ms => {
    if (!Number.isFinite(ms) || ms < 0) return '—';
    const secs = Math.floor(ms / 1000);
    return String(Math.floor(secs / 60)).padStart(2, '0') + ':' + String(secs % 60).padStart(2, '0') + '.' + String(Math.floor(ms % 1000 / 10)).padStart(2, '0');
  };
  const localBest = () => {
    try { const value = Number(localStorage.getItem(KEY)); return value > 0 ? value : null; }
    catch (_) { return null; }
  };
  const saveLocal = timeMs => {
    const old = localBest();
    if (!old || timeMs < old) {
      try { localStorage.setItem(KEY, String(timeMs)); } catch (_) {}
      return true;
    }
    return false;
  };
  const initialize = () => window.MiniMobaSDK.init();
  const submitWin = async (timeMs, className) => {
    const rounded = Math.max(1, Math.round(timeMs));
    const improved = saveLocal(rounded);
    let submitted = false;
    const api = await initialize();
    if (api && improved) {
      try {
        if (await api.isAvailableMethod('leaderboards.setScore')) {
          await api.leaderboards.setScore(BOARD, rounded, className || '');
          submitted = true;
        }
      } catch (err) { console.warn('Не удалось отправить рекорд:', err); }
    }
    return { improved, submitted, best: localBest() };
  };
  const getLeaders = async () => {
    const api = await initialize();
    if (!api) return { entries: [], offline: true };
    try {
      const data = await api.leaderboards.getEntries(BOARD, {
        quantityTop: 10, includeUser: true, quantityAround: 1
      });
      return { entries: data.entries || [], offline: false };
    } catch (err) {
      return { entries: [], offline: true, error: err.message };
    }
  };
  window.MiniMobaLeaderboard = { format, localBest, submitWin, getLeaders, initialize };
})();
