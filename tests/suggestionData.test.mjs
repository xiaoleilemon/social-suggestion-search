import test from 'node:test';
import assert from 'node:assert/strict';
import { bitable } from '@lark-base-open/js-sdk';
import { installSDKCells } from '../../social-data-bridge/tests/helpers/sdkTable.mjs';
import { fakeTable, loadModules } from './helpers.mjs';

import { mountComponent } from '../../social-comment-assistant/tests/helpers/component.mjs';

const paths = ['/src/composables/useSuggestionData.js'];

test('独立推荐词空日期追加已生效但响应超时：继续仅核对本批，保留历史重复', async () => {
  const host = await loadModules(paths);
  try {
    const table = fakeTable('target', '推荐词', [{ id: 'kw', name: '搜索关键词', type: 1 },
      { id: 'rec', name: '推荐词', type: 1 }, { id: 'date', name: '提取时间', type: 5 }],
    [{ recordId: 'historical', fields: { kw: '猫咪', rec: '猫粮', date: null } }]);
    host.state.tables.push(table);
    const add = table.addRecords; let fail = true;
    table.addRecords = async batch => {
      const ids = await add(batch);
      if (fail) { fail = false; throw new Error('空日期写入已生效但响应超时'); }
      return ids;
    };
    const writer = host.modules[0].useSuggestionData('test-only'), appendState = {};
    const write = () => writer.createAndWriteData([{ keyword: '猫咪', recommendation: '猫粮', ctime: null }],
      'stream', 'task', 'target', ['ctime'], { stopAfterCurrentBatch: true, writeMode: 'append', appendState });
    await assert.rejects(write(), /空日期写入已生效但响应超时/);
    assert.equal(table.records[1].fields.date, null);
    await write();
    assert.equal(table.records.length, 2);
    assert.equal(table.writes, 1);
    assert.equal(appendState.pendingCount, 0);
    assert.equal(table.records[0].recordId, 'historical');
  } finally { await host.close(); }
});

for (const parallelCellCreation of [false, true]) {
  test(`独立推荐词：日期空值按 null 追加，零不丢失（并行=${parallelCellCreation}）`, async () => {
    const host = await loadModules(paths);
    try {
      const table = fakeTable('target', '推荐词', [{ id: 'kw', name: '搜索关键词', type: 1 }, { id: 'rec', name: '推荐词', type: 1 },
        { id: 'date', name: '提取时间', type: 5 }]);
      host.state.tables.push(table);
      const writer = host.modules[0].useSuggestionData('test-only');
      for (const input of [null, undefined, '', 0]) {
        await writer.createAndWriteData([{ keyword: '猫咪', recommendation: '猫粮', ctime: input }], 'stream', 'task', 'target',
          ['ctime'], { stopAfterCurrentBatch: true, writeMode: 'append', parallelCellCreation });
        assert.equal(table.records.at(-1).fields.date, input === 0 ? 0 : null);
      }
    } finally { await host.close(); }
  });
}

test('超过200条推荐词在新建表和现有映射表分批完整写入', async t => {
  for (const useExisting of [false, true]) {
    await t.test(useExisting ? '现有映射表' : '新建表', async () => {
      const host = await loadModules(paths);
      try {
        const batchSizes = [];
        const checkBatchSize = table => {
          const addRecords = table.addRecords;
          table.addRecords = async records => {
            batchSizes.push(records.length);
            if (records.length > 200) throw new Error('SDK addRecords 单次最多 200 条');
            return addRecords(records);
          };
        };
        if (useExisting) {
          const table = fakeTable('target', '推荐词', [
            { id: 'kw', name: '自定义关键词', type: 1 }, { id: 'rec', name: '自定义推荐词', type: 1 },
          ]);
          checkBatchSize(table);
          host.state.tables.push(table);
        } else {
          const addTable = host.sdk.base.addTable;
          host.sdk.base.addTable = async args => {
            const result = await addTable(args);
            checkBatchSize(await host.sdk.base.getTableById(result.tableId));
            return result;
          };
        }
        const rows = Array.from({ length: 401 }, (_, i) => ({ keyword: '猫咪', recommendation: `推荐词${i}` }));
        const result = await host.modules[0].useSuggestionData('test-key').createAndWriteData(
          rows, useExisting ? 'stream' : '', '', useExisting ? 'target' : '', ['keyword', 'recommendation'], {
            stopAfterCurrentBatch: true, writeMode: 'append', parallelCellCreation: true,
            fieldMappings: useExisting ? [{ source_key: 'keyword', target_field_id: 'kw' }, { source_key: 'recommendation', target_field_id: 'rec' }] : [],
          },
        );
        const table = await host.sdk.base.getTableById(result.tableId);
        const recommendationId = useExisting ? 'rec' : table.fields.find(field => field.name === '推荐词').id;
        assert.deepEqual(batchSizes, [200, 200, 1]);
        assert.equal(table.records.length, 401);
        assert.deepEqual(table.records.map(record => record.fields[recommendationId]), rows.map(row => row.recommendation));
        assert.deepEqual(result.recordIds, table.records.map(record => record.recordId));
        assert.equal(host.state.tables.length, 1);
      } finally { await host.close(); }
    });
  }
});

test('新建表写入失败保留原错误，只创建一次目标表', async () => {
  const host = await loadModules(paths);
  try {
    const addTable = host.sdk.base.addTable;
    host.sdk.base.addTable = async args => {
      if (host.state.tables.length) throw new Error('不应再次新建表');
      const result = await addTable(args);
      host.state.tables[0].addRecords = async () => { throw new Error('写入服务不可用'); };
      return result;
    };
    await assert.rejects(host.modules[0].useSuggestionData('test-key').createAndWriteData([
      { keyword: '猫咪', recommendation: '猫粮' },
    ], '', '', '', ['keyword', 'recommendation'], { stopAfterCurrentBatch: true, writeMode: 'append' }), /写入服务不可用/);
    assert.equal(host.state.tables.length, 1);
    assert.equal(host.state.tables[0].records.length, 0);
  } finally { await host.close(); }
});

test('写入时映射失效或字段类型变化必须抛错，不静默漏写或换表', async t => {
  for (const scenario of [
    { name: '映射目标被删除', fields: [{ id: 'rec', name: '推荐词', type: 1 }] },
    { name: '映射目标改成数字', fields: [{ id: 'kw', name: '关键词', type: 2 }, { id: 'rec', name: '推荐词', type: 1 }] },
  ]) {
    await t.test(scenario.name, async () => {
      const host = await loadModules(paths);
      try {
        const table = fakeTable('target', '结果', scenario.fields);
        host.state.tables.push(table);
        await assert.rejects(host.modules[0].useSuggestionData('test-key').createAndWriteData([
          { keyword: '猫咪', recommendation: '猫粮' },
        ], 'stream', '', 'target', ['keyword', 'recommendation'], {
          stopAfterCurrentBatch: true, writeMode: 'append',
          fieldMappings: [{ source_key: 'keyword', target_field_id: 'kw' }, { source_key: 'recommendation', target_field_id: 'rec' }],
        }), /字段/);
        assert.equal(table.records.length, 0);
        assert.equal(host.state.tables.length, 1);
      } finally { await host.close(); }
    });
  }
});

test('推荐词字段默认选择必需项，并保留平台与提取时间', async () => {
  const host = await loadModules(paths);
  try {
    const mapping = host.modules[0].SUGGESTION_FIELD_MAPPING;
    assert.deepEqual(mapping.map(field => field.key), [
      'keyword', 'recommendation', 'suggestion_type', 'suggestion_label', 'description', 'social_type', 'ctime',
    ]);
    assert.deepEqual(mapping.filter(field => field.required).map(field => field.key), ['keyword', 'recommendation']);
  } finally { await host.close(); }
});

test('新建推荐词表处理重名，并写入全部选定字段', async () => {
  const host = await loadModules(paths);
  try {
    host.state.tables.push(fakeTable('old', '搜索推荐词'));
    const writer = host.modules[0].useSuggestionData('test-key');
    const result = await writer.createAndWriteData([
      {
        keyword: '猫咪',
        recommendation: '猫粮',
        suggestion_type: 'related',
        suggestion_label: '热门',
        description: '推荐说明',
        social_type: 'xhs',
        ctime: 1700000000,
      },
    ], '', '', '', ['keyword', 'recommendation', 'suggestion_type', 'suggestion_label', 'description', 'social_type', 'ctime'], {
      stopAfterCurrentBatch: true,
      writeMode: 'append',
    });
    const table = host.state.tables.find(table => table.id === result.tableId);
    assert.equal(table.name, '搜索推荐词1');
    const values = Object.fromEntries(table.fields.map(field => [field.name, table.records[0].fields[field.id]]));
    assert.deepEqual(values, {
      搜索关键词: '猫咪',
      推荐词: '猫粮',
      建议类型: 'related',
      建议标记: '热门',
      补充说明: '推荐说明',
      平台: 'xhs',
      提取时间: 1700000000000,
    });
  } finally { await host.close(); }
});

test('现有表使用显式映射写入推荐词', async () => {
  const host = await loadModules(paths);
  try {
    const table = fakeTable('target', '结果', [
      { id: 'kw', name: '自定义关键词', type: 1 },
      { id: 'rec', name: '自定义推荐词', type: 1 },
      { id: 'created', name: '自定义时间', type: 5 },
    ]);
    host.state.tables.push(table);
    const writer = host.modules[0].useSuggestionData('test-key');
    const result = await writer.createAndWriteData([
      { keyword: '猫咪', recommendation: '猫粮', ctime: 1700000000 },
    ], 'stream', '', 'target', ['keyword', 'recommendation', 'ctime'], {
      stopAfterCurrentBatch: true,
      writeMode: 'append',
      fieldMappings: [
        { source_key: 'keyword', target_field_id: 'kw' },
        { source_key: 'recommendation', target_field_id: 'rec' },
        { source_key: 'ctime', target_field_id: 'created' },
      ],
    });
    assert.equal(result.tableId, 'target');
    assert.deepEqual(table.records[0].fields, {
      kw: '猫咪',
      rec: '猫粮',
      created: 1700000000000,
    });
  } finally { await host.close(); }
});

test('目标字段类型不兼容时阻止写入', async () => {
  const host = await loadModules(paths);
  try {
    host.state.tables.push(fakeTable('target', '结果', [{ id: 'kw', name: '搜索关键词', type: 2 }]));
    const writer = host.modules[0].useSuggestionData('test-key');
    const valid = await writer.validateTableFields('target', ['keyword'], {
      fieldMappings: [{ source_key: 'keyword', target_field_id: 'kw' }],
    });
    assert.equal(valid, false);
    assert.equal(host.state.tables[0].records.length, 0);
  } finally { await host.close(); }
});

for (const scenario of ['type-error', 'create-error', 'created']) {
  test(`非任务字段校验 ${scenario} 保持校验结果并使用有明确时长的顶部Message`, async () => {
    const host = await loadModules(paths);
    try {
      const fields = [{ id: 'kw', name: '搜索关键词', type: scenario === 'type-error' ? 2 : 1 }];
      if (scenario === 'type-error') fields.push({ id: 'rec', name: '推荐词', type: 1 });
      const table = fakeTable('target', '推荐词', fields);
      if (scenario === 'create-error') table.addField = async () => { throw new Error('SDK拒绝添加字段'); };
      host.state.tables.push(table);
      const valid = await host.modules[0].useSuggestionData('test-key').validateTableFields('target', ['keyword', 'recommendation']);
      assert.equal(valid, scenario === 'created'); assert.equal(table.records.length, 0);
      assert.equal(host.state.notices.length, 1);
      const notice = host.state.notices[0];
      assert.equal(notice.type, scenario === 'created' ? 'success' : 'error');
      assert.equal(notice.plain, true);
      assert.equal(notice.duration, scenario === 'created' ? 3000 : scenario === 'type-error' ? 8000 : 5000);
      assert.equal('title' in notice, false);
      assert.match(notice.message, scenario === 'type-error' ? /输出字段"搜索关键词" 类型不匹配.*修正目标字段类型后重试/ : scenario === 'create-error' ? /添加字段 "推荐词" 失败/ : /已自动添加 1 个字段/);
      if (scenario === 'type-error') assert.doesNotMatch(notice.message, /重新(?:进入|打开)|关闭/);
      if (scenario === 'created') assert.equal(table.fields.some(field => field.name === '推荐词'), true);
    } finally { await host.close(); }
  });
}

test('共享顶部错误帮助函数明确使用3秒并保留原错误', async () => {
  const host = await loadModules(['/src/composables/useSocialData.js']);
  try {
    host.modules[0].showErrorMsg('原校验错误');
    assert.deepEqual(host.state.notices, [{ message: '原校验错误', type: 'error', plain: true, duration: 3000 }]);
  } finally { await host.close(); }
});


for (const parallelCellCreation of [false, true]) {
  test(`独立推荐词共用写表副本 SDK 1.0.2：缓存数字字段改成文本后正确追加（并行=${parallelCellCreation}）`, async () => {
    const host = await loadModules(['/src/composables/useSocialData.js', 'vue'], 'development', { realVue: true });
    try {
      const table = fakeTable('target', '共用写表测试', [{ id: 'count', name: '点赞数', type: 2 }]);
      host.state.tables.push(table);
      await installSDKCells(table, bitable);
      let writer;
      const mounted = mountComponent({ setup() { writer = host.modules[0].useSocialData(() => '共用写表测试', '', host.modules[0].KEYWORD_SEARCH_FIELD_MAPPING); return () => null; } }, { runtime: host.modules[1] });
      try {
        await writer.validateTableFields('target', ['digg_count'], { throwOnError: true });
        table.fields[0].type = 1;
        await writer.createAndWriteData([{ digg_count: 0 }], 'stream', 'task', 'target', ['digg_count'], { stopAfterCurrentBatch: true, writeMode: 'append', parallelCellCreation });
        assert.equal(table.records.length, 1);
        assert.deepEqual(table.records[0].fields.count, [{ type: 'text', text: '0' }]);
      } finally { mounted.app.unmount(); }
    } finally { await host.close(); }
  });
}
