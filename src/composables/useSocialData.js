import { resolveWritableField } from "../utils/tableFields.js";
import { bitable, DateFormatter, FieldType, NumberFormatter } from "@lark-base-open/js-sdk";
import { ElMessage } from "element-plus";
import { ref, onUnmounted } from "vue";
import { feishuRequest as request, buildFeishuApiUrl, buildFeishuApiPath } from '@/utils/request'

export const FIELD_MAPPING = [
  { key: 'aweme_id', name: '视频编号', type: FieldType.Text, defaultSelected: true, required: true },
  { key: 'title', name: '视频标题', type: FieldType.Text, defaultSelected: true },
  { key: 'tags', name: '标签', type: FieldType.MultiSelect, defaultSelected: true },
  { key: 'user_id', name: '用户ID', type: FieldType.Text, defaultSelected: true },
  { key: 'nickname', name: '作者名称', legacyNames: ['作者'], type: FieldType.Text, defaultSelected: true },
  { key: "profile_url", name: "作者主页链接", type: FieldType.Url, defaultSelected: true},
  { key: 'avatar', name: '博主头像', type: FieldType.Text, defaultSelected: true },
  { key: 'note_type', name: '笔记类型', type: FieldType.Text, defaultSelected: true },
  { key: 'digg_count', name: '点赞数', type: FieldType.Number, defaultSelected: true, formatter: NumberFormatter.INTEGER },
  { key: 'comment_count', name: '评论数', type: FieldType.Number, defaultSelected: true, formatter: NumberFormatter.INTEGER },
  { key: 'collect_count', name: '收藏数', type: FieldType.Number, defaultSelected: true, formatter: NumberFormatter.INTEGER },
  { key: 'share_count', name: '分享数', type: FieldType.Number, defaultSelected: true, formatter: NumberFormatter.INTEGER },
  { key: 'social_type', name: '平台', type: FieldType.Text, defaultSelected: true },
  { key: 'share_url', name: '视频链接', type: FieldType.Url, defaultSelected: true },
  { key: 'play_url', name: '下载链接', type: FieldType.Text, defaultSelected: true },
  { key: 'cover_url', name: '封面', type: FieldType.Text, defaultSelected: true },
  { key: 'duration', name: '时长', type: FieldType.Number, defaultSelected: true, formatter: NumberFormatter.INTEGER },
  { key: 'create_time', name: '发布时间', type: FieldType.DateTime, defaultSelected: true, isTimestamp: true, dateFormat: DateFormatter.DATE_TIME },
  { key: 'last_update_time', name: '最后更新时间', type: FieldType.DateTime, defaultSelected: true, isTimestamp: true, dateFormat: DateFormatter.DATE_TIME },
  { key: 'ctime', name: '提取时间', type: FieldType.DateTime, defaultSelected: true, isTimestamp: true, dateFormat: DateFormatter.DATE_TIME },
];

export const KEYWORD_SEARCH_FIELD_MAPPING = [
  { key: 'nickname', name: '作者名称', legacyNames: ['作者'], type: FieldType.Text, defaultSelected: true },
  { key: 'user_id', name: '作者ID', legacyNames: ['用户ID'], type: FieldType.Text, defaultSelected: true },
  { key: 'profile_url', name: '作者主页链接', type: FieldType.Url, defaultSelected: true },
  { key: 'avatar', name: '作者头像', legacyNames: ['博主头像'], type: FieldType.Text, defaultSelected: true },
  { key: 'social_type', name: '平台', type: FieldType.Text, defaultSelected: true },
  { key: 'aweme_id', name: '作品ID', legacyNames: ['视频编号'], type: FieldType.Text, defaultSelected: true, required: true },
  { key: 'note_type', name: '作品类型', legacyNames: ['笔记类型'], type: FieldType.Text, defaultSelected: true },
  { key: 'title', name: '标题', legacyNames: ['视频标题'], type: FieldType.Text, defaultSelected: true },
  { key: 'content', name: '正文', valueKeys: ['content', 'desc', 'description'], type: FieldType.Text, defaultSelected: true },
  { key: 'tags', name: '标签', type: FieldType.MultiSelect, defaultSelected: true },
  { key: 'duration', name: '视频时长', legacyNames: ['时长'], type: FieldType.Number, defaultSelected: true, formatter: NumberFormatter.INTEGER },
  { key: 'digg_count', name: '点赞数', type: FieldType.Number, defaultSelected: true, formatter: NumberFormatter.INTEGER },
  { key: 'comment_count', name: '评论数', type: FieldType.Number, defaultSelected: true, formatter: NumberFormatter.INTEGER },
  { key: 'collect_count', name: '收藏数', type: FieldType.Number, defaultSelected: true, formatter: NumberFormatter.INTEGER },
  { key: 'share_count', name: '分享数', type: FieldType.Number, defaultSelected: true, formatter: NumberFormatter.INTEGER },
  { key: 'share_url', name: '作品链接', legacyNames: ['视频链接'], type: FieldType.Url, defaultSelected: true },
  { key: 'cover_url', name: '封面链接', legacyNames: ['封面'], type: FieldType.Text, defaultSelected: true },
  { key: 'cover_attachment', name: '封面附件', type: FieldType.Attachment, defaultSelected: true, getUrls: (item) => item?.cover_url ? [item.cover_url] : [], getFileName: () => 'cover' },
  { key: 'play_url', name: '下载链接', type: FieldType.Text, defaultSelected: true },
  { key: 'create_time', name: '发布时间', type: FieldType.DateTime, defaultSelected: true, isTimestamp: true, dateFormat: DateFormatter.DATE_TIME },
  { key: 'last_update_time', name: '更新时间', legacyNames: ['最后更新时间'], type: FieldType.DateTime, defaultSelected: true, isTimestamp: true, dateFormat: DateFormatter.DATE_TIME },
  { key: 'ctime', name: '提取时间', type: FieldType.DateTime, defaultSelected: true, isTimestamp: true, dateFormat: DateFormatter.DATE_TIME },
];

export const PROFILE_FIELD_MAPPING = [
  { key: 'nickname', name: '作者名称', legacyNames: ['作者'], type: FieldType.Text, defaultSelected: true },
  { key: 'user_id', name: '作者ID', legacyNames: ['用户ID'], type: FieldType.Text, defaultSelected: true },
  { key: 'profile_url', name: '作者主页链接', type: FieldType.Url, defaultSelected: true },
  { key: 'avatar', name: '作者头像', legacyNames: ['博主头像'], type: FieldType.Text, defaultSelected: true },
  { key: 'social_type', name: '平台', type: FieldType.Text, defaultSelected: true },
  { key: 'aweme_id', name: '作品ID', legacyNames: ['视频编号'], type: FieldType.Text, defaultSelected: true, required: true },
  { key: 'note_type', name: '作品类型', legacyNames: ['笔记类型'], type: FieldType.Text, defaultSelected: true },
  { key: 'title', name: '标题', legacyNames: ['视频标题'], type: FieldType.Text, defaultSelected: true },
  { key: 'content', name: '正文', type: FieldType.Text, defaultSelected: true },
  { key: 'tags', name: '标签', type: FieldType.MultiSelect, defaultSelected: true },
  { key: 'duration', name: '视频时长', legacyNames: ['时长'], type: FieldType.Number, defaultSelected: true, formatter: NumberFormatter.INTEGER },
  { key: 'digg_count', name: '点赞数', type: FieldType.Number, defaultSelected: true, formatter: NumberFormatter.INTEGER },
  { key: 'comment_count', name: '评论数', type: FieldType.Number, defaultSelected: true, formatter: NumberFormatter.INTEGER },
  { key: 'collect_count', name: '收藏数', type: FieldType.Number, defaultSelected: true, formatter: NumberFormatter.INTEGER },
  { key: 'share_count', name: '分享数', type: FieldType.Number, defaultSelected: true, formatter: NumberFormatter.INTEGER },
  { key: 'share_url', name: '作品链接', legacyNames: ['视频链接'], type: FieldType.Url, defaultSelected: true },
  { key: 'cover_url', name: '封面链接', legacyNames: ['封面'], type: FieldType.Text, defaultSelected: true },
  { key: 'cover_attachment', name: '封面附件', type: FieldType.Attachment, defaultSelected: true, getUrls: (item) => item?.cover_url ? [item.cover_url] : [], getFileName: () => 'cover' },
  { key: 'play_url', name: '下载链接', type: FieldType.Text, defaultSelected: true },
  { key: 'create_time', name: '发布时间', type: FieldType.DateTime, defaultSelected: true, isTimestamp: true, dateFormat: DateFormatter.DATE_TIME },
  { key: 'last_update_time', name: '更新时间', legacyNames: ['最后更新时间'], type: FieldType.DateTime, defaultSelected: true, isTimestamp: true, dateFormat: DateFormatter.DATE_TIME },
  { key: 'ctime', name: '提取时间', type: FieldType.DateTime, defaultSelected: true, isTimestamp: true, dateFormat: DateFormatter.DATE_TIME },
];

// 作者搜索和作者信息使用同一组统一字段。user_id 作为作者搜索的稳定唯一键。
export const BLOGGER_FIELD_MAPPING = [
  { key: 'nickname', name: '作者名称', legacyNames: ['作者'], type: FieldType.Text, defaultSelected: true },
  { key: 'uid', name: '作者账号', type: FieldType.Text, defaultSelected: true },
  { key: 'user_id', name: '作者ID', legacyNames: ['用户ID'], type: FieldType.Text, defaultSelected: true, required: true },
  { key: 'profile_url', name: '作者主页链接', type: FieldType.Url, defaultSelected: true },
  { key: 'avatar', name: '作者头像', legacyNames: ['博主头像'], type: FieldType.Text, defaultSelected: true },
  { key: 'signature', name: '个人简介', type: FieldType.Text, defaultSelected: true },
  { key: 'follower_count', name: '粉丝数', type: FieldType.Number, defaultSelected: true, formatter: NumberFormatter.INTEGER },
  { key: 'following_count', name: '关注数', type: FieldType.Number, defaultSelected: true, formatter: NumberFormatter.INTEGER },
  { key: 'total_favorited', name: '获赞数', type: FieldType.Number, defaultSelected: true, formatter: NumberFormatter.INTEGER },
  { key: 'aweme_count', name: '作品数', type: FieldType.Number, defaultSelected: true, formatter: NumberFormatter.INTEGER },
  { key: 'verified', name: '认证状态', type: FieldType.Text, defaultSelected: true },
  { key: 'verification_category', name: '认证类型', type: FieldType.Text, defaultSelected: true },
  { key: 'social_type', name: '平台', type: FieldType.Text, defaultSelected: true },
  { key: 'ip_location', name: 'IP属地', type: FieldType.Text, defaultSelected: true },
  { key: 'ctime', name: '提取时间', type: FieldType.DateTime, defaultSelected: true, isTimestamp: true, dateFormat: DateFormatter.DATE_TIME },
];

export const FIELD_TYPE_NAME = {
  [FieldType.Text]: '文本',
  [FieldType.Number]: '数字',
  [FieldType.SingleSelect]: '单选',
  [FieldType.MultiSelect]: '多选',
  [FieldType.DateTime]: '日期时间',
  [FieldType.Url]: '链接',
  [FieldType.Attachment]: '附件',
};

const getAllowedFieldTypes = (config) => {
  if (config.type === FieldType.Number) {
    return [FieldType.Number, FieldType.Text];
  }
  if (config.key === 'nickname' || config.key === 'note_type' || config.key === 'social_type') {
    return [FieldType.Text, FieldType.SingleSelect];
  }
  if (config.key === 'profile_url' || config.key === 'share_url') {
    return [FieldType.Text, FieldType.Url];
  }
  if (config.key === 'tags') {
    return [FieldType.Text, FieldType.MultiSelect];
  }
  return [config.type];
};

const isFieldTypeCompatible = (fieldType, config) => {
  return getAllowedFieldTypes(config).includes(fieldType);
};

const getExpectedFieldTypeName = (config) => {
  return getAllowedFieldTypes(config)
    .map(type => FIELD_TYPE_NAME[type] || type)
    .join('、');
};

const normalizeTextCompatibleValue = (value) => {
  return value ?? "";
};

const normalizeSelectCompatibleValue = (value) => {
  if (!value) {
    return null;
  }
  return String(value).trim() || null;
};

const splitTags = (value) => {
  if (Array.isArray(value)) {
    return value
      .map(item => typeof item === 'string' ? item.trim() : '')
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(/\s+/)
      .map(item => item.trim())
      .filter(Boolean);
  }

  return [];
};

const ensureTagOptions = async (field, list, config, fieldType) => {
  if (config.key !== 'tags' || fieldType !== FieldType.MultiSelect) {
    return null;
  }

  const tagSet = new Set();
  for (const item of list) {
    for (const tag of splitTags(item?.[config.key])) {
      tagSet.add(tag);
    }
  }

  if (tagSet.size === 0) {
    return new Map();
  }

  const existingOptions = await field.getOptions();
  const existingNames = new Set(existingOptions.map(option => option.name));
  const missingOptions = [...tagSet]
    .filter(tag => !existingNames.has(tag))
    .map(tag => ({ name: tag }));

  if (missingOptions.length > 0) {
    await field.addOptions(missingOptions);
  }

  const latestOptions = await field.getOptions();
  return new Map(latestOptions.map(option => [option.name, option.id]));
};

const normalizeTagsCompatibleValue = (value, fieldType, tagOptionIdMap = null) => {
  const tags = splitTags(value);

  if (fieldType === FieldType.MultiSelect) {
    if (!tagOptionIdMap) {
      return tags.length ? tags : [];
    }

    const optionValues = tags
      .map(tag => {
        const optionId = tagOptionIdMap.get(tag);
        return optionId ? { id: optionId, text: tag } : null;
      })
      .filter(Boolean);

    return optionValues.length ? optionValues : [];
  }

  return tags.join(' ');
};

const ATTACHMENT_DOWNLOAD_TIMEOUT = 30000;
const ATTACHMENT_DOWNLOAD_CONCURRENCY = 3;
let activeAttachmentDownloads = 0;
const attachmentDownloadWaiters = [];

const withAttachmentDownloadSlot = async (download) => {
  while (activeAttachmentDownloads >= ATTACHMENT_DOWNLOAD_CONCURRENCY) {
    await new Promise(resolve => attachmentDownloadWaiters.push(resolve));
  }
  activeAttachmentDownloads += 1;
  try {
    return await download();
  } finally {
    activeAttachmentDownloads -= 1;
    const next = attachmentDownloadWaiters.shift();
    next?.();
  }
};

const isXhsCover = (config, item) => config.key === 'cover_attachment' && item?.social_type === 'xhs';

const httpToHttps = (url) => typeof url === 'string' ? url.replace(/^http:\/\//i, 'https://') : url;

const getAttachmentUrls = (config, item) => {
  let urls = config.getUrls?.(item) || [];
  if (typeof urls === 'string') urls = [urls];
  if (!Array.isArray(urls)) return [];
  return urls.filter(url => typeof url === 'string' && url).map(httpToHttps);
};

const getAttachmentFileName = (url, baseName, index, total) => {
  const extension = url.match(/\.([a-zA-Z0-9]{2,5})(?:\?|$)/)?.[1];
  const prefix = total > 1 ? `${index + 1}_` : '';
  return `${prefix}${baseName || 'attachment'}.${extension || 'jpg'}`;
};

const getBlobExtension = (blob) => ({
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heic',
}[String(blob.type || '').split(';')[0].trim().toLowerCase()]);

const downloadAttachmentAsFile = async (url, fileName, apiKey, xhsCover = false) => withAttachmentDownloadSlot(async () => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ATTACHMENT_DOWNLOAD_TIMEOUT);
  const proxyParams = new URLSearchParams({ url, file_name: fileName });
  if (xhsCover) proxyParams.set('image_mode', 'xhs_cover');
  const proxyUrl = buildFeishuApiUrl(`${buildFeishuApiPath('/v1/feishu/xhs_download_proxy')}?${proxyParams.toString()}`);
  const download = async (requestUrl, useProxy = false) => {
    const response = await fetch(requestUrl, {
      signal: controller.signal,
      ...(useProxy ? { headers: { authorization: `Bearer ${apiKey}` } } : {}),
    });
    if (!response.ok) throw new Error(`下载失败: HTTP ${response.status}`);
    const blob = await response.blob();
    const extension = getBlobExtension(blob);
    const normalizedName = extension ? fileName.replace(/\.[a-zA-Z0-9]{2,5}$/, `.${extension}`) : fileName;
    return new File([blob], normalizedName, { type: blob.type || 'application/octet-stream' });
  };

  try {
    if (xhsCover) return await download(proxyUrl, true);
    try {
      return await download(url);
    } catch (error) {
      if (controller.signal.aborted) throw new Error(`附件下载超时（${ATTACHMENT_DOWNLOAD_TIMEOUT / 1000} 秒）`);
      return await download(proxyUrl, true);
    }
  } finally {
    clearTimeout(timeoutId);
  }
});

const createAttachmentFiles = async (config, item, apiKey, onDownloadFailure) => {
  const urls = getAttachmentUrls(config, item);
  const results = await Promise.allSettled(urls.map((url, index) =>
    downloadAttachmentAsFile(url, getAttachmentFileName(url, config.getFileName?.(item), index, urls.length), apiKey, isXhsCover(config, item))
  ));

  return results.flatMap(result => {
    if (result.status === 'fulfilled') return [result.value];
    onDownloadFailure?.(result.reason);
    console.warn('附件下载失败，跳过附件写入:', result.reason);
    return [];
  });
};

const uploadAttachmentFilesInBatch = async (entries) => {
  const files = entries.flatMap(entry => entry.files);
  if (!files.length) {
    return;
  }

  const tokens = await bitable.base.batchUploadFile(files);
  if (!Array.isArray(tokens) || tokens.length !== files.length) {
    throw new Error('附件批量上传返回的 token 数量不匹配');
  }

  let offset = 0;
  for (const entry of entries) {
    const uploadedFiles = entry.files.map((file, index) => ({
      name: file.name,
      size: file.size,
      type: file.type,
      token: tokens[offset + index],
      timeStamp: file.lastModified || Date.now(),
    }));
    entry.target.set(entry.item, uploadedFiles);
    offset += entry.files.length;
  }
};

// Download the page continuously; upload groups as they become ready.
// Only one SDK upload is in flight, while downloads keep their three-slot limit.
const prepareAttachmentPipeline = async (entries, apiKey, metrics = null, uploadBatchSize = 10) => {
  const startedAt = performance.now();
  let uploadMs = 0;
  let attachmentCount = 0;
  let attachmentBytes = 0;
  let downloadRetryCount = 0;
  const downloads = entries.map(async (entry) => {
    const expected = getAttachmentUrls(entry.config, entry.item).length;
    let files = [];
    let failureReason = '';
    // CDN/proxy requests can fail transiently. The benchmark retries a
    // failed item twice, while still rejecting permanent partial downloads.
    for (let attempt = 0; attempt < 3 && files.length !== expected; attempt += 1) {
      if (attempt > 0) downloadRetryCount += 1;
      files = await createAttachmentFiles(entry.config, entry.item, apiKey, error => {
        failureReason = error?.name === 'AbortError' ? '下载超时' : (error?.message || '网络请求失败');
      });
      if (files.length !== expected && attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
      }
    }
    if (metrics && files.length !== expected) {
      const workId = entry.item?.aweme_id || entry.item?._id || entry.item?.id || 'unknown';
      throw new Error(`测试图片下载不完整：作品 ${workId}，期望 ${expected} 张，成功 ${files.length} 张，已尝试 3 次；${failureReason}`);
    }
    attachmentCount += files.length;
    attachmentBytes += files.reduce((sum, file) => sum + file.size, 0);
    return { ...entry, files };
  });
  // Attach rejection handlers to every group immediately, even when an earlier
  // group is still uploading. Wait for all downloads before propagating errors.
  const groups = [];
  for (let offset = 0; offset < downloads.length; offset += uploadBatchSize) {
    groups.push(Promise.all(downloads.slice(offset, offset + uploadBatchSize)).then(
      value => ({ value }), error => ({ error })
    ));
  }
  let downloadMs = 0;
  const downloadDone = Promise.allSettled(downloads).then(() => {
    downloadMs = performance.now() - startedAt;
  });
  const uploadDone = (async () => {
    for (const group of groups) {
      const { value, error } = await group;
      if (error) throw error;
      const uploadStartedAt = performance.now();
      await uploadAttachmentFilesInBatch(value);
      uploadMs += performance.now() - uploadStartedAt;
    }
  })();
  const results = await Promise.allSettled([downloadDone, uploadDone]);
  if (results[1].status === 'rejected') throw results[1].reason;
  if (metrics) Object.assign(metrics, {
    downloadMs, uploadMs, attachmentCount, attachmentBytes,
    attachmentPipelineMs: performance.now() - startedAt,
    uploadBatchSize,
    attachmentMode: 'pipeline',
    downloadRetryCount,
  });
};

const normalizeCellValue = async (table, field, value, config, fieldType, extra = {}, item, apiKey) => {
  if (config.type === FieldType.Attachment) {
    const files = extra.preloadedFiles?.has(item)
      ? extra.preloadedFiles.get(item)
      : await createAttachmentFiles(config, item, apiKey);
    return files.length === 1 ? files[0] : files;
  }

  let nextValue = value;
  if ((fieldType === FieldType.Number || fieldType === FieldType.DateTime) && (nextValue == null || nextValue === '')) {
    return null;
  }
  if (config.isTimestamp && nextValue) {
    nextValue = nextValue * 1000;
  }

  if ((config.key === 'nickname' || config.key === 'note_type' || config.key === 'social_type') && fieldType === FieldType.SingleSelect) {
    return normalizeSelectCompatibleValue(nextValue);
  }

  if (config.key === 'verified' && fieldType === FieldType.Text) {
    return nextValue === true ? '已认证' : nextValue === false ? '未认证' : String(nextValue ?? '');
  }

  if (config.key === 'tags') {
    return normalizeTagsCompatibleValue(nextValue, fieldType, extra.tagOptionIdMap);
  }

  if (config.type === FieldType.Number && fieldType === FieldType.Text) {
    return String(nextValue ?? '');
  }

  return normalizeTextCompatibleValue(nextValue);
};

const applyFieldDisplayConfig = async (field, config, assertActive) => {
  const fieldType = await field.getType();
  assertActive?.();
  if (config.formatter && fieldType === FieldType.Number) {
    await field.setFormatter(config.formatter);
  }
  if (config.dateFormat && fieldType === FieldType.DateTime) {
    assertActive?.();
    await field.setDateFormat(config.dateFormat);
  }
};

const getFieldCandidateNames = (config) => [config.name, ...(config.legacyNames || [])];

const resolveFieldMetaByConfig = (fieldMetaMap, config) => {
  for (const candidateName of getFieldCandidateNames(config)) {
    const fieldMeta = fieldMetaMap.get(candidateName);
    if (fieldMeta) {
      return {
        matchedName: candidateName,
        fieldMeta
      };
    }
  }

  return null;
};

const normalizeUniqueKeyPart = (value) => {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(normalizeUniqueKeyPart).filter(Boolean).join(',');
  if (typeof value === 'object') return normalizeUniqueKeyPart(value.text ?? value.name ?? value.value ?? '');
  return String(value).trim().toLowerCase();
};

const buildWorkUniqueKey = (awemeId) => normalizeUniqueKeyPart(awemeId);

const chunkRecords = (records, size = 200) => {
  const chunks = [];
  for (let index = 0; index < records.length; index += size) {
    chunks.push(records.slice(index, index + size));
  }
  return chunks;
};

const readTableRecords = async table => {
  const records = [];
  let pageToken;
  do {
    const page = await table.getRecordsByPage({ pageSize: 200, pageToken });
    records.push(...page.records);
    if (page.hasMore && (!page.pageToken || page.pageToken === pageToken)) {
      throw new Error('读取目标表时未返回有效分页游标，无法核对写入结果');
    }
    pageToken = page.hasMore ? page.pageToken : undefined;
  } while (pageToken !== undefined);
  return records;
};

export const showErrorMsg = (message) => {
  ElMessage({ message, type: "error", plain: true, duration: 3000 });
};

const escapeRegExp = (value) => {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const normalizeTableName = (value) => {
  const fallback = '社媒数据助手';
  const normalized = String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:*?\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return (normalized || fallback).slice(0, 80);
};

export const createSequentialTable = async (baseTableName, assertActive) => {
  try {
    const safeBaseTableName = normalizeTableName(baseTableName);
    const existingTables = await bitable.base.getTableMetaList();
    assertActive?.();
    const tableNames = existingTables.map(table => table.name);

    const existsBaseTable = tableNames.includes(safeBaseTableName);
    const existsSequentialTable = tableNames.some(name => name.startsWith(`${safeBaseTableName}`) && /\d+$/.test(name.slice(safeBaseTableName.length)));
    if (!existsBaseTable && !existsSequentialTable) {
      const newTable = await bitable.base.addTable({ name: safeBaseTableName });
      return newTable;
    }

    const reg = new RegExp(`^${escapeRegExp(safeBaseTableName)}(\\d+)$`);
    let maxIndex = 0;
    tableNames.forEach(name => {
      const match = name.match(reg);
      if (match) {
        const index = parseInt(match[1], 10);
        if (index > maxIndex) maxIndex = index;
      }
    });

    const newTableName = `${safeBaseTableName}${maxIndex + 1}`;
    const newTable = await bitable.base.addTable({ name: newTableName });
    return newTable;
  } catch (error) {
    console.error("获取表格序号失败：", error);
    throw error;
  }
};

export const setupTableFields = async (tableId, selectedFieldKeys = [], fieldMapping = FIELD_MAPPING, onProgress = null, assertActive) => {
  const newTable = await bitable.base.getTable(tableId);
  assertActive?.();
  await bitable.ui.switchToTable(tableId);
  const first_field = await newTable.getField('文本');
  assertActive?.();
  const activeFieldMapping = getActiveFieldMapping(selectedFieldKeys, fieldMapping);
  for (const [index, config] of activeFieldMapping.entries()) {
    assertActive?.();
    onProgress?.(`正在创建字段 ${index + 1}/${activeFieldMapping.length}：${config.name}...`);
    if (index === 0 && first_field) {
      await newTable.setField(first_field.id, { type: config.type, name: config.name });
    } else {
      await newTable.addField({ type: config.type, name: config.name });
    }
  }

  onProgress?.('正在设置字段格式...');
  for (const config of activeFieldMapping) {
    try {
      const field = await newTable.getField(config.name);
      assertActive?.();
      if (field) {
        await applyFieldDisplayConfig(field, config, assertActive);
      }
    } catch (error) {
      console.error(`设置字段 ${config.name} 格式失败:`, error);
    }
  }
};

export const validateTableFields = async (tableId, selectedFieldKeys = [], fieldMapping = FIELD_MAPPING, options = {}) => {
  try {
    options.assertActive?.();
    options.onProgress?.('正在检查目标表字段...');
    const activeTable = await bitable.base.getTableById(tableId);
    const fieldMetaList = await activeTable.getFieldMetaList();
    options.assertActive?.();
    const fieldMetaByName = new Map(fieldMetaList.map(meta => [meta.name, meta]));
    const fieldMetaById = new Map(fieldMetaList.map(meta => [meta.id, meta]));
    const explicitMappings = new Map(
      (options.fieldMappings || [])
        .filter(item => item?.source_key && item?.target_field_id)
        .map(item => [item.source_key, item])
    );
    const activeFieldMapping = getActiveFieldMapping(selectedFieldKeys, fieldMapping);
    if (options.writeMode === 'upsert') {
      for (const key of [options.uniqueKey || 'aweme_id']) {
        const config = fieldMapping.find(item => item.key === key);
        if (config && !activeFieldMapping.some(item => item.key === key)) activeFieldMapping.push(config);
      }
    }

    const fieldList = [];
    const missingFields = [];
    for (const config of activeFieldMapping) {
      const explicitMapping = explicitMappings.get(config.key);
      const matchedField = explicitMapping?.target_field_id
        ? { fieldMeta: fieldMetaById.get(explicitMapping.target_field_id) }
        : resolveFieldMetaByConfig(fieldMetaByName, config);
      if (explicitMapping?.target_field_id && !matchedField.fieldMeta) {
        throw new Error(`字段“${config.name}”映射的目标字段不存在`);
      }
      if (!matchedField?.fieldMeta?.id) {
        // 显式映射的字段由 target_field_id 指定，不能按源字段名自动补列。
        if (!explicitMapping) missingFields.push(config);
        continue;
      }
      const field = await activeTable.getFieldById(matchedField.fieldMeta.id);
      options.assertActive?.();
      fieldList.push({ field, config });
    }

    for (const item of fieldList) {
      if (item.field) {
        const fieldType = await item.field.getType();
        item.fieldType = fieldType;
        if (!isFieldTypeCompatible(fieldType, item.config)) {
          const message = `输出字段"${item.config.name}" 类型不匹配，仅支持${getExpectedFieldTypeName(item.config)}类型，请修正目标字段类型后重试`;
          if (options.throwOnError) throw new Error(message);
          ElMessage({ message, type: 'error', plain: true, duration: 8000 });
          return false;
        }
      }
    }

    if (missingFields.length) {
      options.onProgress?.(`正在创建字段（共 ${missingFields.length} 个）...`);
    }
    let createdFieldCount = 0;
    for (const config of missingFields) {
      try {
        options.onProgress?.(`正在创建字段 ${createdFieldCount + 1}/${missingFields.length}：${config.name}...`);
        options.assertActive?.();
        await activeTable.addField({ type: config.type, name: config.name });
        createdFieldCount++;
      } catch (error) {
        if (options.throwOnError) throw error;
        ElMessage({ message: `添加字段 "${config.name}" 失败`, type: 'error', plain: true, duration: 5000 });
        return false;
      }
    }

    if (missingFields.length > 0 && !options.throwOnError) {
      ElMessage({ message: `已自动添加 ${missingFields.length} 个字段${options.successMessageSuffix || ''}`, type: 'success', plain: true, duration: 3000 });
    }

    const refreshedFieldMetaList = await activeTable.getFieldMetaList();
    const refreshedFieldMetaByName = new Map(refreshedFieldMetaList.map(meta => [meta.name, meta]));
    const refreshedFieldMetaById = new Map(refreshedFieldMetaList.map(meta => [meta.id, meta]));
    for (const config of activeFieldMapping) {
      const explicitMapping = explicitMappings.get(config.key);
      const matchedField = explicitMapping?.target_field_id
        ? { fieldMeta: refreshedFieldMetaById.get(explicitMapping.target_field_id) }
        : resolveFieldMetaByConfig(refreshedFieldMetaByName, config);
      const fieldId = matchedField?.fieldMeta?.id;
      if (!fieldId) continue;
      const field = await activeTable.getFieldById(fieldId);
      options.assertActive?.();
      try {
        await applyFieldDisplayConfig(field, config, options.assertActive);
      } catch (error) {
        console.error(`设置字段 ${config.name} 格式失败:`, error);
      }
    }

    const availableFieldList = [...fieldList, ...missingFields.map(config => ({ field: true, config }))];
    if (availableFieldList.length === 0) {
      if (options.throwOnError) throw new Error("所选表格没有可写入字段");
      showErrorMsg("所选表格没有可写入字段");
      return false;
    }

    return true;
  } catch (error) {
    if (options.throwOnError) throw error;
    console.error("验证表格字段时出错:", error);
    showErrorMsg(error?.response?.data?.msg || error?.message || "验证表格字段失败，请稍后重试");
    return false;
  }
};

export const getDefaultSelectedFieldKeys = (fieldMapping = FIELD_MAPPING) => fieldMapping
  .filter(field => field.defaultSelected || field.required)
  .map(field => field.key);

export const getActiveFieldMapping = (selectedFieldKeys = [], fieldMapping = FIELD_MAPPING) => {
  const selectedKeySet = new Set(selectedFieldKeys);
  return fieldMapping.filter(field => field.required || selectedKeySet.has(field.key));
};

export const useSocialData = (getTableName, api_key, fieldMapping = FIELD_MAPPING) => {
  const loading = ref(false);
  const profileProgress = ref({ text: "", done: false });
  const timer = ref(null);
  let page = 1;
  const page_size = 20;
  let total = 0;
  const upsertIndexCache = new Map();

  const resetParams = () => {
    loading.value = false;
    profileProgress.value = { text: "", done: false };
    page = 1;
    total = 0;
    upsertIndexCache.clear();
  };

  const pollTaskStatus = (task_id, checkFn, onSuccess) => {
    let time = 0;
    timer.value && clearInterval(timer.value);
    timer.value = setInterval(() => {
      time += 3;
      if (time >= 600) {
        clearInterval(timer.value);
        timer.value = null;
        showErrorMsg("获取数据超时，请稍后重试");
        loading.value = false;
      } else {
        checkFn(task_id, onSuccess);
      }
    }, 2000);
  };

  const closeInterval = () => {
    timer.value && clearInterval(timer.value);
    timer.value = null;
  };

  const getList = async (task_id, type, targetTableId = "", selectedFieldKeys = []) => {
    await request({
      url: buildFeishuApiPath('/v1/feishu/post/list'),
      method: "post",
      headers: { 'authorization': `Bearer ${api_key}` },
      data: { task_id, page, page_size },
    })
      .then(function (response) {
        let res = response.data;
        if (res.sta == 0) {
          const { count, data } = res.data;
          if (!type) {
            total = Math.ceil(count / page_size);
            createAndWriteData(data, '', task_id, targetTableId, selectedFieldKeys);
          } else if (type == 'next') {
            createAndWriteData(data, type, task_id, targetTableId, selectedFieldKeys);
          }
        } else {
          loading.value = false;
          showErrorMsg(res.msg);
        }
      })
      .catch(function (error) {
        loading.value = false;
        console.log(error);
        showErrorMsg(error.message || '请求失败');
      });
  };

  const createAndWriteData = async (list, type, task_id, targetTableId = "", selectedFieldKeys = [], options = {}) => {
    const metrics = options.measurePerformance ? {
      records: list?.length || 0,
      downloadMs: 0,
      uploadMs: 0,
      writeMs: 0,
      attachmentCount: 0,
      attachmentBytes: 0,
      totalMs: 0,
    } : null;
    const startedAt = metrics ? performance.now() : 0;
    if (!list || list.length == 0) {
      throw new Error('没有可写入的数据');
    }
    const selectedFieldMapping = getActiveFieldMapping(selectedFieldKeys, fieldMapping);
    const uniqueKey = options.uniqueKey || 'aweme_id';
    const keyConfigs = options.writeMode === 'upsert'
      ? [uniqueKey].map(key => fieldMapping.find(config => config.key === key)).filter(Boolean)
      : [];
    const activeFieldMapping = [...selectedFieldMapping];
    for (const keyConfig of keyConfigs) {
      if (!activeFieldMapping.some(config => config.key === keyConfig.key)) {
        activeFieldMapping.push(keyConfig);
      }
    }

    try {
      options.assertActive?.();
      let resolvedTargetTableId = targetTableId;
      if (!type && !resolvedTargetTableId) {
        options.onProgress?.('正在创建目标表...');
        const tableName = getTableName(list);
        const { tableId } = await createSequentialTable(tableName, options.assertActive);
        options.assertActive?.();
        resolvedTargetTableId = tableId;
        await options.onTargetTableReady?.(tableId);
        await setupTableFields(tableId, selectedFieldKeys, fieldMapping, options.onProgress, options.assertActive);
      }

      options.assertActive?.();
      const activeTable = resolvedTargetTableId
        ? await bitable.base.getTableById(resolvedTargetTableId)
        : await bitable.base.getActiveTable();
      let fieldMetaList = await activeTable.getFieldMetaList();
      options.assertActive?.();
      let fieldMetaByName = new Map(fieldMetaList.map(meta => [meta.name, meta]));
      let fieldMetaById = new Map(fieldMetaList.map(meta => [meta.id, meta]));
      const explicitMappings = new Map(
        (options.fieldMappings || [])
          .filter(item => item?.source_key && item?.target_field_id)
          .map(item => [item.source_key, item])
      );

      if (options.writeMode === 'upsert') {
        for (const config of keyConfigs) {
          const explicitMapping = explicitMappings.get(config.key);
          if (explicitMapping?.target_field_id && !fieldMetaById.has(explicitMapping.target_field_id)) {
            throw new Error(`唯一键字段“${config.name}”映射的目标字段不存在`);
          }
          if (!explicitMapping && !resolveFieldMetaByConfig(fieldMetaByName, config)?.fieldMeta?.id) {
            options.onProgress?.(`正在创建唯一键字段：${config.name}...`);
            options.assertActive?.();
          await activeTable.addField({ type: config.type, name: config.name });
          }
        }
        fieldMetaList = await activeTable.getFieldMetaList();
        fieldMetaByName = new Map(fieldMetaList.map(meta => [meta.name, meta]));
        fieldMetaById = new Map(fieldMetaList.map(meta => [meta.id, meta]));
      }
      const fieldList = await Promise.all(activeFieldMapping.map(async config => {
        const explicitMapping = explicitMappings.get(config.key);
        const matchedField = explicitMapping?.target_field_id
          ? { matchedName: explicitMapping.target_field_name || '', fieldMeta: fieldMetaById.get(explicitMapping.target_field_id) }
          : resolveFieldMetaByConfig(fieldMetaByName, config);
        const fieldId = matchedField?.fieldMeta?.id;
        if (!fieldId) throw new Error(`字段“${config.name}”映射的目标字段不存在`);
        const { field, fieldType } = await resolveWritableField(activeTable, await activeTable.getFieldById(fieldId));
        return { field, config, fieldType };
      }));

      const incompatibleField = fieldList.find(item => item.field && !isFieldTypeCompatible(item.fieldType, item.config));
      if (incompatibleField) {
        throw new Error(`字段“${incompatibleField.config.name}”类型不匹配，仅支持${getExpectedFieldTypeName(incompatibleField.config)}类型`);
      }

      const availableFieldList = fieldList.filter(item => !!item.field);
      if (availableFieldList.length === 0) {
        throw new Error('所选表格没有可写入字段');
      }

      await Promise.all(availableFieldList.map(async item => {
        item.extra = {};
        if (item.config.key === 'tags') {
          item.extra.tagOptionIdMap = await ensureTagOptions(item.field, list, item.config, item.fieldType);
        }
        if (!options.skipFieldDisplayConfig) {
          try {
            await applyFieldDisplayConfig(item.field, item.config, options.assertActive);
          } catch (error) {
            console.error(`设置字段 ${item.config.name} 格式失败:`, error);
          }
        }
      }));

      const attachmentEntries = [];
      for (const fieldItem of availableFieldList) {
        if (fieldItem.config.type !== FieldType.Attachment) continue;
        const xhsItems = list.filter(item => isXhsCover(fieldItem.config, item));
        if (!xhsItems.length) continue;
        fieldItem.extra.preloadedFiles = new Map();
        for (const item of xhsItems) {
          attachmentEntries.push({ item, config: fieldItem.config, target: fieldItem.extra.preloadedFiles });
        }
      }
      if (options.attachmentPipeline) {
        await prepareAttachmentPipeline(attachmentEntries, api_key, metrics, options.uploadBatchSize || 10);
      } else {
        const downloadStartedAt = metrics ? performance.now() : 0;
        const downloaded = await Promise.all(attachmentEntries.map(async entry => ({
          ...entry, files: await createAttachmentFiles(entry.config, entry.item, api_key),
        })));
        if (metrics) {
          metrics.downloadMs = performance.now() - downloadStartedAt;
          const files = downloaded.flatMap(entry => entry.files);
          metrics.attachmentCount = files.length;
          metrics.attachmentBytes = files.reduce((sum, file) => sum + file.size, 0);
          const expected = downloaded.reduce((sum, entry) => sum + getAttachmentUrls(entry.config, entry.item).length, 0);
          if (metrics.attachmentCount !== expected) throw new Error('测试图片下载不完整');
        }
        const uploadStartedAt = metrics ? performance.now() : 0;
        await uploadAttachmentFilesInBatch(downloaded);
        if (metrics) metrics.uploadMs = performance.now() - uploadStartedAt;
      }

      let records = [];
      let normalizedRecords = [];
      if (options.parallelCellCreation) {
        const recordChunks = chunkRecords(list, options.cellCreationBatchSize || 50);
        for (const items of recordChunks) {
          const prepared = await Promise.all(items.map(async item => {
            const cells = await Promise.all(availableFieldList.map(async ({ field, config, fieldType, extra }) => {
              const valueKeys = config.valueKeys || [config.key];
              const sourceValue = valueKeys.reduce((value, key) => value ?? item?.[key], undefined);
              const value = await normalizeCellValue(activeTable, field, sourceValue, config, fieldType, extra, item, api_key);
              const cell = await field.createCell(value);
              return { cell, fieldId: field.id, value: await cell.getValue() };
            }));
            return {
              record: cells.map(entry => entry.cell),
              normalizedRecord: Object.fromEntries(cells.map(entry => [entry.fieldId, entry.value])),
            };
          }));
          records.push(...prepared.map(item => item.record));
          normalizedRecords.push(...prepared.map(item => item.normalizedRecord));
        }
      } else {
        for (const item of list) {
          let record = [];
          let normalizedRecord = {};
          for (const { field, config, fieldType, extra } of availableFieldList) {
            const valueKeys = config.valueKeys || [config.key];
            const sourceValue = valueKeys.reduce((value, key) => value ?? item?.[key], undefined);
            const value = await normalizeCellValue(activeTable, field, sourceValue, config, fieldType, extra, item, api_key);
            const cell = await field.createCell(value);
            record.push(cell);
            normalizedRecord[field.id] = await cell.getValue();
          }
          records.push(record);
          normalizedRecords.push(normalizedRecord);
        }
      }
      let recordIds = [];
      const writeBatch = async (write) => {
        options.assertActive?.();
        const start = metrics ? performance.now() : 0;
        const result = await write();
        if (metrics) metrics.writeMs += performance.now() - start;
        return result;
      };
      if (options.writeMode === 'upsert') {
        const keyFields = keyConfigs.map(config => availableFieldList.find(item => item.config.key === config.key)?.field);
        if (!keyFields.every(Boolean)) {
          throw new Error(`未找到“${keyConfigs[0]?.name || uniqueKey}”字段，无法执行更新或新增`);
        }

        const uniqueRecords = new Map();
        let skippedCount = 0;
        list.forEach((item, index) => {
          const key = buildWorkUniqueKey(item?.[uniqueKey]);
          if (!key) {
            skippedCount += 1;
            return;
          }
          uniqueRecords.set(key, { record: records[index], fields: normalizedRecords[index] });
        });
        if (skippedCount > 0) {
          ElMessage({ message: `${skippedCount} 条数据缺少${keyConfigs[0]?.name || uniqueKey}，未写入`, type: 'warning', plain: true });
        }

        const indexCache = options.upsertIndex || upsertIndexCache;
        const cacheKey = `${options.upsertCacheKey || 'default'}:${activeTable.id}:${keyFields.map(field => field.id).join(':')}`;
        let existingByKey = indexCache.get(cacheKey);
        if (!existingByKey) {
          existingByKey = new Map();
          for (const existing of await readTableRecords(activeTable)) {
            const key = buildWorkUniqueKey(existing.fields?.[keyFields[0].id]);
            if (key) existingByKey.set(key, existing.recordId);
          }
          indexCache.set(cacheKey, existingByKey);
        }

        const pendingUpdates = [];
        const pendingCreates = [];
        uniqueRecords.forEach(({ record, fields }, key) => {
          const recordId = existingByKey.get(key);
          if (recordId) {
            pendingUpdates.push({ recordId, fields });
          } else {
            pendingCreates.push({ key, record });
          }
        });

        for (const updates of chunkRecords(pendingUpdates)) {
          const updated = await writeBatch(() => activeTable.setRecords(updates));
          recordIds = recordIds.concat(updated.map(record => record.recordId));
        }
        for (const creates of chunkRecords(pendingCreates)) {
          const created = await writeBatch(() => activeTable.addRecords(creates.map(item => item.record)));
          recordIds = recordIds.concat(created.map(record => record.recordId));
          created.forEach((record, index) => existingByKey.set(creates[index].key, record.recordId));
        }
      } else {
        const state = options.appendState;
        const fieldIds = availableFieldList.map(({ field }) => field.id);
        if (state && !state.knownRecordIds) {
          // 保留正常追加语义：历史同内容记录不能抵扣本次失败批次。
          state.knownRecordIds = new Set((await readTableRecords(activeTable)).map(record => record.recordId));
          state.fieldIds = fieldIds;
        }
        if (state && JSON.stringify(state.fieldIds) !== JSON.stringify(fieldIds)) {
          throw new Error('目标字段已变化，无法核对上次写入，请恢复原字段后继续');
        }
        const recordKey = fields => JSON.stringify(availableFieldList.map(({ field, fieldType }) => {
          const value = fields[field.id];
          if (fieldType === FieldType.Text) {
            return Array.isArray(value) ? value.map(part => part.text).join('') : String(value ?? '');
          }
          if (fieldType === FieldType.SingleSelect) return value?.text ?? value ?? '';
          return value ?? null;
        }));
        let offset = 0;
        for (const batch of chunkRecords(records)) {
          let pending = batch;
          const recoveredIds = [];
          if (state?.pendingCount) {
            if (state.pendingCount !== batch.length) throw new Error('待核对批次与原结果不一致');
            const keys = normalizedRecords.slice(offset, offset + batch.length).map(recordKey);
            const expected = new Map();
            keys.forEach(key => expected.set(key, (expected.get(key) || 0) + 1));
            const matches = new Map();
            for (const record of await readTableRecords(activeTable)) {
              if (state.knownRecordIds.has(record.recordId)) continue;
              const key = recordKey(record.fields);
              if (!expected.has(key)) continue;
              const ids = matches.get(key) || [];
              ids.push(record.recordId);
              if (ids.length > expected.get(key)) throw new Error('核对到多于预期的相同记录，请检查目标表后再继续');
              matches.set(key, ids);
            }
            pending = batch.filter((_, index) => {
              const ids = matches.get(keys[index]);
              if (!ids?.length) return true;
              recoveredIds.push(ids.shift());
              return false;
            });
          }
          if (state) state.pendingCount = batch.length;
          const created = pending.length ? await writeBatch(() => activeTable.addRecords(pending)) : [];
          if (created.length !== pending.length) throw new Error('写入未完成，请检查目标表格后重试');
          const completedIds = recoveredIds.concat(created);
          if (state) {
            completedIds.forEach(id => state.knownRecordIds.add(id));
            state.pendingCount = 0;
          }
          recordIds = recordIds.concat(completedIds);
          await options.onBatchWritten?.(batch.length);
          offset += batch.length;
        }
      }

      options.assertActive?.();
      if (options.stopAfterCurrentBatch) {
        if (metrics) metrics.totalMs = performance.now() - startedAt;
        return { tableId: activeTable.id, recordIds, ...(metrics ? { metrics } : {}) };
      }

      if (total > page) {
        page += 1;
        getList(task_id, 'next', targetTableId, selectedFieldKeys);
        return;
      } else {
        resetParams();
      }
    } catch (error) {
      resetParams();
      throw error;
    }
  };

  onUnmounted(() => {
    closeInterval();
  });

  return {
    loading,
    profileProgress,
    resetParams,
    pollTaskStatus,
    closeInterval,
    getList,
    createAndWriteData,
    validateTableFields: (tableId, selectedFieldKeys = [], options = {}) => validateTableFields(tableId, selectedFieldKeys, fieldMapping, options),
  };
};
