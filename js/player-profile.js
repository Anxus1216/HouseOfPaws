export const PLAYER_PROFILE_KEY = 'paw_house_player_profile_v1';

const PROFILE_VERSION = 1;
const MAX_NICKNAME_LENGTH = 24;
const MAX_AVATAR_URL_LENGTH = 2048;

export function normalizePlayerProfile(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const name = typeof value.nickName === 'string' ?
    value.nickName.replace(/[\u0000-\u001f\u007f]/g, '').trim() : '';
  const nickName = Array.from(name).slice(0, MAX_NICKNAME_LENGTH).join('');
  const candidate = typeof value.avatarUrl === 'string' ? value.avatarUrl.trim() : '';
  const avatarUrl = candidate.length <= MAX_AVATAR_URL_LENGTH &&
    /^https:\/\//i.test(candidate) ? candidate : '';
  // WeChat can return its anonymous placeholder after a successful API call.
  if (nickName === '微信用户' && !avatarUrl) return null;
  return nickName || avatarUrl ? { nickName, avatarUrl } : null;
}

export function cachedPlayerProfile(value) {
  return value?.version === PROFILE_VERSION ? normalizePlayerProfile(value) : null;
}

export function playerProfileRecord(profile) {
  return { version: PROFILE_VERSION, nickName: profile.nickName,
    avatarUrl: profile.avatarUrl };
}

export function authorizationOutcome(result) {
  const message = typeof result?.errMsg === 'string' ? result.errMsg : '';
  if (message.includes(':ok')) {
    const profile = result.rawData && normalizePlayerProfile(result.userInfo);
    return profile ? { kind: 'authorized', profile } : { kind: 'invalid' };
  }
  if (/privacy/i.test(message)) return { kind: 'privacy_required' };
  if (/deny|cancel|disagree/i.test(message)) return { kind: 'denied' };
  return { kind: 'failed' };
}
