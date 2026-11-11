import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeTable, loadModules } from './helpers.mjs';

// 写入单测从配置就绪开始；初始化等待由真实 Vue 交互回归覆盖。
function setupReadyView(component) {
  const view = component.setup({ api_key: 'test-key' }, { emit() {}, expose() {} });
  view.fieldSelectionReady.value = true;
  return view;
}

test('核对按出现次数补写相同内容，超出预期的新增匹配则停止', async t => {
  for (const ambiguous of [false, true]) {
    await t.test(ambiguous ? '新增匹配多于预期' : '本批允许两行相同内容', async () => {
      const host = await loadModules(['/src/components/SearchSuggestions.vue'], 'development', { mockAxios: true });
      try {
        const table = fakeTable('target', '推荐词结果');
        const addRecords = table.addRecords;
        const sizes = [];
        table.addRecords = async records => {
          sizes.push(records.length);
          if (sizes.length === 1) {
            await addRecords(records.slice(0, 1));
            throw new Error('已落表但响应超时');
          }
          return addRecords(records);
        };
        host.state.tables.push(table);
        host.state.axiosHandler = async config => ({ data: { sta: 0, data: { items: Array.from({ length: ambiguous ? 1 : 2 }, () => ({ keyword: '猫咪', recommendation: '猫粮' })) } }, config });
        const view = setupReadyView(host.modules[0].default);
        view.form.value = { social_type: 'xhs', keyword: '猫咪', outputType: 2, table_id: 'target' };
        view.selectedFieldKeys.value = ['keyword', 'recommendation'];
        await view.submit();
        assert.equal(table.records.length, 1);
        if (ambiguous) table.records.push({ recordId: 'other-write', fields: { ...table.records[0].fields } });
        await view.submit();
        assert.equal(table.records.length, 2);
        if (ambiguous) {
          assert.deepEqual(sizes, [1]);
          assert.equal(view.pendingWrite.value.writtenCount, 0);
          assert.equal(view.toastVisible.value, true);
          assert.equal(view.toastType.value, 'error');
          assert.match(view.toastText.value, /多于预期/);
          assert.equal(host.state.notices.length, 0);
        } else {
          assert.deepEqual(sizes, [2, 1]);
          assert.match(view.toastText.value, /处理完成，已写入 2 条/);
        }
      } finally { await host.close(); }
    });
  }
});

test('已落表但响应超时后先核对失败批次，不重复新增或吞掉历史同内容记录', async t => {
  for (const useExisting of [false, true]) {
    await t.test(useExisting ? '现有映射表和跨页历史记录' : '新建表', async () => {
      const host = await loadModules(['/src/components/SearchSuggestions.vue'], 'development', { mockAxios: true });
      try {
        const batchSizes = [];
        let failRead = false;
        const install = table => {
          const addRecords = table.addRecords;
          table.addRecords = async records => {
            batchSizes.push(records.length);
            const ids = await addRecords(records);
            if (batchSizes.length === 2) throw new Error('写入已生效但响应超时');
            return ids;
          };
          table.getRecordsByPage = async ({ pageToken }) => {
            if (failRead) { failRead = false; throw new Error('核对查询暂时失败'); }
            const offset = Number(pageToken || 0);
            const page = structuredClone(table.records.slice(offset, offset + 200));
            for (const record of page) {
              for (const field of table.fields.filter(field => field.type === 1)) {
                const value = record.fields[field.id];
                if (typeof value === 'string') record.fields[field.id] = [{ type: 'text', text: value }];
              }
              for (const field of table.fields.filter(field => field.type === 3)) {
                const value = record.fields[field.id];
                if (typeof value === 'string') record.fields[field.id] = { id: 'option-xhs', text: value };
              }
            }
            return { records: page, hasMore: offset + 200 < table.records.length, pageToken: String(offset + 200) };
          };
        };
        const historical = Array.from({ length: 201 }, (_, i) => ({ recordId: `history-${i}`, fields: { kw: '猫咪', rec: `推荐词${i + 200}` } }));
        if (useExisting) {
          const table = fakeTable('target', '推荐词结果', [
            { id: 'kw', name: '自定义关键词', type: 1 }, { id: 'rec', name: '自定义推荐词', type: 1 },
            { id: 'platform', name: '来源', type: 3 }, { id: 'created', name: '时间', type: 5 },
          ], historical);
          install(table);
          host.state.tables.push(table);
        } else {
          const addTable = host.sdk.base.addTable;
          host.sdk.base.addTable = async args => {
            const result = await addTable(args);
            install(await host.sdk.base.getTableById(result.tableId));
            return result;
          };
        }
        let searches = 0;
        host.state.axiosHandler = async config => {
          if (config.url.endsWith('table-output-configs')) return { data: { sta: 0, data: [] } };
          searches++;
          return { data: { sta: 0, data: { items: Array.from({ length: 401 }, (_, i) => ({ keyword: '猫咪', recommendation: `推荐词${i}`, social_type: 'xhs', ctime: 1700000000 })) } }, config };
        };
        const view = setupReadyView(host.modules[0].default);
        await view.loadTableOutputConfigs();
        view.form.value = { social_type: 'xhs', keyword: '猫咪', outputType: useExisting ? 2 : 1, table_id: useExisting ? 'target' : '' };
        view.selectedFieldKeys.value = ['keyword', 'recommendation', 'social_type', 'ctime'];
        if (useExisting) view.mappingDraft.value = [{ source_key: 'keyword', target_field_id: 'kw' }, { source_key: 'recommendation', target_field_id: 'rec' }, { source_key: 'social_type', target_field_id: 'platform' }, { source_key: 'ctime', target_field_id: 'created' }];
        await view.submit();
        const table = host.state.tables[0];
        const baseline = useExisting ? 201 : 0;
        assert.equal(table.records.length, baseline + 400);
        assert.equal(view.pendingWrite.value.writtenCount, 200);

        // 无法读取目标表时不得把“未核实”当成“未写入”继续追加。
        failRead = true;
        await view.submit();
        assert.deepEqual(batchSizes, [200, 200]);
        assert.equal(table.records.length, baseline + 400);
        assert.equal(view.toastVisible.value, true);
        assert.equal(view.toastType.value, 'error');
        await view.submit();
        assert.deepEqual(batchSizes, [200, 200, 1]);
        assert.equal(searches, 1);
        assert.equal(table.records.length, baseline + 401);
        assert.equal(host.state.tables.length, 1);
        const recId = useExisting ? 'rec' : table.fields.find(field => field.name === '推荐词').id;
        assert.deepEqual(table.records.slice(baseline).map(record => record.fields[recId]), Array.from({ length: 401 }, (_, i) => `推荐词${i}`));
        if (useExisting) assert.deepEqual(table.records.slice(0, baseline), historical);
        assert.match(view.toastText.value, /处理完成，已写入 401 条/);
      } finally { await host.close(); }
    });
  }
});

test('超时批次部分记录落表时只补缺失行，保留同推荐词的不同字段内容', async () => {
  const host = await loadModules(['/src/components/SearchSuggestions.vue'], 'development', { mockAxios: true });
  try {
    const table = fakeTable('target', '推荐词结果');
    const addRecords = table.addRecords;
    const batchSizes = [];
    table.addRecords = async records => {
      batchSizes.push(records.length);
      if (batchSizes.length === 1) {
        await addRecords(records.filter((_, index) => index % 2 === 1));
        throw new Error('部分记录落表后超时');
      }
      return addRecords(records);
    };
    host.state.tables.push(table);
    host.state.axiosHandler = async config => ({ data: { sta: 0, data: { items: Array.from({ length: 201 }, (_, i) => ({ keyword: '猫咪', recommendation: '相同推荐词', description: `说明${i}` })) } }, config });
    const view = setupReadyView(host.modules[0].default);
    view.form.value = { social_type: 'xhs', keyword: '猫咪', outputType: 2, table_id: 'target' };
    view.selectedFieldKeys.value = ['keyword', 'recommendation', 'description'];
    await view.submit();
    assert.equal(table.records.length, 100);
    await view.submit();
    assert.deepEqual(batchSizes, [200, 100, 1]);
    assert.equal(table.records.length, 201);
    const descId = table.fields.find(field => field.name === '补充说明').id;
    assert.deepEqual(table.records.map(record => record.fields[descId]).sort(), Array.from({ length: 201 }, (_, i) => `说明${i}`).sort());
    assert.match(view.toastText.value, /处理完成，已写入 201 条/);
  } finally { await host.close(); }
});

test('分批失败后重试复用原结果和目标表，不重复已完成批次', async t => {
  for (const useExisting of [false, true]) {
    await t.test(useExisting ? '现有映射表' : '新建表', async () => {
      const host = await loadModules(['/src/components/SearchSuggestions.vue'], 'development', { mockAxios: true });
      try {
        const batchSizes = [];
        let failures = 0;
        const installWriter = table => {
          const addRecords = table.addRecords;
          table.addRecords = async records => {
            batchSizes.push(records.length);
            if (table.records.length === 200 && failures++ < 2) throw new Error('第二批暂时失败');
            return addRecords(records);
          };
        };
        if (useExisting) {
          const table = fakeTable('target', '推荐词结果', [
            { id: 'kw', name: '自定义关键词', type: 1 }, { id: 'rec', name: '自定义推荐词', type: 1 },
          ]);
          installWriter(table);
          host.state.tables.push(table);
        } else {
          const addTable = host.sdk.base.addTable;
          host.sdk.base.addTable = async args => {
            const result = await addTable(args);
            installWriter(await host.sdk.base.getTableById(result.tableId));
            return result;
          };
        }
        let searches = 0;
        host.state.axiosHandler = async config => {
          if (config.url.endsWith('table-output-configs')) return { data: { sta: 0, data: [] } };
          searches++;
          return { data: { sta: 0, data: { items: Array.from({ length: 401 }, (_, i) => ({ keyword: '猫咪', recommendation: `推荐词${searches}-${i}` })) } }, config };
        };
        const view = setupReadyView(host.modules[0].default);
        await view.loadTableOutputConfigs();
        view.form.value = { social_type: 'xhs', keyword: '猫咪', outputType: useExisting ? 2 : 1, table_id: useExisting ? 'target' : '' };
        view.selectedFieldKeys.value = ['keyword', 'recommendation'];
        if (useExisting) view.mappingDraft.value = [{ source_key: 'keyword', target_field_id: 'kw' }, { source_key: 'recommendation', target_field_id: 'rec' }];

        await view.submit();
        const table = host.state.tables[0];
        assert.equal(table.records.length, 200);
        await view.submit();
        assert.equal(table.records.length, 200);
        await view.submit();
        assert.equal(searches, 1);
        assert.equal(host.state.tables.length, 1);
        assert.deepEqual(batchSizes, [200, 200, 200, 200, 1]);
        assert.equal(table.records.length, 401);
        const recId = useExisting ? 'rec' : table.fields.find(field => field.name === '推荐词').id;
        assert.deepEqual(table.records.map(record => record.fields[recId]), Array.from({ length: 401 }, (_, i) => `推荐词1-${i}`));
        assert.match(view.toastText.value, /处理完成，已写入 401 条/);

        // 完成后的再次执行是一次新的追加，不能被失败恢复状态吞掉。
        await view.submit();
        assert.equal(searches, 2);
        assert.equal(host.state.tables.reduce((sum, item) => sum + item.records.length, 0), 802);
        assert.equal(host.state.tables.length, useExisting ? 1 : 2);
      } finally { await host.close(); }
    });
  }
});

test('全部批次写入后切表失败，重试不会再次写入或重新搜索', async () => {
  const host = await loadModules(['/src/components/SearchSuggestions.vue'], 'development', { mockAxios: true });
  try {
    let switches = 0;
    host.sdk.ui.switchToTable = async () => { if (++switches === 2) throw new Error('切换表格暂时失败'); };
    let searches = 0;
    host.state.axiosHandler = async config => {
      searches++;
      return { data: { sta: 0, data: { items: Array.from({ length: 401 }, (_, i) => ({ keyword: '猫咪', recommendation: `推荐词${i}` })) } }, config };
    };
    const view = setupReadyView(host.modules[0].default);
    view.form.value = { social_type: 'xhs', keyword: '猫咪', outputType: 1, table_id: '' };
    view.selectedFieldKeys.value = ['keyword', 'recommendation'];
    await view.submit();
    assert.equal(host.state.tables[0].records.length, 401);
    assert.equal(view.toastVisible.value, true);
    assert.equal(view.toastType.value, 'error');
    await view.submit();
    assert.equal(searches, 1);
    assert.equal(host.state.tables.length, 1);
    assert.equal(host.state.tables[0].writes, 3);
    assert.equal(host.state.tables[0].records.length, 401);
    assert.match(view.toastText.value, /处理完成，已写入 401 条/);
  } finally { await host.close(); }
});

test('新建表初始化失败后重试沿用已创建的目标表', async () => {
  const host = await loadModules(['/src/components/SearchSuggestions.vue'], 'development', { mockAxios: true });
  try {
    let switches = 0;
    host.sdk.ui.switchToTable = async () => { if (++switches === 1) throw new Error('初始化暂时失败'); };
    let searches = 0;
    host.state.axiosHandler = async config => {
      searches++;
      return { data: { sta: 0, data: { items: [{ keyword: '猫咪', recommendation: '猫粮' }] } }, config };
    };
    const view = setupReadyView(host.modules[0].default);
    view.form.value = { social_type: 'xhs', keyword: '猫咪', outputType: 1, table_id: '' };
    view.selectedFieldKeys.value = ['keyword', 'recommendation'];
    await view.submit();
    assert.equal(host.state.tables.length, 1);
    assert.equal(host.state.tables[0].records.length, 0);
    await view.submit();
    assert.equal(searches, 1);
    assert.equal(host.state.tables.length, 1);
    assert.equal(host.state.tables[0].records.length, 1);
    assert.match(view.toastText.value, /处理完成，已写入 1 条/);
  } finally { await host.close(); }
});

test('后续写入批次失败时保留已写入记录，不继续写入或提示成功', async () => {
  const host = await loadModules(['/src/components/SearchSuggestions.vue'], 'development', { mockAxios: true });
  try {
    const table = fakeTable('target', '推荐词结果');
    const addRecords = table.addRecords;
    const batchSizes = [];
    table.addRecords = async records => {
      batchSizes.push(records.length);
      if (records.length > 200) throw new Error('SDK addRecords 单次最多 200 条');
      if (batchSizes.length === 2) throw new Error('第二批写入失败');
      return addRecords(records);
    };
    host.state.tables.push(table);
    host.state.axiosHandler = async config => ({
      data: { sta: 0, data: { items: Array.from({ length: 401 }, (_, i) => ({ keyword: '猫咪', recommendation: `推荐词${i}` })) } }, config,
    });
    const view = setupReadyView(host.modules[0].default);
    view.form.value = { social_type: 'xhs', keyword: '猫咪', outputType: 2, table_id: 'target' };
    view.selectedFieldKeys.value = ['keyword', 'recommendation'];
    await view.submit();
    assert.deepEqual(batchSizes, [200, 200]);
    assert.equal(table.records.length, 200);
    assert.equal(host.state.tables.length, 1);
    assert.match(view.toastText.value, /第二批写入失败/);
    assert.equal(host.state.notices.length, 0);
    assert.equal(view.toastVisible.value, true);
    assert.equal(view.toastType.value, 'error');
    assert.doesNotMatch(view.toastText.value, /处理完成/);
    assert.equal(view.loading.value, false);
    assert.equal(view.submitting.value, false);
  } finally { await host.close(); }
});

test('映射目标表写入失败时显示原错误，不新建空表或提示成功', async () => {
  const host = await loadModules(['/src/components/SearchSuggestions.vue'], 'development', { mockAxios: true });
  try {
    const table = fakeTable('target', '结果表', [
      { id: 'kw', name: '自定义关键词', type: 1 }, { id: 'rec', name: '自定义推荐词', type: 1 },
    ]);
    table.addRecords = async () => { throw new Error('没有写入权限'); };
    host.state.tables.push(table);
    host.state.axiosHandler = async config => ({
      data: { sta: 0, data: { items: [{ keyword: '猫咪', recommendation: '猫粮' }] } }, config,
    });
    const view = setupReadyView(host.modules[0].default);
    view.form.value = { social_type: 'xhs', keyword: '猫咪', outputType: 2, table_id: 'target' };
    view.selectedFieldKeys.value = ['keyword', 'recommendation'];
    view.mappingDraft.value = [{ source_key: 'keyword', target_field_id: 'kw' }, { source_key: 'recommendation', target_field_id: 'rec' }];
    await view.submit();
    assert.match(view.toastText.value, /没有写入权限/);
    assert.equal(host.state.notices.length, 0);
    assert.equal(host.state.tables.length, 1);
    assert.equal(table.records.length, 0);
    assert.equal(view.toastVisible.value, true);
    assert.equal(view.toastType.value, 'error');
    assert.doesNotMatch(view.toastText.value, /处理完成/);
    assert.equal(view.loading.value, false);
    assert.equal(view.submitting.value, false);
  } finally { await host.close(); }
});

test('写入未返回完整记录ID时不显示完成', async () => {
  const host = await loadModules(['/src/components/SearchSuggestions.vue'], 'development', { mockAxios: true });
  try {
    const table = fakeTable('target', '结果表');
    table.addRecords = async () => [];
    host.state.tables.push(table);
    host.state.axiosHandler = async config => ({
      data: { sta: 0, data: { items: [{ keyword: '猫咪', recommendation: '猫粮' }] } }, config,
    });
    const view = setupReadyView(host.modules[0].default);
    view.form.value = { social_type: 'xhs', keyword: '猫咪', outputType: 2, table_id: 'target' };
    await view.submit();
    assert.equal(view.toastVisible.value, true);
    assert.equal(view.toastType.value, 'error');
    assert.match(view.toastText.value, /写入/);
    assert.equal(host.state.notices.length, 0);
    assert.doesNotMatch(view.toastText.value, /处理完成/);
  } finally { await host.close(); }
});

test('目标字段仍在读取时点击执行会等待加载完成再写入', async () => {
  const host = await loadModules(['/src/components/SearchSuggestions.vue'], 'development', { mockAxios: true });
  try {
    const table = fakeTable('target', '结果表');
    const getFieldMetaList = table.getFieldMetaList;
    table.getFieldMetaList = async () => {
      await new Promise(resolve => setTimeout(resolve, 30));
      return getFieldMetaList();
    };
    host.state.tables.push(table);
    host.state.axiosHandler = async config => ({
      data: config.url?.includes('/search/suggestions')
        ? { sta: 0, data: { items: [{ keyword: '猫咪', recommendation: '猫粮', ctime: 1700000000 }] } }
        : { sta: 0, data: [] },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    });

    const component = host.modules[0].default;
    const view = setupReadyView(component);
    view.form.value = { social_type: 'xhs', keyword: '猫咪', outputType: 2, table_id: 'target' };

    const loadingFields = view.loadTableFields('target');
    assert.equal(view.mappingLoading.value, true);
    await view.submit();
    await loadingFields;

    assert.equal(host.state.notices.some(notice => notice.message === '正在读取目标表字段，请稍后重试'), false);
    assert.equal(table.records.length, 1);
    assert.match(view.toastText.value, /处理完成，已写入 1 条/);
  } finally {
    await host.close();
  }
});
