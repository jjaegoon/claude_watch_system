/**
 * usage_events flush queue size (T-23 — M3 활성).
 * Step 2 시점엔 큐 자체가 미존재 → 0 stub.
 * M3에서 실제 in-memory 큐 구현 시 본 함수만 갱신.
 */
export const getQueueSize = (): number => 0
