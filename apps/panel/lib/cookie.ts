/**
 * Nazwa ciasteczka sesji, w osobnym module bez zależności od Node.
 *
 * Middleware działa w środowisku edge i nie zaimportuje modułu sięgającego
 * po `node:crypto` — dlatego stała mieszka tutaj, a nie w `session.ts`.
 */
export const COOKIE_NAME = 'longevity_prototyp';
