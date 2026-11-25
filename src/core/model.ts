import { parseDocument, stringify } from 'yaml'
import { toRaw } from 'vue'

export type EntityKind = 'proxy' | 'group' | 'provider' | 'builtin' | 'missing'
export type RelationKind = 'member' | 'provider-use' | 'dialer' | 'provider-proxy'

export interface LayoutPosition {
  x: number
  y: number
}

export interface ConfigEntity {
  id: string
  kind: EntityKind
  name: string
  raw: Record<string, unknown>
  order: number
  layout: LayoutPosition
}

export interface ConfigRelation {
  id: string
  sourceId: string
  targetId: string
  kind: RelationKind
  order: number
}

export interface ClashModel {
  entities: ConfigEntity[]
  relations: ConfigRelation[]
  engine: 'mihomo' | 'clash'
}

export interface ValidationIssue {
  level: 'error' | 'warning'
  message: string
  entityId?: string
}

export interface ImportResult {
  model: ClashModel
  issues: ValidationIssue[]
}

const BUILT_INS = new Set([
  'DIRECT', 'REJECT', 'REJECT-DROP', 'PASS', 'COMPATIBLE', 'GLOBAL', 'GLOBAL-DIRECT',
])

const makeId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`
// Vue's reactive proxies cannot be passed directly to structuredClone.
// Unwrap the root proxy first; nested config values remain plain YAML data.
const clone = <T,>(value: T): T => structuredClone(toRaw(value))

export function emptyModel(): ClashModel {
  return { entities: [], relations: [], engine: 'mihomo' }
}

function positionFor(kind: EntityKind, index: number): LayoutPosition {
  if (kind === 'group') return { x: 620 + (index % 2) * 20, y: 90 + Math.floor(index / 2) * 150 }
  if (kind === 'provider') return { x: 90, y: 400 + index * 130 }
  if (kind === 'builtin') return { x: 900, y: 470 + index * 90 }
  if (kind === 'missing') return { x: 340, y: 520 + index * 100 }
  return { x: 90, y: 80 + index * 125 }
}

function entity(kind: EntityKind, name: string, raw: Record<string, unknown>, order: number): ConfigEntity {
  const prefix = kind === 'group' ? 'group' : kind === 'provider' ? 'provider' : kind
  return { id: makeId(prefix), kind, name, raw: clone(raw), order, layout: positionFor(kind, order) }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => typeof item === 'string' ? item : '').filter(Boolean)
}

function findByName(model: ClashModel, name: string): ConfigEntity | undefined {
  return model.entities.find((item) => item.name === name)
}

function createReferenceEntity(model: ClashModel, name: string, kind: EntityKind): ConfigEntity {
  const found = findByName(model, name)
  if (found) return found
  const item = entity(kind, name, {}, model.entities.length)
  model.entities.push(item)
  return item
}

function addRelation(model: ClashModel, sourceId: string, targetId: string, kind: RelationKind, order: number) {
  if (model.relations.some((r) => r.sourceId === sourceId && r.targetId === targetId && r.kind === kind)) return
  model.relations.push({ id: makeId('rel'), sourceId, targetId, kind, order })
}

export function importYaml(source: string): ImportResult {
  const document = parseDocument(source, { uniqueKeys: true })
  if (document.errors.length) {
    throw new Error(document.errors.map((error) => error.message).join('\n'))
  }
  const root = asRecord(document.toJS())
  const model = emptyModel()
  const proxies = Array.isArray(root.proxies) ? root.proxies : []
  const groups = Array.isArray(root['proxy-groups']) ? root['proxy-groups'] as unknown[] : []
  const providers = asRecord(root['proxy-providers'])

  proxies.forEach((item, index) => {
    const raw = asRecord(item)
    const name = typeof raw.name === 'string' ? raw.name : `proxy-${index + 1}`
    model.entities.push(entity('proxy', name, raw, index))
  })

  groups.forEach((item, index) => {
    const raw = asRecord(item)
    const name = typeof raw.name === 'string' ? raw.name : `group-${index + 1}`
    model.entities.push(entity('group', name, raw, index))
  })

  Object.entries(providers).forEach(([name, value], index) => {
    model.entities.push(entity('provider', name, asRecord(value), index))
  })

  // Resolve proxy-to-proxy dialer dependencies and Provider download proxies.
  model.entities.filter((item) => item.kind === 'proxy').forEach((proxy) => {
    const dialerName = proxy.raw['dialer-proxy']
    if (typeof dialerName === 'string' && dialerName) {
      const dependency = findByName(model, dialerName) ?? createReferenceEntity(model, dialerName, 'missing')
      addRelation(model, dependency.id, proxy.id, 'dialer', 0)
    }
  })
  model.entities.filter((item) => item.kind === 'provider').forEach((provider) => {
    const proxyName = provider.raw.proxy
    if (typeof proxyName === 'string' && proxyName) {
      const dependency = findByName(model, proxyName) ?? createReferenceEntity(model, proxyName, 'missing')
      addRelation(model, dependency.id, provider.id, 'provider-proxy', 0)
    }
  })

  // Resolve proxy-group membership references. Child -> parent is the graph direction.
  model.entities.filter((item) => item.kind === 'group').forEach((group) => {
    const proxyRefs = asStringArray(group.raw.proxies)
    proxyRefs.forEach((name, index) => {
      let child = findByName(model, name)
      if (!child && BUILT_INS.has(name)) child = createReferenceEntity(model, name, 'builtin')
      if (!child) child = createReferenceEntity(model, name, 'missing')
      addRelation(model, child.id, group.id, 'member', index)
    })
    const providerRefs = asStringArray(group.raw.use)
    providerRefs.forEach((name, index) => {
      let provider = model.entities.find((item) => item.kind === 'provider' && item.name === name)
      if (!provider) provider = createReferenceEntity(model, name, 'missing')
      addRelation(model, provider.id, group.id, 'provider-use', index)
    })
  })

  // The starter targets Mihomo-compatible fragments by default.
  const issues = validateModel(model)
  return { model, issues }
}

function orderedRelations(model: ClashModel, targetId: string, kind: RelationKind) {
  return model.relations
    .filter((relation) => relation.targetId === targetId && relation.kind === kind)
    .sort((a, b) => a.order - b.order)
}

function toRawEntity(model: ClashModel, item: ConfigEntity): Record<string, unknown> {
  const raw = clone(item.raw)
  if (item.kind === 'proxy' || item.kind === 'group') raw.name = item.name
  if (item.kind === 'proxy') {
    const dialer = orderedRelations(model, item.id, 'dialer')[0]
    const dependency = dialer && model.entities.find((entity) => entity.id === dialer.sourceId)
    if (dependency) raw['dialer-proxy'] = dependency.name
    else if (dialer) delete raw['dialer-proxy']
  }
  if (item.kind === 'provider') {
    const proxyRelation = orderedRelations(model, item.id, 'provider-proxy')[0]
    const dependency = proxyRelation && model.entities.find((entity) => entity.id === proxyRelation.sourceId)
    if (dependency) raw.proxy = dependency.name
  }
  if (item.kind === 'group') {
    const members = orderedRelations(model, item.id, 'member')
      .map((relation) => model.entities.find((entity) => entity.id === relation.sourceId))
      .filter((child): child is ConfigEntity => Boolean(child))
      .map((child) => child.name)
    const providers = orderedRelations(model, item.id, 'provider-use')
      .map((relation) => model.entities.find((entity) => entity.id === relation.sourceId))
      .filter((child): child is ConfigEntity => Boolean(child))
      .map((child) => child.name)
    if ('proxies' in raw || members.length) raw.proxies = members
    if ('use' in raw || providers.length) raw.use = providers
  }
  return raw
}

export function exportYaml(model: ClashModel, selectedGroupId?: string): string {
  const selected = selectedGroupId ? collectDependencies(model, selectedGroupId) : undefined
  const entities = model.entities.filter((item) =>
    item.kind === 'proxy' || item.kind === 'group' || item.kind === 'provider'
  ).filter((item) => !selected || selected.has(item.id))

  const proxies = entities.filter((item) => item.kind === 'proxy').sort((a, b) => a.order - b.order)
  const groups = entities.filter((item) => item.kind === 'group').sort((a, b) => a.order - b.order)
  const providers = entities.filter((item) => item.kind === 'provider').sort((a, b) => a.order - b.order)

  const output: Record<string, unknown> = {}
  if (proxies.length) output.proxies = proxies.map((item) => toRawEntity(model, item))
  if (providers.length) {
    output['proxy-providers'] = Object.fromEntries(providers.map((item) => [item.name, toRawEntity(model, item)]))
  }
  if (groups.length) output['proxy-groups'] = groups.map((item) => toRawEntity(model, item))
  return stringify(output, { lineWidth: 0, sortMapEntries: false })
}

export function collectDependencies(model: ClashModel, groupId: string): Set<string> {
  const selected = new Set<string>()
  const visiting = new Set<string>()
  const visit = (id: string) => {
    if (selected.has(id) || visiting.has(id)) return
    visiting.add(id)
    selected.add(id)
    const item = model.entities.find((entity) => entity.id === id)
    if (!item) return

    // Group membership and provider-use are represented by incoming edges.
    model.relations.filter((relation) => relation.targetId === id).forEach((relation) => visit(relation.sourceId))

    // Include dialer dependencies and provider download-proxy dependencies when present.
    const dependencyName = item.kind === 'proxy' ? item.raw['dialer-proxy'] : item.kind === 'provider' ? item.raw.proxy : undefined
    if (typeof dependencyName === 'string') {
      const dependency = model.entities.find((entity) => entity.name === dependencyName)
      if (dependency) visit(dependency.id)
    }
    visiting.delete(id)
  }
  visit(groupId)
  return selected
}

export function canConnect(model: ClashModel, sourceId: string, targetId: string): { ok: boolean; reason?: string } {
  const source = model.entities.find((item) => item.id === sourceId)
  const target = model.entities.find((item) => item.id === targetId)
  if (!source || !target) return { ok: false, reason: '节点不存在' }
  if (source.id === target.id) return { ok: false, reason: '不能连接自身' }

  let kind: RelationKind
  if (target.kind === 'group' && ['proxy', 'group', 'provider', 'builtin'].includes(source.kind)) {
    kind = source.kind === 'provider' ? 'provider-use' : 'member'
  } else if (target.kind === 'proxy' && source.kind === 'proxy') {
    kind = 'dialer'
  } else if (target.kind === 'provider' && source.kind === 'proxy') {
    kind = 'provider-proxy'
  } else {
    return { ok: false, reason: '关系类型不支持：只能连接到策略组，或配置代理拨号/Provider 下载代理依赖' }
  }

  if (model.relations.some((relation) => relation.sourceId === sourceId && relation.targetId === targetId && relation.kind === kind)) {
    return { ok: false, reason: '该引用关系已经存在' }
  }
  if (['member', 'dialer'].includes(kind) && createsCycle(model, sourceId, targetId)) {
    return { ok: false, reason: kind === 'member' ? '该连接会形成策略组循环引用' : '该连接会形成拨号代理循环依赖' }
  }
  return { ok: true }
}

// Edges point from a dependency to the object that uses it. Adding source -> target
// closes a cycle when target can already reach source through dependency edges.
function createsCycle(model: ClashModel, sourceId: string, targetId: string): boolean {
  const stack = [targetId]
  const seen = new Set<string>()
  while (stack.length) {
    const current = stack.pop()!
    if (current === sourceId) return true
    if (seen.has(current)) continue
    seen.add(current)
    model.relations.filter((relation) => relation.sourceId === current && ['member', 'dialer', 'provider-use'].includes(relation.kind))
      .forEach((relation) => stack.push(relation.targetId))
  }
  return false
}

export function connect(model: ClashModel, sourceId: string, targetId: string): ConfigRelation {
  const result = canConnect(model, sourceId, targetId)
  if (!result.ok) throw new Error(result.reason)
  const source = model.entities.find((item) => item.id === sourceId)!
  const target = model.entities.find((item) => item.id === targetId)!
  const kind: RelationKind = target.kind === 'proxy' ? 'dialer'
    : target.kind === 'provider' ? 'provider-proxy'
    : source.kind === 'provider' ? 'provider-use' : 'member'
  const order = model.relations.filter((relation) => relation.targetId === targetId && relation.kind === kind).length
  const relation: ConfigRelation = { id: makeId('rel'), sourceId, targetId, kind, order }
  model.relations.push(relation)
  return relation
}

export function removeRelation(model: ClashModel, relationId: string) {
  const relation = model.relations.find((item) => item.id === relationId)
  if (relation) {
    const target = model.entities.find((item) => item.id === relation.targetId)
    if (target && relation.kind === 'dialer') delete target.raw['dialer-proxy']
    if (target && relation.kind === 'provider-proxy') delete target.raw.proxy
  }
  model.relations = model.relations.filter((item) => item.id !== relationId)
  normalizeRelationOrder(model)
}

export function resolveMissingEntity(model: ClashModel, entityId: string, kind: 'proxy'|'group'|'provider') {
  const item = model.entities.find((entity) => entity.id === entityId && entity.kind === 'missing')
  if (!item) return
  item.kind = kind
  if (kind === 'proxy') item.raw = { name: item.name, type: 'ss', server: '', port: 443, cipher: '', password: '' }
  else if (kind === 'group') item.raw = { name: item.name, type: 'select', proxies: [] }
  else item.raw = { type: 'http', url: '', path: `./providers/${item.name}.yaml`, interval: 3600 }
}

export function normalizeRelationOrder(model: ClashModel) {
  const groups = new Set(model.relations.map((relation) => `${relation.targetId}:${relation.kind}`))
  groups.forEach((key) => {
    const [targetId, kind] = key.split(':') as [string, RelationKind]
    model.relations.filter((relation) => relation.targetId === targetId && relation.kind === kind)
      .sort((a, b) => a.order - b.order)
      .forEach((relation, index) => { relation.order = index })
  })
}

export function removeEntity(model: ClashModel, entityId: string) {
  const target = model.entities.find((item) => item.id === entityId)
  if (!target || target.kind === 'builtin') return
  model.entities = model.entities.filter((item) => item.id !== entityId)
  model.relations = model.relations.filter((relation) => relation.sourceId !== entityId && relation.targetId !== entityId)
  normalizeRelationOrder(model)
}

export function validateModel(model: ClashModel): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const byName = new Map<string, ConfigEntity[]>()
  model.entities.filter((item) => item.kind !== 'builtin' && item.kind !== 'missing').forEach((item) => {
    const bucket = byName.get(item.name) ?? []
    bucket.push(item)
    byName.set(item.name, bucket)
  })
  byName.forEach((items, name) => {
    if (items.length > 1) items.forEach((item) => issues.push({ level: 'error', message: `名称重复：${name}`, entityId: item.id }))
  })

  model.entities.filter((item) => item.kind === 'missing').forEach((item) => {
    issues.push({ level: 'error', message: `引用不存在的对象：${item.name}`, entityId: item.id })
  })

  const knownNames = new Set(model.entities.filter((item) => item.kind !== 'missing').map((item) => item.name))
  model.relations.forEach((relation) => {
    const source = model.entities.find((item) => item.id === relation.sourceId)
    const target = model.entities.find((item) => item.id === relation.targetId)
    if (!source || !target) return
    const valid = relation.kind === 'member'
      ? target.kind === 'group' && ['proxy', 'group', 'builtin', 'missing'].includes(source.kind)
      : relation.kind === 'provider-use'
        ? target.kind === 'group' && ['provider', 'missing'].includes(source.kind)
        : relation.kind === 'dialer'
          ? source.kind === 'proxy' && target.kind === 'proxy'
          : source.kind === 'proxy' && target.kind === 'provider'
    if (!valid) issues.push({ level: 'error', message: `关系类型不匹配：${source.name} → ${target.name}`, entityId: target.id })
  })

  model.entities.forEach((item) => {
    if (item.kind === 'proxy') {
      if (!item.raw.type) issues.push({ level: 'error', message: '代理节点缺少 type', entityId: item.id })
      if (!item.raw.server) issues.push({ level: 'error', message: '代理节点缺少 server', entityId: item.id })
      const port = Number(item.raw.port)
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        issues.push({ level: 'error', message: '代理节点 port 必须是 1–65535 的整数', entityId: item.id })
      }
    }
    if (item.kind === 'provider') {
      const type = String(item.raw.type ?? '')
      if (!type) issues.push({ level: 'error', message: 'Provider 缺少 type', entityId: item.id })
      if (type === 'http' && !item.raw.url) issues.push({ level: 'error', message: 'HTTP Provider 缺少 url', entityId: item.id })
    }
    const hasDialerRelation = model.relations.some((relation) => relation.targetId === item.id && relation.kind === 'dialer')
    const hasProviderProxyRelation = model.relations.some((relation) => relation.targetId === item.id && relation.kind === 'provider-proxy')
    const dialerName = item.kind === 'proxy' && !hasDialerRelation ? item.raw['dialer-proxy'] : undefined
    const providerProxy = item.kind === 'provider' && !hasProviderProxyRelation ? item.raw.proxy : undefined
    for (const [label, value] of [['dialer-proxy', dialerName], ['provider proxy', providerProxy]] as const) {
      if (typeof value === 'string' && value && !knownNames.has(value)) {
        issues.push({ level: 'error', message: `${label} 引用了不存在的对象：${value}`, entityId: item.id })
      }
    }
  })

  model.entities.filter((item) => item.kind === 'group').forEach((group) => {
    const members = model.relations.filter((relation) => relation.targetId === group.id)
    if (members.length === 0 && !group.raw['include-all'] && !group.raw['include-all-proxies'] && !group.raw['include-all-providers']) {
      issues.push({ level: 'warning', message: '策略组没有成员或动态引入规则', entityId: group.id })
    }
    const type = String(group.raw.type ?? '')
    if (!type) issues.push({ level: 'error', message: '策略组缺少 type', entityId: group.id })
    if (['url-test', 'fallback', 'load-balance'].includes(type) && !group.raw.url) {
      issues.push({ level: 'warning', message: `${type} 策略组建议配置 url`, entityId: group.id })
    }
  })

  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (id: string, chain: string[]) => {
    if (visiting.has(id)) {
      issues.push({ level: 'error', message: `策略组循环引用：${chain.join(' → ')}`, entityId: id })
      return
    }
    if (visited.has(id)) return
    visiting.add(id)
    model.relations.filter((relation) => relation.sourceId === id && relation.kind === 'member')
      .forEach((relation) => visit(relation.targetId, [...chain, model.entities.find((item) => item.id === relation.targetId)?.name ?? relation.targetId]))
    visiting.delete(id)
    visited.add(id)
  }
  model.entities.filter((item) => item.kind === 'group').forEach((item) => visit(item.id, [item.name]))
  return issues
}

export function createEntity(model: ClashModel, kind: 'proxy' | 'group' | 'provider'): ConfigEntity {
  const index = model.entities.filter((item) => item.kind === kind).reduce((max, item) => Math.max(max, item.order), -1) + 1
  const baseName = kind === 'proxy' ? 'NEW-PROXY' : kind === 'group' ? '新策略组' : 'new-provider'
  let name = baseName
  let suffix = 1
  while (model.entities.some((item) => item.name === name)) name = `${baseName}-${suffix++}`
  const raw: Record<string, unknown> = kind === 'proxy'
    ? { name, type: 'ss', server: 'example.com', port: 443, cipher: 'aes-128-gcm', password: 'change-me' }
    : kind === 'group'
      ? { name, type: 'select', proxies: [] }
      : { type: 'http', url: 'https://example.com/subscription.yaml', path: `./providers/${name}.yaml`, interval: 3600 }
  const item = entity(kind, name, raw, index)
  if (kind === 'provider') item.layout = { x: 90, y: 400 + index * 130 }
  model.entities.push(item)
  return item
}

export function createDemoModel(): ClashModel {
  const yaml = `proxies:\n  - name: HK-01\n    type: ss\n    server: hk.example.com\n    port: 443\n    cipher: aes-128-gcm\n    password: change-me\n  - name: JP-01\n    type: vless\n    server: jp.example.com\n    port: 443\n    uuid: 00000000-0000-4000-8000-000000000000\n    tls: true\nproxy-providers:\n  provider-hk:\n    type: http\n    url: https://example.com/hk.yaml\n    path: ./providers/hk.yaml\n    interval: 3600\n  provider-jp:\n    type: file\n    path: ./providers/jp.yaml\nproxy-groups:\n  - name: 默认出口\n    type: select\n    proxies:\n      - 节点选择\n      - DIRECT\n  - name: 节点选择\n    type: select\n    proxies:\n      - 香港自动选择\n      - 日本自动选择\n  - name: 香港自动选择\n    type: url-test\n    url: https://www.gstatic.com/generate_204\n    interval: 300\n    use:\n      - provider-hk\n    proxies:\n      - HK-01\n  - name: 日本自动选择\n    type: url-test\n    url: https://www.gstatic.com/generate_204\n    interval: 300\n    use:\n      - provider-jp\n    proxies:\n      - JP-01\n`
  return importYaml(yaml).model
}
