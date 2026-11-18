import type { Rule, RuleType } from '../model'
import type { RuleImpl } from './types'
import { produce } from './produce'
import { consume } from './consume'
import { trade } from './trade'
import { growth } from './growth'
import { decay } from './decay'
import { threshold } from './threshold'
import { drift } from './drift'
import { agency } from './agency'
import { warfare } from './warfare'
import { contagion } from './contagion'
import { migration } from './migration'
import { fortune } from './fortune'
import { succession } from './succession'

type Registry = { [T in RuleType]: RuleImpl<Extract<Rule, { type: T }>> }

export const RULES: Registry = { drift, agency, warfare, contagion, migration, fortune, succession, produce, consume, trade, growth, decay, threshold }

export const RULE_TYPES = Object.keys(RULES) as RuleType[]

export function ruleImpl<R extends Rule>(rule: R): RuleImpl<R> {
  return RULES[rule.type] as unknown as RuleImpl<R>
}

/** Deterministic execution order: priority ascending, then id. */
export function orderRules(rules: Rule[]): Rule[] {
  return [...rules].sort((a, b) => a.priority - b.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}
