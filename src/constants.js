/**
 * Pure constants module — DOM-free, no imports.
 * Source of truth for pipeline stages, derived status list, and localStorage keys.
 *
 * Copied verbatim from index.html:2761 (PIPELINE_STAGES).
 * The legacy 8-value STATUSES literal (index.html:1776) is being collapsed to
 * these 5 stages; '서류합격', '코테/과제', '불합격' are no longer valid statuses.
 * This is the ONLY status literal array in the codebase — everything else must
 * derive from it.
 */

export const PIPELINE_STAGES = [
  { key: '관심', name: '👀 관심 공고', color: '#94A3B8', desc: '타깃 희망 공고' },
  { key: '서류준비', name: '📝 서류 준비', color: '#F59E0B', desc: '자소서·이력서 작성 중' },
  { key: '서류제출', name: '🚀 서류 제출 완료', color: '#3B82F6', desc: '접수 완료 / 심사 대기' },
  { key: '면접대기', name: '🎯 면접 대기', color: '#10B981', desc: '1·2차 직무/임원 면접' },
  { key: '최종합격', name: '🏆 최종 합격', color: '#EAB308', desc: '오퍼 수락 & 합격' }
];

export const STATUSES = PIPELINE_STAGES.map(s => s.key);

export const STORAGE_KEYS = {
  applications: 'ABLE_JOB_APPLICATIONS',
  purge: 'able_demo_purged_v4',
  migration: 'able_status_migrated_v5'
};

export const STAGE_BY_KEY = Object.fromEntries(PIPELINE_STAGES.map(s => [s.key, s]));
