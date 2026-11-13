import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { File } from 'node:buffer';
import { parse } from '@babel/parser';
import { loadRequestModule } from './helpers/feishuRequest.mjs';
import { fakeTable, loadModules } from './helpers.mjs';

for (const [mode, base] of [['production', 'https://api.socialdatax.com'], ['test', 'https://test-lotto.weiyoubot.cn'], ['development', '']]) {
  test(`${mode} 推荐词、表格配置的真实请求走新接口并保留参数`, async t => {
    const host = await loadModules(['/src/components/SearchSuggestions.vue', '/src/utils/request.js'], mode);
    t.after(host.close);
    const calls = [], api = host.modules[1];
    api.default.defaults.adapter = async config => {
      calls.push({ ...config, data: typeof config.data === 'string' ? JSON.parse(config.data) : config.data });
      return { config, status: 200, data: { sta: 0, data: config.url.endsWith('configs') ? [] : config.method === 'put' ? { target_table_id: 'target' } : { items: [{ recommendation: '猫粮', description: '说明' }] } } };
    };
    host.state.tables.push(fakeTable('target', '目标表'));
    const view = host.modules[0].default.setup({ api_key: 'test-only' }, { emit() {}, expose() {} });
    view.fieldSelectionReady.value = true;
    view.form.value.social_type = 'xhs';
    const rows = await view.fetchSuggestions('猫');
    assert.deepEqual(rows, [{ recommendation: '猫粮', description: '说明' }]);
    await view.loadTableOutputConfigs();
    await view.saveTableOutputConfig({ targetTableId: 'target', writeMode: 'append', fieldMappings: [{ source_key: 'keyword', target_field_id: 'kw' }] });
    assert.deepEqual(calls.map(c => c.url), [
      '/socialdatax/api/v1/feishu/search/suggestions',
      '/socialdatax/api/v1/feishu/profile-fetch/table-output-configs',
      '/socialdatax/api/v1/feishu/profile-fetch/table-output-config',
    ]);
    assert.ok(calls.every(c => c.baseURL === base && c.headers.authorization === 'Bearer test-only'));
    assert.deepEqual(calls[0].data, { social_type: 'xhs', keyword: '猫', version: 'web-10.29' });
    assert.equal(calls[1].params.plugin_type, 'search_suggestions');
    assert.equal(calls[2].data.target_table_id, 'target');
    assert.deepEqual(calls[2].data.field_mappings, [{ source_key: 'keyword', target_field_id: 'kw' }]);
  });
}

for (const failure of ['business-4001', 'http-401', 'http-403']) {
  test(`${failure} 鉴权失败停止后续推荐词请求`, async t => {
    const host = await loadModules(['/src/components/SearchSuggestions.vue', '/src/utils/request.js']);
    t.after(host.close);
    const calls = [];
    host.modules[1].default.defaults.adapter = async config => {
      calls.push(config);
      if (failure.startsWith('http')) {
        const error = new Error('API Key 无效');
        error.response = { status: Number(failure.slice(-3)), data: { msg: 'API Key 无效' } };
        throw error;
      }
      return { config, status: 200, data: { sta: 4001, msg: 'API Key 无效' } };
    };
    const view = host.modules[0].default.setup({ api_key: 'test-only' }, { emit() {}, expose() {} });
    view.fieldSelectionReady.value = true;
    view.form.value.social_type = 'xhs';
    await view.execute(['猫', '狗']);
    assert.equal(calls.length, 1);
    assert.equal(view.loading.value, false);
    assert.equal(view.toastType.value, 'error');
    assert.match(view.toastText.value, /API Key 无效/);
  });
}

test('附件下载使用新代理，嵌套 URL 完整编码且仅代理携带密钥', async () => {
  const api = loadRequestModule({ VITE_API_BASE_URL: 'https://api.52choujiang.cn', VITE_FEISHU_API_BASE_URL: 'https://api.socialdatax.com' });
  const source = fs.readFileSync(new URL('../src/composables/useSocialData.js', import.meta.url), 'utf8');
  const declarations = parse(source, { sourceType: 'module' }).program.body.filter(n => n.type === 'VariableDeclaration').flatMap(n => n.declarations);
  const calls = [];
  const bindings = { ...api, File, AbortController, setTimeout, clearTimeout, ATTACHMENT_DOWNLOAD_TIMEOUT: 1000,
    withAttachmentDownloadSlot: fn => fn(),
    fetch: async (url, options) => { calls.push({ url, options }); return { ok: true, blob: async () => new Blob(['image'], { type: 'image/webp' }) }; },
  };
  const fn = name => {
    const node = declarations.find(n => n.id.name === name).init;
    return new Function(...Object.keys(bindings), `return (${source.slice(node.start, node.end)});`)(...Object.values(bindings));
  };
  bindings.getBlobExtension = fn('getBlobExtension');
  const download = fn('downloadAttachmentAsFile');
  const url = 'https://sns-img.example/a.webp?a=1&b=2';
  await download(url, 'cover.jpg', 'test-only', true);
  const proxy = new URL(calls[0].url);
  assert.equal(proxy.origin, 'https://api.socialdatax.com');
  assert.equal(proxy.pathname, '/socialdatax/api/v1/feishu/xhs_download_proxy');
  assert.equal(proxy.searchParams.get('url'), url);
  assert.equal(proxy.searchParams.get('file_name'), 'cover.jpg');
  assert.equal(proxy.searchParams.get('image_mode'), 'xhs_cover');
  assert.equal(calls[0].options.headers.authorization, 'Bearer test-only');
  await download(url, 'cover.jpg', 'test-only');
  assert.equal(calls[1].url, url);
  assert.equal(calls[1].options.headers, undefined);
});
