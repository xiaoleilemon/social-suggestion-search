<script setup>
import { bitable } from '@lark-base-open/js-sdk';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { feishuRequest as request, buildFeishuApiPath } from '@/utils/request';
import { getDefaultSelectedFieldKeys } from '@/composables/useSocialData';
import { SUGGESTION_FIELD_MAPPING, useSuggestionData } from '@/composables/useSuggestionData';
import TaskFeedback from './TaskFeedback.vue';
import { useTaskFeedback } from '@/composables/useTaskFeedback.mjs';

const props = defineProps({ api_key: String, apiKeySaving: Boolean });
const emit = defineEmits(['task-state']);
let disposed = false;
const assertActive = () => { if (disposed) throw new Error('页面已卸载'); };
onUnmounted(() => { disposed = true; });

const TASK_PLUGIN_TYPE = 'search_suggestions';
const TABLE_CONFIG_API_PATH = buildFeishuApiPath('/v1/feishu/profile-fetch/table-output-config');
const TABLE_CONFIGS_API_PATH = buildFeishuApiPath('/v1/feishu/profile-fetch/table-output-configs');
const FIELD_SELECTION_STORAGE_KEY = 'search_suggestions_selected_fields_v1';

const PLATFORM_OPTIONS = [
  { value: 'xhs', label: '小红书' },
  { value: 'douyin', label: '抖音' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'kuaishou', label: '快手' },
  { value: 'bilibili', label: '哔哩哔哩' },
  { value: 'weibo', label: '微博' },
  { value: 'haokan', label: '好看视频' },
  { value: 'toutiao', label: '今日头条' },
  { value: 'baidu-tieba', label: '百度贴吧' },
  { value: 'zhihu', label: '知乎' },
  { value: 'x', label: 'X' },
  { value: 'youtube', label: 'YouTube' },
];

const FIELD_MAPPING = SUGGESTION_FIELD_MAPPING;

const form = ref({ social_type: 'xhs', keyword: '', outputType: 1, table_id: '' });
const tableOptions = ref([]);
const tableFieldOptions = ref([]);
const selectedFieldKeys = ref(getDefaultSelectedFieldKeys(FIELD_MAPPING));
const fieldSelectionReady = ref(false);
const mappingDraft = ref([]);
const mappingExpanded = ref(false);
const mappingLoading = ref(false);
const loading = ref(false);
const collecting = ref(false);
const stopRequested = ref(false);
const submitting = ref(false);
const pendingWrite = ref(null);
const busy = computed(() => !fieldSelectionReady.value || props.apiKeySaving || loading.value || submitting.value || !!pendingWrite.value);
const feedback = useTaskFeedback();
const { toastVisible, toastText, toastLoading, toastType, taskNotice, noticeRequiresReopen } = feedback;
let tableFieldsError = null;
let tableFieldsLoadPromise = null;
let tableFieldsLoadToken = 0;
const tableOutputConfigs = ref({});
const tableConfigsLoaded = ref(false);
let tableConfigsError = null;
let tableConfigsLoadToken = 0;
const tableConfigSaving = ref(false);
const tableConfigApplying = ref(false);
const outputConfigReady = computed(() => tableConfigsLoaded.value && !!form.value.table_id && !tableConfigApplying.value && !mappingLoading.value && !tableFieldsError);
const tableConfigSaves = new Map();
let tableConfigSaveQueued = false;

const allKeys = FIELD_MAPPING.map(field => field.key);
const allSelected = computed(() => allKeys.every(key => selectedFieldKeys.value.includes(key)));
const mappingStatus = computed(() => {
  if (form.value.outputType === 2 && !form.value.table_id) return '选择目标表格后可设置';
  const count = mappingDraft.value.filter(item => item.source_key && item.target_field_id).length;
  return count ? `已设置 ${count} 项映射` : '尚未设置自定义映射';
});
const { createAndWriteData, validateTableFields } = useSuggestionData(props.api_key);
watch([fieldSelectionReady, loading, submitting, pendingWrite, noticeRequiresReopen], ([ready, busy, preparing, pending, requiresReopen]) => {
  emit('task-state', !ready || busy || preparing || !!pending, !!pending && ready && !busy && !preparing, requiresReopen);
}, { immediate: true, flush: 'sync' });

const showToast = text => feedback.progress(text, { stopping: stopRequested.value });
const showError = (message, duration = 3000) => !disposed && ElMessage({ message, type: 'error', plain: true, duration });
const parseKeywords = text => [...new Set(String(text || '').split(/[\n,，]+/).map(item => item.trim()).filter(Boolean))];
const toggleAll = checked => {
  selectedFieldKeys.value = checked ? [...allKeys] : FIELD_MAPPING.filter(field => field.required).map(field => field.key);
};
const loadSelectedFieldKeys = async () => {
  const defaultKeys = getDefaultSelectedFieldKeys(FIELD_MAPPING);
  try {
    const savedValue = await bitable.bridge.getData(FIELD_SELECTION_STORAGE_KEY);
    if (disposed) return;
    if (!Array.isArray(savedValue)) {
      selectedFieldKeys.value = defaultKeys;
      return;
    }
    const validKeys = savedValue.filter(key => FIELD_MAPPING.some(field => field.key === key));
    const requiredKeys = FIELD_MAPPING.filter(field => field.required).map(field => field.key);
    selectedFieldKeys.value = Array.from(new Set([...validKeys, ...requiredKeys]));
  } catch (error) {
    if (disposed) return;
    console.error('读取推荐词输出字段失败:', error);
    selectedFieldKeys.value = defaultKeys;
  }
};
const saveSelectedFieldKeys = async keys => {
  try {
    const requiredKeys = FIELD_MAPPING.filter(field => field.required).map(field => field.key);
    await bitable.bridge.setData(FIELD_SELECTION_STORAGE_KEY, Array.from(new Set([...keys, ...requiredKeys])));
  } catch (error) {
    console.error('保存推荐词输出字段失败:', error);
  }
};

const loadTables = async () => {
  try {
    const tables = await bitable.base.getTableList();
    tableOptions.value = await Promise.all(tables.map(async table => ({ id: table.id, name: await table.getName() })));
  } catch (error) {
    showError('获取表格列表失败，请稍后重试', 5000);
  }
};
const getBaseId = async () => (await bitable.base.getSelection()).baseId || '';
const loadTableOutputConfigs = async () => {
  const token = ++tableConfigsLoadToken;
  tableConfigsLoaded.value = false;
  tableConfigsError = null;
  if (!props.api_key) return false;
  try {
    const baseId = await getBaseId();
    if (disposed || token !== tableConfigsLoadToken) return false;
    const response = await request({
      url: TABLE_CONFIGS_API_PATH,
      method: 'get',
      headers: { authorization: `Bearer ${props.api_key}` },
      params: { plugin_type: TASK_PLUGIN_TYPE, base_id: baseId },
    });
    if (disposed || token !== tableConfigsLoadToken) return false;
    if (response.data?.sta !== undefined && response.data.sta !== 0) throw new Error(response.data.msg || '读取表格输出配置失败');
    const data = response.data?.data || response.data;
    const list = Array.isArray(data) ? data : data?.list ?? data?.items;
    if (!Array.isArray(list)) throw new Error('表格配置返回格式不正确');
    tableOutputConfigs.value = Object.fromEntries(list.filter(item => item?.target_table_id).map(item => [item.target_table_id, item]));
    tableConfigsLoaded.value = true;
    if (form.value.outputType === 2 && form.value.table_id) await loadTableFields(form.value.table_id);
    return true;
  } catch (error) {
    if (disposed || token !== tableConfigsLoadToken) return false;
    tableConfigsError = error;
    if (!submitting.value) showError(error?.response?.data?.msg || error.message || '读取表格输出配置失败', 5000);
    return false;
  }
};
const loadTableFields = async tableId => {
  const token = ++tableFieldsLoadToken;
  const pendingConfig = tableConfigSaves.get(tableId)?.config;
  tableFieldsError = null;
  tableConfigApplying.value = true;
  tableFieldOptions.value = [];
  mappingDraft.value = [];
  if (!tableId) {
    mappingLoading.value = false;
    tableConfigApplying.value = false;
    tableFieldsLoadPromise = null;
    return true;
  }
  mappingLoading.value = true;
  const loadPromise = (async () => {
    try {
      const table = await bitable.base.getTableById(tableId);
      if (disposed || token !== tableFieldsLoadToken) return false;
      const fields = await table.getFieldMetaList();
      if (disposed || token !== tableFieldsLoadToken) return false;
      tableFieldOptions.value = fields.map(field => ({ id: field.id, name: field.name, type: field.type }));
      if (!tableConfigsLoaded.value) return false;
      const config = tableConfigSaves.get(tableId)?.config || pendingConfig || tableOutputConfigs.value[tableId];
      mappingDraft.value = Array.isArray(config?.field_mappings) ? config.field_mappings.map(item => ({ ...item })) : [];
      return true;
    } catch (error) {
      if (!disposed && token === tableFieldsLoadToken) {
        tableFieldsError = error;
        if (!submitting.value) showError(error.message || '读取目标表字段失败，请稍后重试', 5000);
      }
      return false;
    } finally {
      if (!disposed && token === tableFieldsLoadToken) {
        mappingLoading.value = false;
        tableConfigApplying.value = false;
      }
    }
  })();
  tableFieldsLoadPromise = loadPromise;
  const result = await loadPromise;
  if (tableFieldsLoadPromise === loadPromise) tableFieldsLoadPromise = null;
  return result;
};
const saveTableOutputConfig = async (outputConfig = null) => {
  outputConfig = outputConfig?.targetTableId ? outputConfig : null;
  if (disposed || !tableConfigsLoaded.value) return;
  if (!outputConfig && (form.value.outputType !== 2 || !form.value.table_id || tableConfigApplying.value)) return;
  if (!props.api_key || (!outputConfig && !tableFieldOptions.value.length)) return;
  let snapshot = outputConfig;
  if (!snapshot) {
    const targetTableId = form.value.table_id, writeMode = 'append';
    const fieldMappings = mappingDraft.value
      .filter(item => item.source_key && item.target_field_id)
      .map(item => {
        const source = FIELD_MAPPING.find(field => field.key === item.source_key);
        const target = tableFieldOptions.value.find(field => field.id === item.target_field_id);
        return {
          ...item,
          source_name: source?.name || item.source_name || '',
          target_field_name: target?.name || item.target_field_name || '',
          target_field_type: target?.type ?? item.target_field_type,
        };
      });
    snapshot = { targetTableId, writeMode, fieldMappings };
  }
  const { targetTableId, writeMode, fieldMappings } = snapshot;
  const pending = { snapshot, config: { write_mode: writeMode, field_mappings: fieldMappings } };
  tableConfigSaves.set(targetTableId, pending);
  if (tableConfigSaving.value) { tableConfigSaveQueued = true; return; }
  tableConfigSaveQueued = false;
  tableConfigSaving.value = true;
  try {
    const table = await bitable.base.getTableById(targetTableId);
    const payload = { plugin_type: TASK_PLUGIN_TYPE, base_id: await getBaseId(), target_table_id: targetTableId, target_table_name: await table.getName(), write_mode: writeMode, field_mappings: fieldMappings };
    if (disposed) return;
    const response = await request({ url: TABLE_CONFIG_API_PATH, method: 'put', headers: { authorization: `Bearer ${props.api_key}` }, data: payload });
    if (disposed) return;
    if (response.data?.sta !== undefined && Number(response.data.sta) !== 0) throw new Error(response.data.msg || '保存推荐词表格配置失败');
    tableOutputConfigs.value = { ...tableOutputConfigs.value, [targetTableId]: response.data?.data || response.data };
  } catch (error) { if (!disposed) console.error('保存推荐词表格配置失败:', error); }
  finally {
    if (tableConfigSaves.get(targetTableId) === pending) tableConfigSaves.delete(targetTableId);
    tableConfigSaving.value = false;
    tableConfigSaveQueued = tableConfigSaves.size > 0;
    if (tableConfigSaveQueued && !disposed) saveTableOutputConfig(tableConfigSaves.values().next().value.snapshot);
  }
};

const getMappingSourceFields = index => {
  const usedKeys = new Set(mappingDraft.value.filter((item, itemIndex) => itemIndex !== index).map(item => item.source_key).filter(Boolean));
  return FIELD_MAPPING.filter(field => field.required || selectedFieldKeys.value.includes(field.key))
    .map(field => ({ ...field, disabled: usedKeys.has(field.key) }));
};
const getMappingTargetFields = index => {
  const usedIds = new Set(mappingDraft.value.filter((item, itemIndex) => itemIndex !== index).map(item => item.target_field_id).filter(Boolean));
  return tableFieldOptions.value.map(field => ({ ...field, disabled: usedIds.has(field.id) }));
};

const fetchSuggestions = async keyword => {
  const response = await request({
    url: buildFeishuApiPath('/v1/feishu/search/suggestions'), method: 'post',
    data: { social_type: form.value.social_type, keyword },
    timeout: 60000, headers: { authorization: `Bearer ${props.api_key}` },
  });
  const result = response.data;
  if (result?.sta !== 0) {
    const error = new Error(result?.msg || '获取推荐词失败');
    if (Number(result?.sta) === 4001) error.code = 'INVALID_API_KEY';
    throw error;
  }
  return Array.isArray(result.data?.items) ? result.data.items : [];
};

const execute = async keywords => {
  if (disposed) return;
  loading.value = true;
  stopRequested.value = false;
  try {
    if (!pendingWrite.value) {
      const rows = [];
      const emptyKeywords = [];
      const failedKeywords = [];
      const failures = [];
      let authFailureReason = '';
      collecting.value = true;
      for (let index = 0; index < keywords.length; index += 1) {
        if (stopRequested.value) break;
        const keyword = keywords[index];
        showToast(`正在获取「${keyword}」（${index + 1}/${keywords.length}）…`);
        try {
          const items = await fetchSuggestions(keyword);
          if (disposed) return;
          if (!items.length) {
            emptyKeywords.push(keyword);
            continue;
          }
          rows.push(...items.map(item => ({
            keyword: item.keyword || keyword,
            recommendation: item.recommendation || '',
            suggestion_type: item.suggestion_type || '',
            suggestion_label: item.suggestion_label || '',
            description: item.description || '',
            social_type: item.social_type || form.value.social_type,
            ctime: item.ctime || '',
          })));
        } catch (error) {
          if (disposed) return;
          failedKeywords.push(keyword);
          const reason = error?.response?.data?.msg || error.message || '获取推荐词失败';
          failures.push(`「${keyword}」：${reason}`);
          if (error.code === 'INVALID_API_KEY' || [401, 403].includes(error.response?.status)) {
            authFailureReason = reason;
            break;
          }
          if (!stopRequested.value) feedback.recordFailure(error, { index: index + 1 });
        }
      }

      collecting.value = false;
      if (!rows.length) {
        if (authFailureReason) throw new Error(authFailureReason);
        if (stopRequested.value) {
          feedback.finish(`任务已停止，已写入 0 条推荐词${failedKeywords.length ? `（${failedKeywords.length} 个关键词获取失败）` : ''}`, { stopped: true, failCount: failedKeywords.length });
          return;
        }
        const notes = [];
        if (emptyKeywords.length) notes.push(`${emptyKeywords.length} 个关键词无结果`);
        if (failedKeywords.length) notes.push(`${failedKeywords.length} 个关键词获取失败`);
        const reason = failedKeywords.length === keywords.length
          ? `所有关键词均获取失败，请检查 API Key 或稍后重试；${failures.join('；')}`
          : failedKeywords.length ? `未获取到推荐词（${notes.join('，')}），请稍后重试；${failures.join('；')}`
          : '未获取到推荐词，请更换关键词后重试';
        feedback.finish(reason, { type: failedKeywords.length === keywords.length ? 'error' : failedKeywords.length ? 'warning' : 'info' });
        return;
      }

      pendingWrite.value = {
        rows, emptyKeywords, failedKeywords, authFailureReason, stopped: stopRequested.value, writtenCount: 0, appendState: {},
        targetTableId: form.value.outputType === 2 ? form.value.table_id : '',
        newTable: form.value.outputType !== 2,
        selectedFieldKeys: [...selectedFieldKeys.value],
        fieldMappings: form.value.outputType === 2 ? mappingDraft.value.filter(item => item.source_key && item.target_field_id).map(item => ({ ...item })) : [],
      };
    }
    const task = pendingWrite.value;
    const remaining = task.rows.slice(task.writtenCount);
    if (remaining.length) {
      if (task.targetTableId) {
        const valid = await validateTableFields(task.targetTableId, task.selectedFieldKeys, { fieldMappings: task.fieldMappings, throwOnError: true, onProgress: showToast, assertActive });
        if (disposed) return;
        if (!valid) throw new Error('目标表字段校验失败，请检查表格字段类型');
      }
      showToast(`正在写入多维表格，已写入 ${task.writtenCount}/${task.rows.length} 条…`);
      const result = await createAndWriteData(remaining, task.targetTableId ? 'stream' : '', '', task.targetTableId, task.selectedFieldKeys, {
        assertActive,
        stopAfterCurrentBatch: true,
        writeMode: 'append',
        parallelCellCreation: true,
        cellCreationBatchSize: 20,
        skipFieldDisplayConfig: true,
        fieldMappings: task.fieldMappings,
        appendState: task.appendState,
        onTargetTableReady: tableId => { task.targetTableId = tableId; },
        onBatchWritten: count => { task.writtenCount += count; },
      });
      if (disposed) return;
      if (!result?.tableId || !Array.isArray(result.recordIds) || result.recordIds.length !== remaining.length) {
        throw new Error('写入未完成，请检查目标表格后重试');
      }
    }
    if (disposed) return;
    if (task.newTable) await bitable.ui.switchToTable(task.targetTableId);
    if (disposed) return;

    const notes = [];
    if (task.emptyKeywords.length) notes.push(`${task.emptyKeywords.length} 个关键词无结果`);
    if (task.failedKeywords.length) notes.push(`${task.failedKeywords.length} 个关键词获取失败`);
    if (task.authFailureReason) notes.push(`获取已中止：${task.authFailureReason}`);
    feedback.finish(`${task.stopped ? '任务已停止，' : task.authFailureReason ? '' : '处理完成，'}已写入 ${task.writtenCount} 条${task.stopped ? '推荐词' : ''}${notes.length ? `（${notes.join('，')}）` : ''}`, { stopped: task.stopped, failCount: task.failedKeywords.length, type: task.failedKeywords.length ? 'warning' : 'success' });
    pendingWrite.value = null;
  } catch (error) {
    if (disposed) return;
    const message = error?.response?.data?.msg || error.message || '执行失败，请稍后重试';
    const task = pendingWrite.value;
    const progress = !task ? '' : error.requiresReopen
      ? `；已写入 ${task.writtenCount}/${task.rows.length} 条。关闭或刷新插件页面会清除本次未写入的结果，重新进入后需重新执行。`
      : `；已写入 ${task.writtenCount}/${task.rows.length} 条，可继续写入本次剩余结果。请保留当前页面，关闭或刷新会清除这份进度。`;
    feedback.fail(`${message}${progress}`, { persist: !!task, requiresReopen: !!error.requiresReopen });
  } finally {
    loading.value = false;
    collecting.value = false;
    stopRequested.value = false;
  }
};

const waitForTableFields = async tableId => {
  if (!mappingLoading.value && !tableFieldsError) return true;
  showToast('正在读取目标表字段…');
  const loaded = await (tableFieldsLoadPromise || loadTableFields(tableId));
  if (!loaded || mappingLoading.value) {
    throw tableFieldsError || new Error('读取目标表字段失败，请稍后重试');
  }
  return true;
};

const submit = async () => {
  if (disposed || !fieldSelectionReady.value || props.apiKeySaving || loading.value || submitting.value || noticeRequiresReopen.value) return;
  submitting.value = true;
  let prepared = false;
  try {
    if (!props.api_key) return showError('请先在首页配置 API Key');
    if (pendingWrite.value) {
      prepared = true;
      feedback.begin(`正在写入多维表格，已写入 ${pendingWrite.value.writtenCount}/${pendingWrite.value.rows.length} 条…`);
      await nextTick();
      if (disposed) return;
      return await execute();
    }
    if (!form.value.social_type) return showError('请选择平台');
    const keywords = parseKeywords(form.value.keyword);
    if (!keywords.length) return showError('请输入至少一个关键词');
    if (form.value.outputType === 2 && !form.value.table_id) return showError('请选择现有表格');
    if (form.value.outputType === 2 && tableConfigsLoaded.value && !mappingLoading.value && mappingDraft.value.some(item => !item.source_key || !item.target_field_id)) return showError('请完成字段映射，或删除未完成的映射');
    prepared = true;
    feedback.begin(form.value.outputType === 2 && mappingLoading.value ? '正在读取目标表字段…' : `正在获取「${keywords[0]}」（1/${keywords.length}）…`);
    await nextTick();
    if (disposed) return;
    if (form.value.outputType === 2 && !tableConfigsLoaded.value) {
      showToast('正在读取表格输出配置…');
      const loaded = await loadTableOutputConfigs();
      if (disposed) return;
      if (!loaded) throw tableConfigsError || new Error('读取表格输出配置失败，请稍后重试');
      const fieldsLoaded = await loadTableFields(form.value.table_id);
      if (disposed) return;
      if (!fieldsLoaded) throw tableFieldsError || new Error('读取目标表字段失败，请稍后重试');
    }
    if (form.value.outputType === 2) await waitForTableFields(form.value.table_id);
    if (disposed) return;
    if (form.value.outputType === 2 && mappingDraft.value.some(item => !item.source_key || !item.target_field_id)) throw new Error('请完成字段映射，或删除未完成的映射');
    await execute(keywords);
  } catch (error) {
    if (disposed) return;
    if (prepared) feedback.fail(error);
    else showError(error.message || '执行失败，请稍后重试');
  } finally {
    submitting.value = false;
  }
};
const endWrite = () => { pendingWrite.value = null; feedback.hide(); feedback.clearNotice(); };
const requestStop = () => {
  if (disposed || !collecting.value || stopRequested.value) return;
  stopRequested.value = true;
  showToast('正在停止获取推荐词，等待当前请求完成…');
};
const taskActionState = computed(() => stopRequested.value && loading.value ? 'stopping' : collecting.value ? 'running' : loading.value || submitting.value ? 'submitting' : 'idle');
const handleTaskAction = () => {
  if (taskActionState.value === 'running') return requestStop();
  if (taskActionState.value === 'idle') return submit();
};

watch(() => form.value.outputType, value => {
  if (value === 2) loadTables();
  else {
    form.value.table_id = '';
    tableFieldOptions.value = [];
    mappingDraft.value = [];
  }
});
watch(() => form.value.table_id, loadTableFields);
watch(mappingDraft, saveTableOutputConfig, { deep: true });
watch(selectedFieldKeys, keys => {
  if (!fieldSelectionReady.value) return;
  const requiredKeys = FIELD_MAPPING.filter(field => field.required).map(field => field.key);
  const mergedKeys = Array.from(new Set([...keys, ...requiredKeys]));
  if (mergedKeys.length !== keys.length) {
    selectedFieldKeys.value = mergedKeys;
    return;
  }
  saveSelectedFieldKeys(mergedKeys);
}, { deep: true });
onMounted(async () => {
  await Promise.all([
    loadSelectedFieldKeys().then(() => { if (!disposed) fieldSelectionReady.value = true; }),
    loadTableOutputConfigs(),
  ]);
});
</script>

<template>
  <div class="suggestions-page">
    <div class="form-card">
      <el-form class="form" :model="form" label-position="top" :disabled="busy">
        <section class="settings-section" aria-labelledby="suggestions-settings-title">
          <h2 id="suggestions-settings-title" class="settings-section-heading"><span class="settings-step">1</span><span>获取设置</span></h2>
          <el-form-item label="">
            <div class="c-label">平台</div>
            <el-select v-model="form.social_type" placeholder="请选择" style="width:100%">
              <el-option v-for="platform in PLATFORM_OPTIONS" :key="platform.value" :label="platform.label" :value="platform.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="">
            <div class="c-label">关键词</div>
            <el-input v-model="form.keyword" type="textarea" :rows="4" placeholder="请输入搜索词或短语，多个关键词可换行或用逗号分隔" />
          </el-form-item>
        </section>

        <section class="settings-section settings-section-output" aria-labelledby="suggestions-output-title">
          <h2 id="suggestions-output-title" class="settings-section-heading"><span class="settings-step">2</span><span>输出设置</span></h2>
          <el-form-item label="">
            <div class="field-stack">
              <div class="c-label">输出到表格</div>
              <el-radio-group v-model="form.outputType" class="radio-block">
                <el-radio :value="1">新建表格</el-radio>
                <el-radio :value="2">使用现有表格</el-radio>
              </el-radio-group>
            </div>
          </el-form-item>
          <el-form-item v-if="form.outputType === 2" label="">
            <div class="c-label">选择现有表格</div>
            <el-select v-model="form.table_id" placeholder="请选择" style="width:100%">
              <el-option v-for="table in tableOptions" :key="table.id" :label="table.name" :value="table.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="">
            <div class="field-selection-content">
              <div class="field-selection-title"><div class="c-label">选择需要的字段</div></div>
              <el-checkbox :model-value="allSelected" class="select-all-fields" @change="toggleAll">全选</el-checkbox>
              <el-checkbox-group v-model="selectedFieldKeys" class="field-checkbox-group">
                <el-checkbox v-for="field in FIELD_MAPPING" :key="field.key" :label="field.key" :disabled="field.required" class="field-checkbox-item">{{ field.name }}</el-checkbox>
              </el-checkbox-group>
            </div>
          </el-form-item>
          <div v-if="form.outputType === 2" class="mapping-accordion">
            <button type="button" class="mapping-accordion-trigger" :aria-expanded="mappingExpanded" @click="mappingExpanded = !mappingExpanded">
              <span>字段映射 <span class="mapping-optional">（可选）</span> <span class="mapping-status">{{ mappingStatus }}</span></span>
              <span class="mapping-chevron" :class="{ 'is-expanded': mappingExpanded }"></span>
            </button>
            <div v-show="mappingExpanded" class="mapping-accordion-panel">
              <div v-if="mappingLoading" class="sub-hint">正在读取目标表字段...</div>
              <div v-else-if="!form.table_id" class="sub-hint">请先选择现有表格，再配置字段映射。</div>
              <template v-else>
                <p class="mapping-note">同名字段会自动匹配；不同名时可指定目标列。未映射且没有同名列时，将自动新建同名列。</p>
                <div v-for="(mapping, index) in mappingDraft" :key="`${mapping.source_key}-${index}`" class="mapping-row">
                  <el-select v-model="mapping.source_key" :disabled="busy || !outputConfigReady" placeholder="选择输出字段" size="small">
                    <el-option v-for="field in getMappingSourceFields(index)" :key="field.key" :label="field.name" :value="field.key" :disabled="field.disabled" />
                  </el-select>
                  <span class="mapping-arrow">→</span>
                  <el-select v-model="mapping.target_field_id" :disabled="busy || !outputConfigReady" placeholder="选择目标字段" size="small">
                    <el-option v-for="field in getMappingTargetFields(index)" :key="field.id" :label="field.name" :value="field.id" :disabled="field.disabled" />
                  </el-select>
                  <el-button link type="danger" class="mapping-delete" @click="mappingDraft.splice(index, 1)" :disabled="busy || !outputConfigReady">删除</el-button>
                </div>
                <div class="mapping-actions"><el-button link type="primary" @click="mappingDraft.push({ source_key: '', target_field_id: '' })" :disabled="busy || !outputConfigReady">+ 添加字段映射</el-button></div>
              </template>
            </div>
          </div>
        </section>
      </el-form>
      <p v-if="taskNotice" class="sub-hint" role="status">{{ taskNotice }}</p>
      <el-button class="commit-btn" :class="{ 'is-running': taskActionState === 'running' || taskActionState === 'stopping' }" :loading="!fieldSelectionReady || taskActionState === 'submitting' || taskActionState === 'stopping'" :disabled="!fieldSelectionReady || noticeRequiresReopen || props.apiKeySaving || taskActionState === 'submitting' || taskActionState === 'stopping'" @click="handleTaskAction">{{ !fieldSelectionReady ? '准备中…' : taskActionState === 'stopping' ? '正在停止…' : taskActionState === 'running' ? '停止任务' : loading ? '执行中…' : submitting ? '准备中…' : noticeRequiresReopen ? '请重新进入插件' : pendingWrite ? '继续写入' : '立即执行' }}</el-button>
      <el-button v-if="pendingWrite && !loading && !submitting" class="end-write-btn" :disabled="props.apiKeySaving || loading || submitting" @click="endWrite">结束本次写入</el-button>
    </div>
    <TaskFeedback :visible="toastVisible" :text="toastText" :kind="toastType" />
  </div>
</template>

<style scoped>
.suggestions-page { background:#fffcfc; font-family:var(--app-font-family); }
.form-card { box-sizing:border-box; margin:16px; padding:20px; background:#fff; border:1px solid #e5e6eb; border-radius:8px; }
.settings-section { min-width:0; }
.settings-section-output { margin-top:20px; padding-top:20px; border-top:1px solid #f0f1f3; }
.settings-section-heading { display:flex; align-items:center; gap:8px; margin:0 0 12px; color:#1d2129; font-size:16px; font-weight:500; line-height:22px; }
.settings-step { display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px; color:#a8071a; background:#fff1f2; border-radius:50%; font-size:12px; font-weight:600; line-height:20px; }
.c-label { display:flex; align-items:center; margin-bottom:8px; color:#1d2129; font-size:14px; font-weight:500; line-height:20px; }
.form :deep(.el-form-item__label) { margin-bottom:8px; color:#1d2129; font-size:14px; }
.form :deep(.el-form-item) { margin-bottom:16px; }
.form :deep(.el-form-item__content) { font-size:14px; }
.form :deep(.el-select__wrapper) { min-height:36px; height:36px; padding:0 12px; }
.form :deep(.el-input__wrapper) { min-height:36px; padding:0 12px; }
.form :deep(.el-textarea__inner) { min-height:80px; padding:8px 12px; }
.field-stack,.field-selection-content { width:100%; }
.radio-block { display:flex; flex-wrap:wrap; gap:16px; width:100%; }
.radio-block :deep(.el-radio) { min-height:28px; margin-right:0; }
.field-selection-title { margin-bottom:8px; }
.select-all-fields { margin-right:0; margin-bottom:8px; }
.field-checkbox-group { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px 16px; width:100%; }
.field-checkbox-item,.field-checkbox-group :deep(.el-checkbox) { margin-right:0; align-items:center; }
.field-checkbox-group :deep(.el-checkbox__label) { padding-left:8px; color:#1d2129; line-height:22px; }
.field-checkbox-group :deep(.el-checkbox__inner) { width:16px; height:16px; border:1px solid #e5e6eb; border-radius:4px; }
.field-checkbox-group :deep(.el-checkbox:hover .el-checkbox__inner) { border-color:#86909c; }
.field-checkbox-group :deep(.el-checkbox__input.is-checked .el-checkbox__inner) { background:#a8071a; border-color:#a8071a; }
.field-checkbox-group :deep(.el-checkbox__input.is-disabled.is-checked .el-checkbox__inner) { background:#f7f8fa; border-color:#e5e6eb; }
.field-checkbox-group :deep(.el-checkbox__input.is-disabled.is-checked .el-checkbox__inner::after) { border-color:#c9cdd4; }
.field-checkbox-group :deep(.el-checkbox__input.is-disabled + .el-checkbox__label) { color:#c9cdd4; }
.field-checkbox-group :deep(.el-checkbox__input.is-checked + .el-checkbox__label) { color:#1d2129; }
.mapping-accordion { margin:12px 0 16px; border-top:1px solid #f0f1f3; border-bottom:1px solid #f0f1f3; }
.mapping-accordion-trigger { display:flex; align-items:center; justify-content:space-between; width:100%; min-height:48px; padding:12px 0; border:0; background:transparent; color:#1d2129; font:inherit; text-align:left; cursor:pointer; }
.mapping-optional,.mapping-status,.mapping-note { color:#86909c; font-size:12px; font-weight:400; }
.mapping-chevron { width:8px; height:8px; border-right:1px solid #86909c; border-bottom:1px solid #86909c; transform:rotate(45deg); transition:transform .2s ease; }
.mapping-chevron.is-expanded { transform:rotate(225deg); }
.mapping-accordion-panel { padding:0 0 12px; }
.mapping-note { margin:0 0 12px; line-height:18px; }
.mapping-row { display:grid; grid-template-columns:minmax(0,1fr) 12px minmax(0,1fr) auto; align-items:center; gap:4px; min-height:44px; border-top:1px solid #f0f1f3; }
.mapping-row :deep(.el-select__wrapper) { min-height:36px; height:36px; padding:0 12px; border-radius:6px; box-shadow:0 0 0 1px #e5e6eb inset; }
.mapping-arrow { color:#86909c; }
.mapping-delete { min-width:28px; padding:4px; }
.mapping-actions { display:flex; align-items:center; gap:12px; margin-top:8px; }
.mapping-actions :deep(.el-button) { margin-left:0; }
.sub-hint { margin:0 0 10px; color:#86909c; font-size:12px; line-height:18px; }
@media (max-width:420px) {
  .mapping-row { grid-template-columns:minmax(0,1fr) 12px minmax(0,1fr); }
  .mapping-delete { grid-column:3; justify-self:end; }
}

.commit-btn { margin-top:0; }
.el-button.end-write-btn {
  --el-button-text-color:#4e5969;
  --el-button-bg-color:#fff;
  --el-button-border-color:#c9cdd4;
  --el-button-hover-text-color:#4e5969;
  --el-button-hover-bg-color:#f7f8fa;
  --el-button-hover-border-color:#86909c;
  --el-button-active-text-color:#4e5969;
  --el-button-active-bg-color:#f2f3f5;
  --el-button-active-border-color:#86909c;
  --el-button-disabled-text-color:#86909c;
  --el-button-disabled-bg-color:#fafafa;
  --el-button-disabled-border-color:#e5e6eb;
  display:block;
  box-sizing:border-box;
  width:100%;
  height:36px;
  margin:8px 0 0;
  border-radius:6px;
}
.end-write-btn:focus-visible:enabled {
  border:2px solid #86909c;
  outline:none;
  box-shadow:none;
}

</style>
