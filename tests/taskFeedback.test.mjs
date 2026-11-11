import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer, createSSRApp, h, nextTick } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { ElButton } from 'element-plus';
import { fakeTable, loadModules } from './helpers.mjs';
const flush = async () => { await new Promise(setImmediate); await nextTick(); };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
async function mount(configure = () => {}) {
  const host = await loadModules(['/src/components/SearchSuggestions.vue'], 'development', { mockAxios: true, realVue: true });
  host.sdk.base.getTableList = async () => [];
  host.state.axiosHandler = async () => ({ data: { sta: 0, data: [] } });
  configure(host);
  let view;
  const states = [];
  const renderer = createRenderer({ createElement: () => ({}), createText: () => ({}), createComment: () => ({}), insert() {}, remove() {}, setElementText() {}, setText() {}, setComment() {}, patchProp() {}, parentNode: () => null, nextSibling: () => null });
  const app = renderer.createApp({ setup() { view = host.modules[0].default.setup({ api_key: 'test-key' }, { expose() {}, emit(name, value) { if (name === 'task-state') states.push(value); } }); return () => h('div'); } });
  app.provide(Symbol.for('v-scx'), {}); app.mount({}); await flush();
  view.form.value.keyword = '猫咪';
  const render = async () => {
    const preview = createSSRApp({ setup: () => view, ssrRender: host.modules[0].default.ssrRender });
    preview.config.warnHandler = () => {};
    preview.component('el-button', ElButton);
    return renderToString(preview);
  };
  return { ...host, view, states, render, unmount: () => app.unmount(), close: async () => { app.unmount(); await host.close(); } };
}

for (const result of ['rows', 'empty', 'failure']) {
  test(`独立推荐词获取中停止（${result}）：不请求下个关键词，已有结果正常写入`, async () => {
    const host = await mount(), gate = deferred(); let pending;
    const calls = [];
    try {
      host.view.form.value.keyword = 'a,b';
      host.view.selectedFieldKeys.value = ['keyword', 'recommendation'];
      host.state.axiosHandler = async config => {
        calls.push(config.data.keyword); await gate.promise;
        if (result === 'failure') throw new Error('当前关键词失败');
        return { data: { sta: 0, data: { items: result === 'rows' ? [{ keyword: 'a', recommendation: '结果' }] : [] } } };
      };
      pending = host.view.submit(); await flush();
      assert.match(await host.render(), />停止任务</);
      await host.view.handleTaskAction(); await host.view.handleTaskAction();
      assert.match(await host.render(), />正在停止…</);
      assert.equal(host.states.at(-1), true);
      gate.resolve(); await pending;
      assert.deepEqual(calls, ['a']);
      assert.equal(host.state.tables.reduce((n, table) => n + table.records.length, 0), result === 'rows' ? 1 : 0);
      assert.match(host.view.toastText.value, /任务已停止，已写入 [01] 条推荐词/);
      assert.equal(host.view.toastType.value, result === 'failure' ? 'warning' : 'info');
      assert.equal(host.states.at(-1), false);
      assert.match(await host.render(), />立即执行</);
    } finally { gate.resolve(); await pending; await host.close(); }
  });
}

test('独立推荐词停止后已获取201条，写入失败继续写入不重搜并保留停止结果', async () => {
  const host = await mount(), reply = deferred(); let pending;
  try {
    const table = fakeTable('target', '结果'), add = table.addRecords;
    let writes = 0;
    table.addRecords = async rows => { if (++writes === 2) throw new Error('第二批写入失败'); return add(rows); };
    host.state.tables.push(table);
    host.view.form.value.outputType = 2; host.view.form.value.table_id = 'target'; await flush();
    host.view.form.value.keyword = 'a,b'; host.view.selectedFieldKeys.value = ['keyword', 'recommendation'];
    let searches = 0;
    host.state.axiosHandler = async () => { searches++; await reply.promise; return { data: { sta: 0, data: { items: Array.from({ length: 201 }, (_, i) => ({ keyword: 'a', recommendation: `结果${i}` })) } } }; };
    pending = host.view.submit(); await flush();
    assert.match(await host.render(), />停止任务</);
    await host.view.handleTaskAction(); reply.resolve(); await pending;
    assert.equal(table.records.length, 200);
    assert.match(await host.render(), />继续写入</);
    await host.view.handleTaskAction();
    assert.equal(searches, 1);
    assert.equal(table.records.length, 201);
    assert.match(host.view.toastText.value, /任务已停止，已写入 201 条推荐词/);
    assert.equal(host.view.toastType.value, 'info');
  } finally { reply.resolve(); await pending; await host.close(); }
});

test('独立推荐词进入写入后主按钮禁用，不能停止或重新提交，也不释放密钥锁定', async () => {
  const host = await mount(), gate = deferred(), started = deferred(); let pending;
  try {
    const table = fakeTable('target', '结果'), add = table.addRecords;
    table.addRecords = async rows => { started.resolve(); await gate.promise; return add(rows); };
    host.state.tables.push(table);
    host.view.form.value.outputType = 2; host.view.form.value.table_id = 'target'; await flush();
    let searches = 0;
    host.state.axiosHandler = async () => { searches++; return { data: { sta: 0, data: { items: [{ keyword: 'a', recommendation: '结果' }] } } }; };
    pending = host.view.submit(); await started.promise;
    assert.equal(host.view.taskActionState.value, 'submitting');
    assert.match(await host.render(), /<button[^>]*disabled[^>]*>[\s\S]*执行中…/);
    await host.view.handleTaskAction(); await host.view.submit(); host.view.requestStop();
    assert.equal(searches, 1);
    assert.equal(host.view.stopRequested.value, false);
    assert.equal(host.states.at(-1), true);
  } finally { gate.resolve(); await pending; await host.close(); }
});

for (const auth of ['business-4001', 'http-401', 'http-403']) {
  for (const partial of [false, true]) {
    test(`独立推荐词${auth}停止后续关键词，已有结果=${partial}按实际数量写入`, async () => {
      const host = await mount();
      try {
        const calls = [];
        host.view.form.value.keyword = 'a,b,c';
        host.view.selectedFieldKeys.value = ['keyword', 'recommendation'];
        host.state.axiosHandler = async config => {
          calls.push(config.data.keyword);
          if (partial && config.data.keyword === 'a') return { data: { sta: 0, data: { items: [{ keyword: 'a', recommendation: '已获取结果' }] } } };
          if (auth === 'business-4001') return { data: { sta: 4001, msg: '测试密钥已失效' } };
          throw Object.assign(new Error('HTTP 鉴权失败'), { response: { status: Number(auth.slice(-3)), data: { msg: '测试密钥已失效' } } });
        };
        await host.view.submit();
        assert.deepEqual(calls, partial ? ['a', 'b'] : ['a']);
        assert.equal(host.state.tables.reduce((sum, table) => sum + table.records.length, 0), partial ? 1 : 0);
        assert.equal(host.view.loading.value, false);
        assert.equal(host.view.submitting.value, false);
        assert.equal(host.view.pendingWrite.value, null);
        assert.equal(host.states.at(-1), false);
        assert.equal(host.view.toastType.value, partial ? 'warning' : 'error');
        assert.match(host.view.toastText.value, /测试密钥已失效/);
        assert.doesNotMatch(host.view.toastText.value, /关闭|重新进入/);
        if (partial) {
          assert.match(host.view.toastText.value, /已写入 1 条.*获取已中止/);
          assert.doesNotMatch(host.view.toastText.value, /^处理完成/);
        }
      } finally { await host.close(); }
    });
  }
}

test('鉴权中止后的已有结果写入失败，继续写入保留原因且不重新搜索', async () => {
  const host = await mount();
  try {
    const table = fakeTable('target', '已有结果');
    const add = table.addRecords; let writes = 0;
    table.addRecords = async rows => {
      if (++writes === 1) throw new Error('SDK 暂时写入失败');
      return add(rows);
    };
    host.state.tables.push(table);
    host.view.form.value.outputType = 2; host.view.form.value.table_id = 'target'; await flush();
    host.view.form.value.keyword = 'a,b,c';
    host.view.selectedFieldKeys.value = ['keyword', 'recommendation'];
    const calls = [];
    host.state.axiosHandler = async config => {
      calls.push(config.data.keyword);
      return config.data.keyword === 'a'
        ? { data: { sta: 0, data: { items: [{ keyword: 'a', recommendation: '已获取结果' }] } } }
        : { data: { sta: 4001, msg: '测试密钥已失效' } };
    };
    await host.view.submit();
    assert.deepEqual(calls, ['a', 'b']);
    assert.equal(host.view.pendingWrite.value.rows.length, 1);
    assert.equal(table.records.length, 0);
    await host.view.submit();
    assert.deepEqual(calls, ['a', 'b']);
    assert.equal(table.records.length, 1);
    assert.equal(host.view.pendingWrite.value, null);
    assert.equal(host.view.toastType.value, 'warning');
    assert.match(host.view.toastText.value, /已写入 1 条.*获取已中止：测试密钥已失效/);
  } finally { await host.close(); }
});

test('目标字段异步读取期间立即显示准备进度，重复点击不重复提交且读取失败结束加载', async () => {
  const host = await mount(); const gate = deferred(); let pending;
  try {
    const table = fakeTable('target', '推荐词');
    table.getFieldMetaList = async () => { await gate.promise; throw new Error('字段连接断开'); };
    host.state.tables.push(table);
    host.view.form.value.outputType = 2; host.view.form.value.table_id = 'target';
    await flush();
    let searches = 0;
    host.state.axiosHandler = async () => { searches++; return { data: { sta: 0, data: { items: [] } } }; };
    pending = host.view.submit(); await flush();
    assert.equal(host.view.toastVisible.value, true);
    assert.match(host.view.toastText.value, /正在读取目标表字段.*请勿关闭插件/);
    assert.equal(host.view.submitting.value, true);
    await host.view.submit(); assert.equal(searches, 0);
    gate.resolve(); await pending;
    assert.equal(host.view.toastLoading.value, false);
    assert.equal(host.view.toastType.value, 'error');
    assert.match(host.view.toastText.value, /字段连接断开/);
    assert.equal(host.view.submitting.value, false);
    assert.equal(host.view.loading.value, false);
    assert.equal(host.state.notices.length, 0);
  } finally { gate.resolve(); await pending; await host.close(); }
});

test('HTTP获取期间保留当前关键词和勿关闭提醒且阻止重复执行', async () => {
  const host = await mount(); const gate = deferred(); let pending;
  try {
    let requests = 0;
    host.state.axiosHandler = async () => { requests++; await gate.promise; return { data: { sta: 0, data: { items: [] } } }; };
    pending = host.view.submit(); await flush();
    assert.equal(host.view.toastVisible.value, true);
    assert.match(host.view.toastText.value, /正在获取「猫咪」（1\/1）.*请勿关闭插件/);
    assert.equal(host.states.at(-1), true);
    await host.view.submit(); assert.equal(requests, 1);
    gate.resolve(); await pending;
    assert.equal(host.view.toastType.value, 'info');
    assert.equal(host.states.at(-1), false);
    assert.equal(host.state.notices.length, 0);
  } finally { gate.resolve(); await pending; await host.close(); }
});

for (const [mode, kind] of [['partial', 'warning'], ['empty-and-failure', 'warning'], ['failure', 'error']]) {
  test(`推荐词 ${mode} 按实际失败与空结果分类并保留具体原因`, async () => {
    const host = await mount();
    try {
      host.view.form.value.keyword = '猫咪,露营';
      host.state.axiosHandler = async config => {
        if (config.data.keyword === '露营' || mode === 'failure') return { data: { sta: 1, msg: '推荐词接口暂不可用' } };
        return { data: { sta: 0, data: { items: mode === 'partial' ? [{ keyword: '猫咪', recommendation: '猫粮' }] : [] } } };
      };
      await host.view.submit();
      assert.equal(host.view.toastType.value, kind);
      assert.equal(host.view.toastLoading.value, false);
      assert.doesNotMatch(host.view.toastText.value, /请勿关闭/);
      if (mode === 'partial') assert.match(host.view.toastText.value, /处理完成，已写入 1 条（1 个关键词获取失败）/);
      else if (mode === 'empty-and-failure') assert.match(host.view.toastText.value, /1 个关键词无结果，1 个关键词获取失败/);
      else assert.match(host.view.toastText.value, /推荐词接口暂不可用/);
      assert.equal(host.state.notices.length, 0);
    } finally { await host.close(); }
  });
}

test('写入失败提示消失后仍保留真实原因、缓存说明、确认条数及任务锁定，继续不重新搜索', async t => {
  const host = await mount();
  try {
    const table = fakeTable('target', '推荐词'); host.state.tables.push(table);
    host.view.form.value.outputType = 2; host.view.form.value.table_id = 'target'; await flush();
    const scheduled = [];
    t.mock.method(globalThis, 'setTimeout', (callback, ms) => { scheduled.push({ callback, ms }); return callback; });
    t.mock.method(globalThis, 'clearTimeout', callback => { const i = scheduled.findIndex(item => item.callback === callback); if (i >= 0) scheduled.splice(i, 1); });
    let fail = true; const add = table.addRecords;
    table.addRecords = records => { if (fail) throw new Error('当前表格禁止写入'); return add(records); };
    let searches = 0;
    host.state.axiosHandler = async () => { searches++; return { data: { sta: 0, data: { items: [{ keyword: '猫咪', recommendation: '猫粮' }] } } }; };
    await host.view.submit();
    assert.equal(host.view.toastType.value, 'error');
    assert.match(host.view.toastText.value, /当前表格禁止写入/);
    assert.doesNotMatch(host.view.toastText.value, /超时/);
    assert.match(host.view.taskNotice.value, /当前表格禁止写入.*已写入 0\/1 条.*关闭或刷新/);
    const timer = scheduled.find(item => item.ms === 5000); assert.ok(timer); timer.callback();
    assert.equal(host.view.toastVisible.value, false);
    assert.match(host.view.taskNotice.value, /关闭或刷新/);
    assert.match(await host.render(), /class="sub-hint" role="status"[^>]*>[^<]*当前表格禁止写入/);
    assert.equal(host.view.pendingWrite.value.writtenCount, 0);
    assert.equal(host.states.at(-1), true);
    assert.equal(host.state.notices.length, 0);
    fail = false; await host.view.submit();
    assert.equal(table.records.length, 1); assert.equal(searches, 1);
    assert.equal(host.view.pendingWrite.value, null); assert.equal(host.view.taskNotice.value, '');
    assert.equal(host.view.toastType.value, 'success'); assert.equal(host.states.at(-1), false);
  } finally { await host.close(); t.mock.restoreAll(); }
});

test('真实字段类型冲突允许本页修正后继续写入，不重新搜索或丢失待写结果', async t => {
  const host = await mount();
  try {
    const table = fakeTable('target', '推荐词', [{ id: 'wrong', name: '推荐词', type: 2 }]);
    host.state.tables.push(table);
    host.view.form.value.outputType = 2; host.view.form.value.table_id = 'target'; await flush();
    const scheduled = [];
    t.mock.method(globalThis, 'setTimeout', (callback, ms) => { scheduled.push({ callback, ms }); return callback; });
    t.mock.method(globalThis, 'clearTimeout', () => {});
    let searches = 0;
    host.state.axiosHandler = async () => { searches++; return { data: { sta: 0, data: { items: [{ keyword: '猫咪', recommendation: '猫粮' }] } } }; };
    await host.view.submit();
    assert.equal(host.view.noticeRequiresReopen.value, false);
    assert.match(host.view.taskNotice.value, /输出字段"推荐词" 类型不匹配.*修正目标字段类型后重试/);
    assert.equal(host.view.pendingWrite.value.rows.length, 1);
    const button = [...(await host.render()).matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].find(match => match[1].includes('commit-btn'));
    assert.equal(button[2].replace(/<[^>]+>/g, '').trim(), '继续写入');
    assert.doesNotMatch(button[1], /\sdisabled\b/);
    assert.doesNotMatch(host.view.taskNotice.value, /重新(?:进入|打开)/);
    assert.equal(host.states.at(-1), true);
    const timer = scheduled.find(item => item.ms === 8000); assert.ok(timer); timer.callback();
    assert.equal(host.view.toastVisible.value, false);
    assert.equal(host.view.noticeRequiresReopen.value, false);
    table.fields[0].type = 1;
    await host.view.submit();
    assert.equal(searches, 1); assert.equal(table.records.length, 1);
    assert.equal(host.view.pendingWrite.value, null);
    assert.equal(host.view.taskNotice.value, '');
    assert.equal(host.view.toastType.value, 'success');
    assert.equal(host.states.at(-1), false);
    assert.equal(host.state.notices.length, 0);
  } finally { await host.close(); t.mock.restoreAll(); }
});

test('写入结果未确认的重开标记仍锁定继续入口并保留未写结果说明', async () => {
  const host = await mount();
  try {
    const table = fakeTable('target', '推荐词');
    let searches = 0, writes = 0;
    table.addRecords = async () => {
      writes++;
      throw Object.assign(new Error('写入响应超时，请重新打开插件核对结果'), { requiresReopen: true });
    };
    host.state.tables.push(table);
    host.view.form.value.outputType = 2; host.view.form.value.table_id = 'target'; await flush();
    host.state.axiosHandler = async () => { searches++; return { data: { sta: 0, data: { items: [{ keyword: '猫咪', recommendation: '猫粮' }] } } }; };
    await host.view.submit();
    assert.equal(host.view.noticeRequiresReopen.value, true);
    assert.match(host.view.taskNotice.value, /清除本次未写入的结果.*重新进入后需重新执行/);
    const button = [...(await host.render()).matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].find(match => match[1].includes('commit-btn'));
    assert.match(button[1], /\sdisabled\b/);
    assert.match(button[2], /请重新进入插件/);
    await host.view.submit();
    assert.equal(searches, 1); assert.equal(writes, 1);
  } finally { await host.close(); }
});

test('同步关键词校验只显示具体顶部错误且不启动加载', async () => {
  const host = await mount();
  try {
    host.view.form.value.keyword = '';
    await host.view.submit();
    assert.deepEqual(host.state.notices, [{ message: '请输入至少一个关键词', type: 'error', plain: true, duration: 3000 }]);
    assert.equal(host.view.toastVisible.value, false);
    assert.equal(host.view.submitting.value, false);
    assert.equal(host.states.at(-1), false);
  } finally { await host.close(); }
});

for (const outcome of ['success', 'failure', 'stopped']) {
  test(`独立推荐词获取期间卸载，迟到${outcome}不再请求、写入或弹提示`, async () => {
    const host = await mount(), gate = deferred(), calls = []; let pending;
    try {
      host.view.form.value.keyword = 'a,b';
      host.state.axiosHandler = async config => { calls.push(config.data.keyword); await gate.promise; if (outcome === 'failure') throw new Error('迟到失败'); return { data: { sta: 0, data: { items: [{ recommendation: '结果' }] } } }; };
      pending = host.view.submit(); await flush();
      if (outcome === 'stopped') host.view.requestStop();
      host.unmount(); gate.resolve(); await pending;
      assert.deepEqual(calls, ['a']); assert.equal(host.state.tables.length, 0);
      assert.equal(host.view.toastVisible.value, false); assert.deepEqual(host.state.notices, []);
    } finally { gate.resolve(); await pending; await host.close(); }
  });
}

test('独立推荐词首批200条写入期间卸载，完成在途批次后不继续第201条', async () => {
  const host = await mount(), gate = deferred(), started = deferred(); let pending, writes = 0;
  try {
    const table = fakeTable('target', '结果'), add = table.addRecords;
    table.addRecords = async rows => { writes++; started.resolve(); await gate.promise; return add(rows); };
    host.state.tables.push(table); host.view.form.value.outputType = 2; host.view.form.value.table_id = 'target'; await flush();
    host.view.selectedFieldKeys.value = ['keyword', 'recommendation'];
    host.state.axiosHandler = async () => ({ data: { sta: 0, data: { items: Array.from({ length: 201 }, (_, i) => ({ recommendation: `结果${i}` })) } } });
    pending = host.view.submit(); await started.promise; host.unmount(); gate.resolve(); await pending;
    assert.equal(writes, 1); assert.equal(table.records.length, 200); assert.equal(host.view.toastVisible.value, false);
  } finally { gate.resolve(); await pending; await host.close(); }
});

for (const phase of ['table-list', 'table-created']) {
  test(`独立推荐词新建表${phase}等待时卸载，不继续创建表或配置字段`, async () => {
    const host = await mount(), gate = deferred(), started = deferred(); let pending, creates = 0, fields = 0;
    try {
      host.view.selectedFieldKeys.value = ['keyword', 'recommendation'];
      host.state.axiosHandler = async () => ({ data: { sta: 0, data: { items: [{ recommendation: '结果' }] } } });
      const add = host.sdk.base.addTable;
      host.sdk.base.getTableMetaList = async () => { if (phase === 'table-list') { started.resolve(); await gate.promise; } return []; };
      host.sdk.base.addTable = async config => { creates++; const result = await add(config); if (phase === 'table-created') { started.resolve(); await gate.promise; } const table = host.state.tables[0]; table.setField = async () => { fields++; }; table.addField = async () => { fields++; }; return result; };
      pending = host.view.submit(); await started.promise; host.unmount(); gate.resolve(); await pending;
      assert.equal(creates, phase === 'table-list' ? 0 : 1); assert.equal(fields, 0); assert.equal(host.view.toastVisible.value, false);
    } finally { gate.resolve(); await pending; await host.close(); }
  });
}

test('独立推荐词字段读取失败保留原错误及本页结果，修正后续写不重新搜索', async () => {
  const host = await mount(); let searches = 0, additions = 0;
  try {
    const table = fakeTable('target', '结果', [{ id: 'kw', name: '搜索关键词', type: 1 }, { id: 'rec', name: '推荐词', type: 1 }]);
    const read = table.getFieldById, add = table.addField;
    host.state.tables.push(table); host.view.form.value.outputType = 2; host.view.form.value.table_id = 'target'; await flush();
    table.getFieldById = async () => { throw new Error('推荐词字段读取超时'); };
    table.addField = async config => { additions++; return add(config); };
    host.view.selectedFieldKeys.value = ['keyword', 'recommendation'];
    host.state.axiosHandler = async config => { if (config.data?.keyword) searches++; return { data: { sta: 0, data: { items: [{ keyword: '猫咪', recommendation: '猫粮' }] } } }; };
    await host.view.submit();
    assert.equal(additions, 0); assert.equal(table.records.length, 0);
    assert.match(host.view.toastText.value, /推荐词字段读取超时/);
    assert.match(await host.render(), />继续写入</);
    assert.equal(host.states.at(-1), true);
    table.getFieldById = read; await host.view.handleTaskAction();
    assert.equal(searches, 1); assert.equal(table.records.length, 1);
    assert.match(await host.render(), />立即执行</); assert.equal(host.states.at(-1), false);
  } finally { await host.close(); }
});

async function failedFieldFixture() {
  const host = await mount(), table = fakeTable('B', 'B', [
    { id: 'keyword', name: '搜索关键词', type: 1 }, { id: 'mapped', name: '自定义推荐词', type: 1 }, { id: 'notes', name: '备注', type: 1 },
  ], [{ recordId: 'old', fields: { keyword: '猫咪', mapped: '旧词', notes: '保留备注' } }]);
  let read = async () => { throw new Error('字段读取原始原因'); };
  const metadata = table.getFieldMetaList;
  table.getFieldMetaList = async () => { await read(); return metadata(); };
  const requests = [];
  host.state.tables.push(table); host.sdk.base.getTableList = async () => [table];
  host.state.axiosHandler = async config => {
    requests.push(config);
    if (config.url.endsWith('table-output-configs')) return { data: { sta: 0, data: [{ target_table_id: 'B', field_mappings: [{ source_key: 'recommendation', target_field_id: 'mapped' }] }] } };
    if (config.method === 'put') return { data: { sta: 0, data: config.data } };
    return { data: { sta: 0, data: { items: [{ keyword: '猫咪', recommendation: '新词' }] } } };
  };
  await host.view.loadTableOutputConfigs();
  host.view.selectedFieldKeys.value = ['keyword', 'recommendation'];
  host.view.form.value.outputType = 2; host.view.form.value.table_id = 'B'; await flush();
  return { ...host, table, requests, read: fn => { read = fn; }, searches: () => requests.filter(config => config.url.endsWith('/search/suggestions')).length };
}

test('独立推荐词真实Vue：读取失败保留原错误，执行重读等待无搜索，成功后写映射原列', async () => {
  const host = await failedFieldFixture(), gate = deferred(); let pending;
  try {
    assert.match(host.state.notices.at(-1).message, /字段读取原始原因/);
    host.read(() => gate.promise); pending = host.view.submit(); await flush();
    assert.equal(host.view.mappingLoading.value, true); assert.equal(host.searches(), 0);
    assert.equal(host.table.records.length, 1);
    gate.resolve(); await pending;
    assert.equal(host.searches(), 1);
    assert.equal(host.table.records[1].fields.mapped, '新词');
    assert.equal(host.table.fields.some(field => field.name === '推荐词'), false);
    assert.equal(host.table.records[0].fields.notes, '保留备注');
  } finally { gate.resolve(); await pending; await host.close(); }
});

test('独立推荐词真实Vue：重读再次失败保留本次原因，同页再试恢复映射后才搜索写入', async () => {
  const host = await failedFieldFixture();
  try {
    host.read(async () => { throw new Error('重试的原始原因'); });
    await host.view.submit();
    assert.match(host.view.toastText.value, /重试的原始原因/);
    assert.equal(host.searches(), 0); assert.equal(host.table.records.length, 1);
    assert.equal(host.table.fields.some(field => field.name === '推荐词'), false);
    host.read(async () => {}); await host.view.submit();
    assert.equal(host.searches(), 1); assert.equal(host.table.records[1].fields.mapped, '新词');
    assert.equal(host.table.fields.some(field => field.name === '推荐词'), false);
  } finally { await host.close(); }
});

test('独立推荐词真实Vue：读取失败切换新建不被旧错误阻塞', async () => {
  const host = await failedFieldFixture();
  try {
    host.read(async () => {}); host.view.form.value.outputType = 1; await flush(); await host.view.submit();
    assert.equal(host.searches(), 1); assert.equal(host.state.tables.length, 2);
    assert.equal(host.state.tables[1].records.length, 1); assert.equal(host.table.records.length, 1);
  } finally { await host.close(); }
});

test('独立推荐词真实Vue：失败后重读句柄等待时卸载，不再读取字段和搜索', async () => {
  const host = await failedFieldFixture(), gate = deferred(); let pending;
  try {
    let reads = 0;
    host.read(async () => { reads++; });
    const getTable = host.sdk.base.getTableById;
    host.sdk.base.getTableById = async id => { await gate.promise; return getTable(id); };
    pending = host.view.submit(); await flush(); host.unmount(); gate.resolve(); await pending;
    assert.equal(reads, 0); assert.equal(host.searches(), 0);
    assert.equal(host.table.fields.some(field => field.name === '推荐词'), false);
  } finally { gate.resolve(); await pending; await host.close(); }
});

async function cloudConfigFixture() {
  const host = await mount(), table = fakeTable('B', '推荐词B', [
    { id: 'keyword', name: '搜索关键词', type: 1 }, { id: 'mapped', name: '指定推荐词', type: 1 }, { id: 'notes', name: '备注', type: 1 },
  ], [{ recordId: 'old', fields: { keyword: '猫咪', mapped: '旧词', notes: '保留备注' } }]);
  let readConfig = async () => { throw new Error('云端配置网络原错'); };
  const requests = [], mappings = [{ source_key: 'recommendation', target_field_id: 'mapped' }];
  host.state.tables.push(table); host.sdk.base.getTableList = async () => [table];
  host.state.axiosHandler = async config => {
    requests.push(config);
    if (config.url.endsWith('table-output-configs')) return readConfig();
    if (config.method === 'put') return { data: { sta: 0, data: config.data } };
    return { data: { sta: 0, data: { items: [{ keyword: '猫咪', recommendation: '新词' }] } } };
  };
  await host.view.loadTableOutputConfigs();
  host.view.selectedFieldKeys.value = ['keyword', 'recommendation'];
  host.view.form.value.outputType = 2; host.view.form.value.table_id = 'B'; await flush();
  return { ...host, table, requests, mappings, read: fn => { readConfig = fn; },
    success: () => ({ data: { sta: 0, data: [{ target_table_id: 'B', field_mappings: mappings }] } }),
  };
}

for (const [failure, expected] of [['network', /再次网络原错/], ['business', /云端配置业务原错/], ['missing-list', /表格配置返回格式不正确/]]) {
  test(`推荐词云端配置${failure}失败：执行重试保留本次原因，不补列、写表、保存或搜索`, async () => {
    const host = await cloudConfigFixture();
    try {
      const original = new Error('再次网络原错');
      host.read(async () => {
      if (failure === 'network') throw original;
      if (failure === 'missing-list') return { data: { sta: 0, data: {} } };
      return { data: { sta: 1005, msg: '云端配置业务原错', data: [] } };
    });
      await host.view.submit(); await flush();
      assert.match(host.view.toastText.value, expected);
      if (failure === 'network') assert.equal(host.view.tableConfigsError, original);
      assert.equal(host.requests.filter(config => config.method === 'post' || config.method === 'put').length, 0);
      assert.equal(host.table.writes, 0); assert.equal(host.table.fields.length, 3);
      assert.equal(host.view.submitting.value, false); assert.equal(host.view.loading.value, false);
    } finally { await host.close(); }
  });
}

test('推荐词云端配置重试延迟时保持忙碌，成功恢复原映射后追加原列', async () => {
  const host = await cloudConfigFixture(), gate = deferred(); let pending;
  try {
    host.read(async () => { await gate.promise; return host.success(); });
    pending = host.view.submit(); await flush(); await host.view.submit();
    assert.equal(host.view.submitting.value, true);
    assert.equal(host.requests.filter(config => config.method === 'post' || config.method === 'put').length, 0);
    gate.resolve(); await pending;
    assert.equal(host.requests.filter(config => config.url.endsWith('table-output-configs')).length, 2);
    assert.equal(host.table.records.length, 2); assert.equal(host.table.records[1].fields.mapped, '新词');
    assert.equal(host.table.records[0].fields.notes, '保留备注'); assert.equal(host.table.fields.length, 3);
    assert.match(host.view.toastText.value, /已写入 1 条/);
  } finally { gate.resolve(); await pending; await host.close(); }
});

for (const output of ['empty-config', 'new-table']) {
  test(`推荐词云端配置${output}仍正常写入默认列`, async () => {
    const host = await cloudConfigFixture();
    try {
      if (output === 'empty-config') host.read(async () => ({ data: { sta: 0, data: [] } }));
      else { host.view.form.value.outputType = 1; await flush(); }
      await host.view.submit();
      const target = output === 'new-table' ? host.state.tables[1] : host.table;
      const name = target.fields.find(field => field.name === '推荐词');
      assert.ok(name); assert.equal(target.records.at(-1).fields[name.id], '新词');
      assert.equal(host.table.records[0].fields.notes, '保留备注');
    } finally { await host.close(); }
  });
}

test('推荐词云端配置失败不阻断本页待写结果，续写只使用原快照', async () => {
  const host = await cloudConfigFixture();
  try {
    host.read(async () => host.success()); await host.view.loadTableOutputConfigs(); await host.view.loadTableFields('B');
    const add = host.table.addRecords; let attempts = 0;
    host.table.addRecords = async rows => { if (++attempts === 1) throw new Error('SDK 暂时不可写'); return add(rows); };
    await host.view.submit(); assert.ok(host.view.pendingWrite.value);
    host.read(async () => { throw new Error('云端配置又失败'); }); await host.view.loadTableOutputConfigs();
    await host.view.submit();
    assert.equal(host.requests.filter(config => config.url.endsWith('/search/suggestions')).length, 1);
    assert.equal(host.table.records.length, 2); assert.equal(host.table.records[1].fields.mapped, '新词');
    assert.equal(host.table.records[0].fields.notes, '保留备注'); assert.equal(host.view.pendingWrite.value, null);
  } finally { await host.close(); }
});

for (const late of ['success', 'failure']) {
  test(`推荐词首次云端配置仍在等待时执行，原loader重试成功后旧${late}不覆盖映射或误保存`, async () => {
    const gate = deferred(), requests = [];
    const table = fakeTable('B', '推荐词B', [
      { id: 'keyword', name: '搜索关键词', type: 1 }, { id: 'mapped', name: '指定推荐词', type: 1 },
    ]);
    let reads = 0;
    const mappings = [{ source_key: 'recommendation', target_field_id: 'mapped' }];
    const host = await mount(host => {
      host.state.tables.push(table);
      host.state.axiosHandler = async config => {
        requests.push(config);
        if (config.url.endsWith('table-output-configs')) {
          if (++reads === 1) {
            await gate.promise;
            if (late === 'failure') throw new Error('旧初始化原错');
            return { data: { sta: 0, data: [] } };
          }
          return { data: { sta: 0, data: [{ target_table_id: 'B', field_mappings: mappings }] } };
        }
        if (config.method === 'put') return { data: { sta: 0, data: config.data } };
        return { data: { sta: 0, data: { items: [{ recommendation: '新词' }] } } };
      };
    });
    try {
      host.view.selectedFieldKeys.value = ['keyword', 'recommendation'];
      host.view.form.value.outputType = 2; host.view.form.value.table_id = 'B'; await flush();
      assert.equal(table.records.length, 0);
      assert.equal(requests.filter(config => config.method === 'put').length, 0);
      await host.view.submit();
      assert.equal(reads, 2); assert.equal(table.records.length, 1); assert.equal(table.records[0].fields.mapped, '新词');
      await flush();
      const savedConfigs = requests.filter(config => config.method === 'put').length;
      gate.resolve(); await flush();
      assert.deepEqual(host.view.mappingDraft.value.map(({ source_key, target_field_id }) => ({ source_key, target_field_id })), mappings);
      assert.deepEqual(host.view.tableOutputConfigs.value.B.field_mappings.map(({ source_key, target_field_id }) => ({ source_key, target_field_id })), mappings);
      assert.equal(requests.filter(config => config.method === 'put').length, savedConfigs);
      assert.equal(host.state.notices.length, 0);
    } finally { gate.resolve(); await flush(); await host.close(); }
  });
}

test('推荐词云端配置成功后执行保留当前用户映射草稿，不重新加载云端旧映射', async () => {
  const host = await cloudConfigFixture();
  try {
    host.read(async () => host.success()); await host.view.loadTableOutputConfigs(); await host.view.loadTableFields('B');
    host.table.fields.push({ id: 'edited', name: '本次手选列', type: 1 });
    host.view.tableFieldOptions.value = await host.table.getFieldMetaList();
    host.view.mappingDraft.value = [{ source_key: 'recommendation', target_field_id: 'edited' }]; await flush();
    const reads = host.requests.filter(config => config.url.endsWith('table-output-configs')).length;
    await host.view.submit();
    assert.equal(host.requests.filter(config => config.url.endsWith('table-output-configs')).length, reads);
    assert.equal(host.table.records[1].fields.edited, '新词');
    assert.equal(host.table.records[0].fields.mapped, '旧词');
  } finally { await host.close(); }
});
