import { DateFormatter, FieldType } from '@lark-base-open/js-sdk';
import { useSocialData } from './useSocialData';

export const SUGGESTION_FIELD_MAPPING = [
  { key: 'keyword', name: '搜索关键词', type: FieldType.Text, defaultSelected: true, required: true },
  { key: 'recommendation', name: '推荐词', type: FieldType.Text, defaultSelected: true, required: true },
  { key: 'suggestion_type', name: '建议类型', type: FieldType.Text, defaultSelected: true },
  { key: 'suggestion_label', name: '建议标记', type: FieldType.Text, defaultSelected: true },
  { key: 'description', name: '补充说明', type: FieldType.Text, defaultSelected: true },
  { key: 'social_type', name: '平台', type: FieldType.Text, defaultSelected: true },
  { key: 'ctime', name: '提取时间', type: FieldType.DateTime, defaultSelected: true, isTimestamp: true, dateFormat: DateFormatter.DATE_TIME },
];

export const useSuggestionData = apiKey => useSocialData(
  () => '搜索推荐词',
  apiKey,
  SUGGESTION_FIELD_MAPPING,
);
