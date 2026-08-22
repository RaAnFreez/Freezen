const SERVICE_LOOKUP_SQL = 'SELECT id, name, slug, description, active FROM frezen_key_services WHERE slug = ?1 LIMIT 1';
const SERVICE_RESOLVER_SQL = `SELECT id, name, slug, description, active
  FROM frezen_key_services
  WHERE slug = ?1
     OR id = ?1
     OR id = (SELECT service_id FROM frezen_key_service_aliases WHERE slug = ?1 LIMIT 1)
  LIMIT 1`;

function normalizeSql(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function withGetKeyServiceResolver(env) {
  if (!env?.DB) return env;

  const originalDb = env.DB;
  const proxy = new Proxy(originalDb, {
    get(target, property, receiver) {
      if (property !== 'prepare') return Reflect.get(target, property, receiver);
      return (sql) => {
        if (normalizeSql(sql) === normalizeSql(SERVICE_LOOKUP_SQL)) {
          return target.prepare(SERVICE_RESOLVER_SQL);
        }
        return target.prepare(sql);
      };
    },
  });

  return { ...env, DB: proxy };
}

export const __test = { normalizeSql, SERVICE_LOOKUP_SQL, SERVICE_RESOLVER_SQL };
