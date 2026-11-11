import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer, createSSRApp, defineComponent, h, nextTick, onUnmounted } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { ElButton, ElInput, ID_INJECTION_KEY } from 'element-plus';
import { fakeTable, loadModules } from './helpers.mjs';

const flush = async () => { await new Promise(setImmediate); await nextTick(); };

async function mountScenario() {
  const host = await loadModules([
    '/src/App.vue', '/src/components/ApiKeySettings.vue', '/src/components/SearchSuggestions.vue',
  ], 'development', { mockAxios: true, realVue: true });
  let app;
  try {
    host.state.saved.api_key = 'test-key';
    const table = fakeTable('target', '推荐词结果');
    table.getName = async () => table.name;
    host.state.tables.push(table);
    host.sdk.base.getTableList = async () => host.state.tables;
    const addRecords = table.addRecords;
    let writes = 0;
    table.addRecords = async records => {
      if (++writes === 2) throw new Error('第二批暂时失败');
      return addRecords(records);
    };
    let searches = 0;
    host.state.axiosHandler = async config => {
      if (!config.url.includes('/search/suggestions')) return { data: { sta: 0, data: [] } };
      searches++;
      return { data: { sta: 0, data: { items: Array.from({ length: 401 }, (_, i) => ({ keyword: '猫咪', recommendation: `推荐词${i}` })) } } };
    };
    const [App, ApiKeySettings, SearchSuggestions] = host.modules.map(module => module.default);
    const views = { mounts: 0, unmounts: 0 };
    const KeyHost = defineComponent({ props: { locked: Boolean, waitingToWrite: Boolean, requiresReopen: Boolean }, setup(props) {
      views.key = ApiKeySettings.setup(props, {
        expose() {}, emit(name, value) {
          if (name === 'ready' || name === 'saved') views.app.applyApiKey(value);
          if (name === 'saving-state') views.app.apiKeySaving.value = value;
        },
      });
      return () => null;
    } });
    const SearchHost = defineComponent({ props: { api_key: String, apiKeySaving: Boolean }, setup(props) {
      views.mounts++;
      views.search = SearchSuggestions.setup(props, {
        expose() {}, emit(name, value, waitingToWrite, requiresReopen) {
          if (name !== 'task-state') return;
          views.app.updateTaskState(value, waitingToWrite, requiresReopen);
        },
      });
      onUnmounted(() => { views.unmounts++; });
      return () => null;
    } });
    // 使用真实 App 和子组件的 setup；只省略样式和控件渲染，保留真实调度及条件卸载。
    const renderer = createRenderer({
      createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
      insert() {}, remove() {}, setElementText() {}, setText() {}, setComment() {}, patchProp() {},
      parentNode: () => null, nextSibling: () => null,
    });
    app = renderer.createApp({ setup() {
      views.app = App.setup({}, { expose() {} });
      return () => h('div', [
        h(KeyHost, { locked: views.app.running.value, waitingToWrite: views.app.waitingToWrite.value, requiresReopen: views.app.requiresReopen.value }),
        views.app.ready.value && views.app.apiKey.value ? h(SearchHost, {
          api_key: views.app.apiKey.value, apiKeySaving: views.app.apiKeySaving.value,
        }) : null,
      ]);
    } });
    app.provide(Symbol.for('v-scx'), {});
    app.mount({});
    await flush();
    const execute = async () => {
      views.search.form.value = { social_type: 'xhs', keyword: '猫咪', outputType: 2, table_id: 'target' };
      views.search.selectedFieldKeys.value = ['keyword', 'recommendation'];
      await flush();
      await views.search.submit();
      await flush();
    };
    const renderKey = () => {
      const preview = createSSRApp({ ...ApiKeySettings, setup: () => views.key }, {
        locked: views.app.running.value, waitingToWrite: views.app.waitingToWrite.value,
        requiresReopen: views.app.requiresReopen.value,
      });
      preview.component('el-input', ElInput);
      preview.component('el-button', ElButton);
      preview.provide(ID_INJECTION_KEY, { prefix: 1, current: 0 });
      return renderToString(preview);
    };
    const renderSearch = () => {
      const preview = createSSRApp({ ...SearchSuggestions, setup: () => views.search }, { api_key: views.app.apiKey.value });
      preview.config.warnHandler = () => {};
      preview.component('el-button', ElButton);
      return renderToString(preview);
    };
    return { ...host, views, table, execute, renderKey, renderSearch, searchCount: () => searches, close: async () => { app.unmount(); await host.close(); } };
  } catch (error) { app?.unmount(); await host.close(); throw error; }
}

test('待恢复写入锁住真实API Key保存链，完成后才允许清空及卸载重挂', async () => {
  const host = await mountScenario();
  try {
    await host.execute();
    const { views, table } = host;
    const originalSearch = views.search;
    assert.equal(table.records.length, 200);
    assert.equal(views.search.pendingWrite.value.writtenCount, 200);
    views.key.toggleEditing();
    views.key.draft.value = '';
    await views.key.save();
    await flush();
    assert.equal(views.app.apiKey.value, 'test-key');
    assert.equal(host.state.saved.api_key, 'test-key');
    assert.equal(views.app.running.value, true);
    assert.equal(views.unmounts, 0);
    assert.equal(views.search, originalSearch);

    await views.search.submit();
    await flush();
    assert.equal(table.records.length, 401);
    assert.equal(host.searchCount(), 1);
    assert.equal(views.app.running.value, false);
    views.key.toggleEditing();
    views.key.draft.value = '';
    await views.key.save();
    await flush();
    assert.equal(views.app.apiKey.value, '');
    assert.equal(views.unmounts, 1);

    views.key.draft.value = 'test-key';
    await views.key.save();
    await flush();
    assert.equal(views.mounts, 2);
    assert.equal(views.search.pendingWrite.value, null);
    await host.execute();
    assert.equal(table.records.length, 802);
    assert.equal(host.searchCount(), 2);
  } finally { await host.close(); }
});

test('明确结束待恢复写入后解锁API Key，允许真实卸载且不再追加', async () => {
  const host = await mountScenario();
  try {
    await host.execute();
    const { views } = host;
    assert.equal(views.app.running.value, true);
    assert.match(await host.renderKey(), /本次写入尚未完成，完成写入或结束本次写入后可修改 API Key。/);
    assert.equal(views.search.toastVisible.value, true);
    assert.match(await host.renderSearch(), /可继续写入本次剩余结果/);
    views.search.endWrite();
    await flush();
    assert.equal(views.app.running.value, false);
    assert.equal(views.search.pendingWrite.value, null);
    assert.equal(views.search.taskNotice.value, '');
    assert.equal(views.search.toastVisible.value, false);
    assert.doesNotMatch(await host.renderSearch(), /可继续写入本次剩余结果|结束本次写入/);
    assert.doesNotMatch(await host.renderKey(), /可修改 API Key/);
    views.key.toggleEditing();
    views.key.draft.value = '';
    await views.key.save();
    await flush();
    assert.equal(views.unmounts, 1);
    assert.equal(host.table.records.length, 200);
    assert.equal(host.searchCount(), 1);
  } finally { await host.close(); }
});

test('重开保护保留原错误及禁用入口，密钥提醒不再承诺同页完成写入，结束后清理', async () => {
  const host = await mountScenario();
  let writes = 0;
  try {
    host.table.addRecords = async () => {
      writes++;
      throw Object.assign(new Error('写入结果无法确认，请重新进入插件核对'), { requiresReopen: true });
    };
    await host.execute();
    const { views } = host;
    assert.equal(views.search.noticeRequiresReopen.value, true);
    assert.equal(views.app.running.value, true);
    assert.match(views.search.taskNotice.value, /写入结果无法确认.*重新进入后需重新执行/);
    const button = [...(await host.renderSearch()).matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].find(match => match[1].includes('commit-btn'));
    assert.match(button[1], /\sdisabled\b/);
    assert.match(button[2], /请重新进入插件/);
    assert.match(await host.renderKey(), /请先按下方提示核对结果，结束本次写入后可修改 API Key。/);
    assert.doesNotMatch(await host.renderKey(), /完成写入或|任务处理中/);
    await views.search.submit();
    views.key.toggleEditing(); views.key.draft.value = ''; await views.key.save();
    assert.equal(writes, 1);
    assert.equal(host.searchCount(), 1);
    assert.equal(views.app.apiKey.value, 'test-key');
    views.search.endWrite(); await flush();
    assert.equal(views.app.running.value, false);
    assert.equal(views.search.noticeRequiresReopen.value, false);
    assert.equal(views.app.requiresReopen.value, false);
    assert.equal(views.search.toastVisible.value, false);
    assert.doesNotMatch(await host.renderKey(), /可修改 API Key/);
    assert.doesNotMatch(await host.renderSearch(), /请重新进入插件|结束本次写入|写入结果无法确认/);
  } finally { await host.close(); }
});

test('继续写入准备及写入期间隐藏结束按钮，失败后恢复并可再次续写', async () => {
  const host = await mountScenario();
  let releaseRead, releaseWrite, resumed;
  try {
    await host.execute();
    const taskButtons = async () => [...(await host.renderSearch()).matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)]
      .filter(match => /commit-btn|end-write-btn/.test(match[1]))
      .map(match => ({ text: match[2].replace(/<[^>]*>/g, '').trim(), disabled: /\sdisabled\b/.test(match[1]) }));
    const waitingButtons = [{ text: '继续写入', disabled: false }, { text: '结束本次写入', disabled: false }];
    assert.deepEqual(await taskButtons(), waitingButtons);
    assert.equal(host.table.records.length, 200);

    const getTableById = host.sdk.base.getTableById;
    const addRecords = host.table.addRecords;
    const readGate = new Promise(resolve => { releaseRead = resolve; });
    const writeGate = new Promise(resolve => { releaseWrite = resolve; });
    let writeStarted;
    const writing = new Promise(resolve => { writeStarted = resolve; });
    host.sdk.base.getTableById = async id => { await readGate; return getTableById(id); };
    host.table.addRecords = async () => {
      writeStarted();
      await writeGate;
      throw new Error('本次续写暂时失败');
    };

    resumed = host.views.search.submit();
    await flush();
    assert.deepEqual(await taskButtons(), [{ text: '执行中…', disabled: true }]);
    assert.equal(host.table.records.length, 200);
    releaseRead();
    await writing;
    assert.deepEqual(await taskButtons(), [{ text: '执行中…', disabled: true }]);
    assert.equal(host.views.app.running.value, true);

    releaseWrite();
    await resumed;
    await flush();
    assert.deepEqual(await taskButtons(), waitingButtons);
    assert.match(host.views.search.taskNotice.value, /本次续写暂时失败/);
    assert.equal(host.table.records.length, 200);

    host.sdk.base.getTableById = getTableById;
    host.table.addRecords = addRecords;
    await host.views.search.submit();
    await flush();
    assert.deepEqual(await taskButtons(), [{ text: '立即执行', disabled: false }]);
    assert.equal(host.table.records.length, 401);
    assert.equal(host.searchCount(), 1);
    assert.equal(host.views.app.running.value, false);
    assert.equal(host.views.search.taskNotice.value, '');
  } finally { releaseRead?.(); releaseWrite?.(); await resumed; await host.close(); }
});

test('密钥提醒随获取、停止等待、待续写及继续写入切换，任务完成后才解锁', async () => {
  const host = await mountScenario();
  let releaseSearch, releaseWrite, task, resumed;
  try {
    const request = host.state.axiosHandler;
    const searchGate = new Promise(resolve => { releaseSearch = resolve; });
    host.state.axiosHandler = async config => {
      if (config.url.includes('/search/suggestions')) await searchGate;
      return request(config);
    };
    const { views } = host;
    task = host.execute();
    await flush();
    await flush();
    assert.equal(views.search.taskActionState.value, 'running');
    assert.equal(views.app.running.value, true);
    assert.match(await host.renderKey(), /任务处理中，任务结束后可修改 API Key。/);
    assert.doesNotMatch(await host.renderKey(), /结束本次写入/);
    views.search.requestStop();
    await flush();
    assert.equal(views.search.taskActionState.value, 'stopping');
    assert.match(await host.renderKey(), /任务处理中，任务结束后可修改 API Key。/);
    releaseSearch();
    await task;
    assert.equal(host.table.records.length, 200);
    assert.equal(views.app.running.value, true);
    assert.match(await host.renderKey(), /本次写入尚未完成，完成写入或结束本次写入后可修改 API Key。/);

    const addRecords = host.table.addRecords;
    const writeGate = new Promise(resolve => { releaseWrite = resolve; });
    host.table.addRecords = async records => { await writeGate; return addRecords(records); };
    resumed = views.search.submit();
    await flush();
    assert.equal(views.search.taskActionState.value, 'submitting');
    assert.ok(views.search.pendingWrite.value);
    assert.equal(views.app.running.value, true);
    assert.match(await host.renderKey(), /任务处理中，任务结束后可修改 API Key。/);
    assert.doesNotMatch(await host.renderKey(), /结束本次写入/);
    releaseWrite();
    await resumed;
    await flush();
    assert.equal(host.table.records.length, 401);
    assert.equal(host.searchCount(), 1);
    assert.equal(views.app.running.value, false);
    assert.doesNotMatch(await host.renderKey(), /可修改 API Key/);
  } finally { releaseSearch?.(); releaseWrite?.(); await task; await resumed; await host.close(); }
});

test('清空密钥保存延迟返回期间不能启动任务，返回后可正常重新配置', async () => {
  const host = await mountScenario();
  let release;
  let saving;
  try {
    const setData = host.sdk.bridge.setData;
    const gate = new Promise(resolve => { release = resolve; });
    host.sdk.bridge.setData = async (key, value) => {
      if (key === 'api_key') await gate;
      return setData(key, value);
    };
    const { views } = host;
    const originalSearch = views.search;
    views.search.form.value = { social_type: 'xhs', keyword: '猫咪', outputType: 2, table_id: 'target' };
    views.search.selectedFieldKeys.value = ['keyword', 'recommendation'];
    await flush();
    views.key.toggleEditing();
    views.key.draft.value = '';
    saving = views.key.save();
    assert.equal(views.key.saving.value, true);
    // 等待 Vue 将保存状态传给子组件；保存请求仍未返回时触发下一次用户提交。
    await flush();
    await views.search.submit();
    await host.execute();
    assert.equal(host.searchCount(), 0);
    assert.equal(host.table.records.length, 0);
    assert.equal(views.search.pendingWrite.value, null);
    assert.equal(views.search, originalSearch);
    assert.equal(views.app.running.value, false);

    release();
    await saving;
    await flush();
    assert.equal(views.app.apiKey.value, '');
    assert.equal(views.app.running.value, false);
    assert.equal(views.unmounts, 1);
    views.key.draft.value = 'new-key';
    await views.key.save();
    await flush();
    assert.equal(views.app.apiKey.value, 'new-key');
    assert.equal(views.mounts, 2);
    await host.execute();
    assert.equal(host.searchCount(), 1);
    assert.equal(host.table.records.length, 200);
    await views.search.submit();
    await flush();
    assert.equal(host.table.records.length, 401);
    assert.equal(views.app.running.value, false);
  } finally { release?.(); await saving; await host.close(); }
});

test('密钥保存延迟失败后解除任务禁用，保留旧密钥', async () => {
  const host = await mountScenario();
  let rejectSave;
  let saving;
  try {
    const setData = host.sdk.bridge.setData;
    const gate = new Promise((_, reject) => { rejectSave = reject; });
    host.sdk.bridge.setData = async (key, value) => {
      if (key === 'api_key') await gate;
      return setData(key, value);
    };
    const { views } = host;
    views.key.toggleEditing();
    views.key.draft.value = 'new-key';
    saving = views.key.save();
    await host.execute();
    assert.equal(host.searchCount(), 0);
    assert.equal(host.table.records.length, 0);
    rejectSave(new Error('密钥保存失败'));
    await saving;
    await flush();
    assert.equal(views.app.apiKey.value, 'test-key');
    assert.equal(host.state.saved.api_key, 'test-key');
    assert.equal(views.key.saving.value, false);
    assert.equal(views.unmounts, 0);
    await host.execute();
    assert.equal(host.searchCount(), 1);
    assert.equal(host.table.records.length, 200);
  } finally { rejectSave?.(new Error('结束测试')); await saving; await host.close(); }
});

test('任务已启动且请求未返回时禁止保存密钥', async () => {
  const host = await mountScenario();
  let release;
  let task;
  try {
    const { views } = host;
    let keyWrites = 0;
    const setData = host.sdk.bridge.setData;
    host.sdk.bridge.setData = async (key, value) => {
      if (key === 'api_key') keyWrites++;
      return setData(key, value);
    };
    const request = host.state.axiosHandler;
    const gate = new Promise(resolve => { release = resolve; });
    host.state.axiosHandler = async config => {
      if (config.url.includes('/search/suggestions')) await gate;
      return request(config);
    };
    views.search.form.value = { social_type: 'xhs', keyword: '猫咪', outputType: 2, table_id: 'target' };
    views.search.selectedFieldKeys.value = ['keyword', 'recommendation'];
    await flush();
    views.key.toggleEditing();
    views.key.draft.value = '';
    task = views.search.submit();
    await flush();
    assert.equal(views.app.running.value, true);
    assert.equal(views.search.pendingWrite.value, null);
    await views.key.save();
    assert.equal(keyWrites, 0);
    release();
    await task;
    await flush();
    assert.equal(keyWrites, 0);
    assert.equal(views.app.apiKey.value, 'test-key');
    assert.equal(views.unmounts, 0);
    assert.equal(host.table.records.length, 200);
    assert.equal(views.app.running.value, true);
  } finally { release?.(); await task; await host.close(); }
});

test('错误浮层自动消失后真实API Key仍被待继续写入锁定，明确结束后才解锁', async t => {
  const host = await mountScenario();
  const timers = [];
  t.mock.method(globalThis, 'setTimeout', (callback, ms) => { timers.push({ callback, ms }); return callback; });
  t.mock.method(globalThis, 'clearTimeout', callback => { const i = timers.findIndex(item => item.callback === callback); if (i >= 0) timers.splice(i, 1); });
  try {
    await host.execute();
    const { views } = host;
    const errorTimer = timers.find(item => item.ms === 5000); assert.ok(errorTimer); errorTimer.callback();
    await flush();
    assert.equal(views.search.toastVisible.value, false);
    assert.match(views.search.taskNotice.value, /第二批暂时失败.*已写入 200\/401 条.*关闭或刷新/);
    assert.equal(views.app.running.value, true);
    views.key.toggleEditing(); views.key.draft.value = ''; await views.key.save(); await flush();
    assert.equal(views.app.apiKey.value, 'test-key'); assert.equal(views.unmounts, 0);
    views.search.endWrite(); await flush();
    assert.equal(views.app.running.value, false); assert.equal(views.search.taskNotice.value, '');
    views.key.toggleEditing(); views.key.draft.value = ''; await views.key.save(); await flush();
    assert.equal(views.app.apiKey.value, ''); assert.equal(views.unmounts, 1);
  } finally { await host.close(); t.mock.restoreAll(); }
});
