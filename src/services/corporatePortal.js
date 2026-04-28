import dotenv from 'dotenv';
import * as store from './vectorStore.js';

dotenv.config();

const WP_URL = (process.env.WP_URL || '').replace(/\/+$/, '');
const WP_USER = process.env.WP_USER || '';
const WP_APP_PASS = process.env.WP_APP_PASS || '';
const PER_PAGE = parseInt(process.env.WP_PER_PAGE, 10) || 100;
const SYNC_HOUR_MSK = parseInt(process.env.WP_SYNC_HOUR_MSK, 10) || 18;
const SYNC_MINUTE_MSK = parseInt(process.env.WP_SYNC_MINUTE_MSK, 10) || 0;
const ALLOW_INSECURE_TLS = String(process.env.WP_ALLOW_INSECURE_TLS ?? 'true') === 'true';
const USERS_FIELDS = process.env.WP_USERS_FIELDS || [
  'id',
  'username',
  'name',
  'first_name',
  'last_name',
  'email',
  'roles',
  'registered_date',
  'link',
  'meta',
  'acf'
].join(',');
const POSTS_FIELDS = process.env.WP_POSTS_FIELDS || [
  'id',
  'date',
  'modified',
  'title.raw',
  'title.rendered',
  'content.raw',
  'content.rendered',
  'link'
].join(',');

const MOSCOW_TZ = 'Europe/Moscow';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

let syncTimer = null;
let running = false;
let lastSync = null;

function isConfigured() {
  return Boolean(WP_URL && WP_USER && WP_APP_PASS);
}

function basicAuthHeader() {
  return `Basic ${Buffer.from(`${WP_USER}:${WP_APP_PASS}`).toString('base64')}`;
}

function wpUrl(route, params = {}) {
  const url = new URL(`${WP_URL}/wp-json/wp/v2/${route}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function fetchWpJson(route, params = {}) {
  if (ALLOW_INSECURE_TLS) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  }

  const res = await fetch(wpUrl(route, params), {
    headers: {
      Authorization: basicAuthHeader(),
      Accept: 'application/json'
    }
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`WordPress ${route} failed: HTTP ${res.status} ${body.slice(0, 300)}`);
  }

  return {
    data: await res.json(),
    totalPages: parseInt(res.headers.get('x-wp-totalpages') || '0', 10)
  };
}

async function fetchAllPages(route, fields) {
  const out = [];
  let page = 1;
  let totalPages = 1;

  do {
    const { data, totalPages: headerTotalPages } = await fetchWpJson(route, {
      context: 'edit',
      per_page: PER_PAGE,
      page,
      _fields: fields
    });

    const items = Array.isArray(data) ? data : [];
    out.push(...items);
    totalPages = headerTotalPages || (items.length === PER_PAGE ? page + 1 : page);
    page += 1;
  } while (page <= totalPages);

  return out;
}

function compact(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map(compact).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([key, val]) => {
        const text = compact(val);
        return text ? `${key}: ${text}` : '';
      })
      .filter(Boolean)
      .join('; ');
  }
  return String(value);
}

function flattenObject(value, prefix = '') {
  if (!value || typeof value !== 'object') return [];
  const rows = [];

  for (const [key, val] of Object.entries(value)) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (val == null || val === '') continue;
    if (Array.isArray(val)) {
      const text = compact(val);
      if (text) rows.push(`${name}: ${text}`);
    } else if (typeof val === 'object') {
      rows.push(...flattenObject(val, name));
    } else {
      rows.push(`${name}: ${String(val)}`);
    }
  }

  return rows;
}

function stripWpContent(html = '') {
  return String(html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function userToText(user) {
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || user.name || user.username;
  const metaRows = [
    ...flattenObject(user.meta, 'meta'),
    ...flattenObject(user.acf, 'acf')
  ];

  return [
    `Сотрудник: ${fullName}`,
    `ID WordPress: ${user.id}`,
    `Логин: ${user.username || 'не указан'}`,
    `ФИО: ${user.name || fullName || 'не указано'}`,
    `Имя: ${user.first_name || 'не указано'}`,
    `Фамилия: ${user.last_name || 'не указана'}`,
    `Email: ${user.email || 'не указан'}`,
    `Роли: ${compact(user.roles) || 'не указаны'}`,
    `Дата регистрации на портале: ${user.registered_date || 'не указана'}`,
    `Ссылка профиля: ${user.link || 'не указана'}`,
    metaRows.length ? `Дополнительные поля профиля:\n${metaRows.join('\n')}` : ''
  ].filter(Boolean).join('\n');
}

function postToText(post) {
  const title = post?.title?.raw || post?.title?.rendered || `Запись ${post.id}`;
  const content = stripWpContent(post?.content?.raw || post?.content?.rendered || '');

  return [
    `Корпоративная новость/событие: ${title}`,
    `ID WordPress: ${post.id}`,
    `Дата публикации: ${post.date || 'не указана'}`,
    `Дата изменения: ${post.modified || 'не указана'}`,
    `Ссылка: ${post.link || 'не указана'}`,
    content ? `Текст:\n${content}` : 'Текст записи пуст или состоит только из медиа.'
  ].join('\n');
}

function buildUsersDocument(users) {
  return [
    `Корпоративный портал: сотрудники`,
    `Обновлено: ${new Date().toISOString()}`,
    `Всего сотрудников: ${users.length}`,
    '',
    ...users.map(userToText)
  ].join('\n\n---\n\n');
}

function buildPostsDocument(posts) {
  return [
    `Корпоративный портал: новости и события`,
    `Обновлено: ${new Date().toISOString()}`,
    `Всего записей: ${posts.length}`,
    '',
    ...posts.map(postToText)
  ].join('\n\n---\n\n');
}

export async function syncCorporatePortalData() {
  if (!isConfigured()) {
    return {
      skipped: true,
      reason: 'WP_URL, WP_USER или WP_APP_PASS не заданы'
    };
  }
  if (running) {
    return {
      skipped: true,
      reason: 'Синхронизация уже выполняется'
    };
  }

  running = true;
  try {
    store.loadIndex();

    const [users, posts] = await Promise.all([
      fetchAllPages('users', USERS_FIELDS),
      fetchAllPages('posts', POSTS_FIELDS)
    ]);

    const userChunks = await store.indexDocument({
      id: 'corporate-portal-users',
      title: 'Корпоративный портал: сотрудники',
      type: 'Корпоративные данные',
      category: 'Сотрудники',
      sourcePath: `${WP_URL}/wp-json/wp/v2/users`,
      text: buildUsersDocument(users)
    });

    const postChunks = await store.indexDocument({
      id: 'corporate-portal-posts',
      title: 'Корпоративный портал: новости и события',
      type: 'Корпоративные данные',
      category: 'Новости и события',
      sourcePath: `${WP_URL}/wp-json/wp/v2/posts`,
      text: buildPostsDocument(posts)
    });

    lastSync = new Date().toISOString();
    return {
      skipped: false,
      users: users.length,
      posts: posts.length,
      chunks: userChunks + postChunks,
      lastSync
    };
  } finally {
    running = false;
  }
}

function getMoscowParts(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MOSCOW_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(date);

  return Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)]));
}

function utcMsForMoscowWallTime({ year, month, day, hour, minute, second = 0 }) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const actual = getMoscowParts(new Date(utcGuess));
  const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
  return utcGuess - (actualAsUtc - utcGuess);
}

export function getNextCorporateSyncDate(now = new Date()) {
  const moscow = getMoscowParts(now);
  let targetMs = utcMsForMoscowWallTime({
    year: moscow.year,
    month: moscow.month,
    day: moscow.day,
    hour: SYNC_HOUR_MSK,
    minute: SYNC_MINUTE_MSK
  });

  if (targetMs <= now.getTime()) targetMs += MS_PER_DAY;
  return new Date(targetMs);
}

export function getCorporatePortalSyncState() {
  return {
    configured: isConfigured(),
    running,
    lastSync,
    nextSync: syncTimer ? getNextCorporateSyncDate().toISOString() : null,
    schedule: `${String(SYNC_HOUR_MSK).padStart(2, '0')}:${String(SYNC_MINUTE_MSK).padStart(2, '0')} ${MOSCOW_TZ}`
  };
}

export function scheduleCorporatePortalSync() {
  if (syncTimer) clearTimeout(syncTimer);

  const next = getNextCorporateSyncDate();
  const delay = Math.max(1000, next.getTime() - Date.now());

  syncTimer = setTimeout(async () => {
    try {
      console.log('🏢 Запускаю синхронизацию корпоративного портала…');
      const result = await syncCorporatePortalData();
      if (result.skipped) {
        console.warn(`🏢 Синхронизация корпоративного портала пропущена: ${result.reason}`);
      } else {
        console.log(`🏢 Корпоративный портал синхронизирован: users=${result.users}, posts=${result.posts}, chunks=${result.chunks}`);
      }
    } catch (e) {
      console.error('🏢 Ошибка синхронизации корпоративного портала:', e.message);
    } finally {
      scheduleCorporatePortalSync();
    }
  }, delay);

  console.log(`🏢 Следующая синхронизация корпоративного портала: ${next.toISOString()} (${MOSCOW_TZ})`);
  return next;
}

export default {
  syncCorporatePortalData,
  scheduleCorporatePortalSync,
  getCorporatePortalSyncState,
  getNextCorporateSyncDate
};
