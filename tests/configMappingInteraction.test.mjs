import test from 'node:test';
import { useTaskFeedback } from '../src/composables/useTaskFeedback.mjs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { loadComponent, mountComponent, findAll, deferred, flush as flushVue } from '../../social-comment-assistant/tests/helpers/component.mjs';
import { mappingControls, mappingButtons, addMapping, selectMappingTarget } from '../../social-data-bridge/tests/helpers/writeModeControls.mjs';
import { fakeTable, loadModules } from './helpers.mjs';
const require = createRequire(import.meta.url), types = require('@lark-base-open/js-sdk');
const flush = async () => { await new Promise(setImmediate); await flushVue(); };

async function fixture(t, { delayed = false, initialFail = true } = {}) {
  const host = await loadModules(['/src/composables/useSocialData.js', '/src/composables/useSuggestionData.js'], 'development', { mockAxios: true, realVue: true });
  let mounted;
  t.after(async () => { configGate?.resolve(); saveControl.wait?.resolve(); mounted?.app.unmount(); await host.close(); });
  let fail = initialFail;
  const saveControl = { wait: null };
  const configGate = delayed ? deferred() : null;
  const requests = [], mapping = [{ source_key: 'recommendation', target_field_id: 'mapped' }];
  const table = fakeTable('B', 'B', [
    { id: 'keyword', name: '搜索关键词', type: 1 }, { id: 'mapped', name: '原推荐词', type: 1 },
    { id: 'draft', name: '用户指定列', type: 1 }, { id: 'notes', name: '备注', type: 1 },
  ], [{ recordId: 'old', fields: { keyword: '猫咪', mapped: '旧词', notes: '保留备注' } }]);
  table.getName = async () => 'B'; host.state.tables.push(table); host.sdk.base.getTableList = async () => [table];
  const request = async config => {
    requests.push(config);
    if (config.method === 'put') await saveControl.wait?.promise;
    if (config.url.endsWith('table-output-configs')) {
      if (configGate) await configGate.promise;
      if (fail) throw new Error('云端配置原错');
      return { data: { sta: 0, data: [{ target_table_id: 'B', field_mappings: mapping }] } };
    }
    return { data: { sta: 0, data: config.data } };
  };
  host.state.axiosHandler = async () => ({ data: { sta: 0, data: { items: [{ keyword: '猫咪', recommendation: '新词' }] } } });
  const component = await loadComponent(new URL('../src/components/SearchSuggestions.vue', import.meta.url).pathname, {
    '@lark-base-open/js-sdk': { ...types, bitable: host.sdk }, '@/utils/request': { default: request, buildApiUrl: path => path },
    '@/composables/useTaskFeedback.mjs': { useTaskFeedback }, '@/composables/useSocialData': host.modules[0], '@/composables/useSuggestionData': host.modules[1],
    axios: { default: { post: async () => ({ data: { sta: 0, data: { items: [{ keyword: '猫咪', recommendation: '新词' }] } } }) } },
    'element-plus': { ElMessage() {} }, console: { log() {}, warn() {}, error() {} },
  });
  component.props.api_key = { type: String, default: 'test-only' };
  mounted = mountComponent(component, mappingControls());
  await flush(); const s = mounted.state;
  s.selectedFieldKeys.value = ['keyword', 'recommendation'];
  Object.assign(s.form.value, { social_type: 'xhs', keyword: '猫咪', outputType: 2, table_id: 'B' });
  s.mappingExpanded.value = true; await flush();
  return { ...mounted, s, table, requests, saveControl, configGate, setFail: value => { fail = value; } };
}

for (const delayed of [false, true]) {
  test(`独立推荐词配置编辑保护：${delayed ? '首次配置晚于字段返回' : '云端失败锁定映射'}，就绪后实际写入用户指定列`, async t => {
    const f = await fixture(t, { delayed }), s = f.s;
    assert.ok(mappingButtons(f.root).length);
    assert.ok(mappingButtons(f.root).every(button => button.props.disabled));
    assert.equal(addMapping(f.root), false);
    assert.equal(f.requests.some(r => r.method === 'put'), false);
    f.setFail(false);
    if (delayed) {
      f.configGate.resolve(); await flush(); await flush();
      assert.equal(s.mappingDraft.value[0]?.target_field_id, 'mapped', '字段先返回时，云成功必须应用当前表映射');
    } else { await s.loadTableOutputConfigs(); await s.loadTableFields('B'); await flush(); }
    assert.equal(selectMappingTarget(f.root, 'draft'), true); await flush();
    await s.submit(); await flush();
    assert.equal(f.table.records.length, 2);
    assert.equal(f.table.records[0].fields.mapped, '旧词');
    assert.equal(f.table.records[0].fields.notes, '保留备注');
    assert.equal(f.table.records[1].fields.draft, '新词');
    assert.equal(f.table.records[1].fields.mapped, undefined);
    assert.equal(f.requests.filter(r => r.method === 'put').at(-1).data.field_mappings[0].target_field_id, 'draft');
  });
}

for (const outcome of ['success', 'failure-before-fields']) {
  test(`独立推荐词待保存映射：${outcome}切走切回仍按新目标列追加`, async t => {
    const f = await fixture(t, { initialFail: false }), s = f.s;
    const save = deferred(), read = deferred(), getFields = f.table.getFieldMetaList;
    f.saveControl.wait = save;
    const start = f.requests.length;
    assert.equal(selectMappingTarget(f.root, 'draft'), true); await flush();
    s.form.value.outputType = 1; await flush();
    if (outcome === 'failure-before-fields') f.table.getFieldMetaList = async () => { await read.promise; return getFields(); };
    s.form.value.outputType = 2; s.form.value.table_id = 'B'; await flush();
    if (outcome === 'failure-before-fields') {
      save.reject(new Error('保存原错')); f.saveControl.wait = null; await flush(); read.resolve(); await flush();
    }
    assert.equal(s.mappingDraft.value[0]?.target_field_id, 'draft');
    save.resolve(); await flush(); await flush();
    await s.submit(); await flush();
    assert.equal(f.table.records.length, 2);
    assert.equal(f.table.records[0].fields.mapped, '旧词');
    assert.equal(f.table.records[1].fields.draft, '新词');
    assert.equal(f.table.records[0].fields.notes, '保留备注');
    assert.ok(f.requests.slice(start).filter(r => r.method === 'put').every(r => r.data.field_mappings[0]?.target_field_id === 'draft'));
  });
}

test('独立推荐词真实Vue：半填映射无逐行提示，执行仍拦截', async t => {
  const f = await fixture(t, { initialFail: false });
  for (const row of [{ source_key: 'recommendation', target_field_id: '' }, { source_key: '', target_field_id: 'mapped' }, { source_key: '', target_field_id: '' }]) {
    f.s.mappingDraft.value = [row]; await flush();
    await f.s.submit();
    assert.equal(f.s.loading.value, false);
    assert.equal(f.table.records[0].fields.mapped, '旧词');
    assert.equal(findAll(f.root, node => node.props?.class === 'mapping-validation').length, 0);
  }
  f.s.mappingDraft.value = [{ source_key: 'recommendation', target_field_id: 'mapped' }]; await flush();
  assert.equal(findAll(f.root, node => node.props?.class === 'mapping-validation').length, 0);
});
