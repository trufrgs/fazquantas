import {
  BEST_OF_OPTIONS,
  BOT_DIFFICULTIES,
  MAX_LIVES,
  MIN_LIVES,
  NAME_MAX_LENGTH,
  PACES,
  PASSWORD_MAX_LENGTH,
  REACTIONS,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  TURN_TIMEOUT_OPTIONS,
  isCardId,
  type BestOf,
  type BotDifficulty,
  type CardId,
  type Pace,
  type ReactionId,
  type Rules,
} from '@fodinha/engine';
import * as z from 'zod';
import { fail, MESSAGES } from './erros';
import { PROFILE_KEY_PATTERN } from './perfil';

/**
 * Caracteres que não podem ir para um apelido: controles C0/C1, marcas bidirecionais (viram o
 * texto do avesso na tela), separadores de linha, BOM e surrogates soltos. O ZWJ fica: ele
 * compõe emojis.
 */
function isUnsafeCodePoint(cp: number): boolean {
  return (
    cp < 0x20 ||
    (cp >= 0x7f && cp <= 0x9f) ||
    cp === 0x061c ||
    cp === 0x200e ||
    cp === 0x200f ||
    cp === 0x2028 ||
    cp === 0x2029 ||
    (cp >= 0x202a && cp <= 0x202e) ||
    (cp >= 0x2066 && cp <= 0x2069) ||
    cp === 0xfeff ||
    // Surrogate solto (ex.: emoji cortado ao meio por um `.slice`): vira lixo na tela.
    (cp >= 0xd800 && cp <= 0xdfff)
  );
}

const AVATAR_PATTERN = /^[A-Za-z0-9_-]*$/;
export const AVATAR_MAX_LENGTH = 64;
export const TOKEN_MAX_LENGTH = 64;
const PLAYER_ID_MAX_LENGTH = 64;
const MAX_CARDS_LIMIT = 20;
const MAX_BID = 20;

/** Tira caracteres de controle/invisíveis, junta espaços e apara as pontas. */
export function sanitizeName(raw: string): string {
  let clean = '';
  for (const char of raw) if (!isUnsafeCodePoint(char.codePointAt(0) ?? 0)) clean += char;
  return clean.replace(/\s+/gu, ' ').trim();
}

/** Comprimento em caracteres de verdade (code points), não em unidades UTF-16. */
function charCount(text: string): number {
  return Array.from(text).length;
}

export function normalizeRoomCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isValidRoomCode(code: string): boolean {
  return (
    code.length === ROOM_CODE_LENGTH && [...code].every((char) => ROOM_CODE_ALPHABET.includes(char))
  );
}

const nameSchema = z
  .string()
  .max(NAME_MAX_LENGTH * 16)
  .transform(sanitizeName)
  .refine((name) => charCount(name) >= 1 && charCount(name) <= NAME_MAX_LENGTH);

const avatarSchema = z.string().max(AVATAR_MAX_LENGTH).regex(AVATAR_PATTERN);

const codeSchema = z.string().max(32).transform(normalizeRoomCode).refine(isValidRoomCode);

const tokenSchema = z.string().max(TOKEN_MAX_LENGTH).nullish();

const playerIdSchema = z.string().min(1).max(PLAYER_ID_MAX_LENGTH);

const difficultySchema = z.enum(
  BOT_DIFFICULTIES.map((d) => d.id) as [BotDifficulty, ...BotDifficulty[]],
);

const reactionSchema = z.enum(REACTIONS.map((r) => r.id) as [ReactionId, ...ReactionId[]]);

/** Regras parciais: só as chaves conhecidas, com os tipos certos; o resto é descartado. */
const rulesPatchSchema = z
  .object({
    hierarchy: z.enum(['vira', 'gaucha', 'mineira']),
    startingLives: z.int().min(MIN_LIVES).max(MAX_LIVES),
    penalty: z.enum(['difference', 'fixed']),
    tieRule: z.enum(['cancel', 'nobody', 'suit']),
    blindRound: z.enum(['all', 'first', 'off']),
    dealerRestriction: z.boolean(),
    dealerRestrictionInBlind: z.boolean(),
    progression: z.enum(['up', 'upDown']),
    restartOnElimination: z.boolean(),
    maxCards: z.int().min(1).max(MAX_CARDS_LIMIT).nullable(),
  })
  .partial();

type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
/** Se o engine ganhar ou mudar uma regra, o typecheck quebra aqui até o schema acompanhar. */
export type RulesSchemaInSync = Assert<Equals<z.infer<typeof rulesPatchSchema>, Partial<Rules>>>;

const TURN_TIMEOUTS: readonly (number | null)[] = TURN_TIMEOUT_OPTIONS;
const turnTimeoutSchema = z
  .number()
  .nullable()
  .refine((sec) => TURN_TIMEOUTS.includes(sec));

const cardIdSchema = z.custom<CardId>((value) => isCardId(value));

const paceSchema = z.enum(PACES.map((p) => p.id) as [Pace, ...Pace[]]);

const bestOfSchema = z.custom<BestOf>((value) => (BEST_OF_OPTIONS as readonly unknown[]).includes(value));

/** Senha: texto livre curto, sem caracteres invisíveis; as pontas são aparadas. */
const passwordSchema = z
  .string()
  .max(PASSWORD_MAX_LENGTH * 8)
  .transform(sanitizeName)
  .refine((pw) => charCount(pw) >= 1 && charCount(pw) <= PASSWORD_MAX_LENGTH);

const profileKeySchema = z.string().regex(PROFILE_KEY_PATTERN);

export const updateRoomSchema = z.object({
  rules: rulesPatchSchema.optional(),
  turnTimeoutSec: turnTimeoutSchema.optional(),
  pace: paceSchema.optional(),
  bestOf: bestOfSchema.optional(),
  ranked: z.boolean().optional(),
  password: passwordSchema.nullable().optional(),
});

/** Identidade da aba (aleatória, do próprio app). */
const abaSchema = z.string().regex(/^[A-Za-z0-9_-]{8,40}$/).optional();

export const createRoomSchema = z.object({
  name: nameSchema,
  avatar: avatarSchema,
  profileKey: profileKeySchema.optional(),
  aba: abaSchema,
  visible: z.boolean().optional(),
  settings: updateRoomSchema.optional(),
});

export const joinRoomSchema = z.object({
  code: codeSchema,
  name: nameSchema,
  avatar: avatarSchema,
  token: tokenSchema,
  // Limpa do mesmo jeito que a senha guardada, para comparar igual.
  password: z.string().max(PASSWORD_MAX_LENGTH * 8).transform(sanitizeName).optional(),
  profileKey: profileKeySchema.optional(),
  aba: abaSchema,
  visible: z.boolean().optional(),
  auto: z.boolean().optional(),
});

export const presenceSchema = z.object({ visible: z.boolean() });

export const addBotSchema = z.object({ difficulty: difficultySchema });

export const setBotSchema = z.object({ playerId: playerIdSchema, difficulty: difficultySchema });

export const removeSeatSchema = z.object({ playerId: playerIdSchema });

export const gameActionSchema = z.object({
  action: z.discriminatedUnion('type', [
    z.object({ type: z.literal('bid'), value: z.int().min(0).max(MAX_BID) }),
    z.object({ type: z.literal('play'), cardId: cardIdSchema }),
  ]),
});

export const reactSchema = z.object({ reaction: reactionSchema });

const FIELD_MESSAGES: Readonly<Record<string, string>> = {
  pace: MESSAGES.pace,
  bestOf: MESSAGES.bestOf,
  ranked: MESSAGES.ranked,
  password: MESSAGES.password,
  profileKey: MESSAGES.profile,
  visible: MESSAGES.presence,
  settings: MESSAGES.payload,
  name: MESSAGES.name,
  avatar: MESSAGES.avatar,
  code: MESSAGES.code,
  token: MESSAGES.token,
  rules: MESSAGES.rules,
  turnTimeoutSec: MESSAGES.turnTimeout,
  difficulty: MESSAGES.difficulty,
  playerId: MESSAGES.playerId,
  action: MESSAGES.action,
  reaction: MESSAGES.reaction,
};

const RULE_MESSAGES: Readonly<Record<string, string>> = {
  startingLives: `${MESSAGES.lives} Use de ${MIN_LIVES} a ${MAX_LIVES}.`,
  maxCards: MESSAGES.maxCards,
};

/** Mensagem em pt-BR a partir do campo que falhou (as do zod são em inglês). */
function messageFor(issue: z.core.$ZodIssue | undefined): string {
  if (!issue) return MESSAGES.payload;
  const [first, second, third] = issue.path;
  // Ajustes dentro da criação da sala: a mensagem é a do campo de dentro.
  const [field, sub] = first === 'settings' ? [second, third] : [first, second];
  if (field === 'rules' && typeof sub === 'string' && RULE_MESSAGES[sub]) return RULE_MESSAGES[sub];
  return (typeof field === 'string' && FIELD_MESSAGES[field]) || MESSAGES.payload;
}

/** Valida um payload vindo do cliente; lança `INVALID_PAYLOAD` com mensagem pronta. */
export function parsePayload<S extends z.ZodType>(schema: S, payload: unknown): z.output<S> {
  const result = schema.safeParse(payload);
  if (!result.success) throw fail('INVALID_PAYLOAD', messageFor(result.error.issues[0]));
  return result.data;
}
