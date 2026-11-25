<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Graph, Selection } from '@antv/x6'
import {
  canConnect, connect, createDemoModel, createEntity, exportYaml, importYaml,
  removeEntity, removeRelation, resolveMissingEntity, validateModel,
  type ClashModel, type ConfigEntity, type ConfigRelation, type EntityKind, type ValidationIssue,
} from './core/model'
import { mihomoFieldsFor, mihomoProtocolDocsUrl, mihomoProxyTypes, type MihomoFieldDoc, type MihomoResourceKind } from './core/mihomo-schema'
import { computeAutoLayout } from './core/auto-layout'

const model = ref<ClashModel>(createDemoModel())
const theme = ref<'dark'|'light'>(typeof window !== 'undefined' && window.localStorage.getItem('clash-topology-theme') === 'light' ? 'light' : 'dark')
const language = ref<'zh'|'en'>(typeof window !== 'undefined' && window.localStorage.getItem('clash-topology-language') === 'en' ? 'en' : 'zh')
const graphHost = ref<HTMLDivElement | null>(null)
const selectedId = ref<string>()
const selectedRelationId = ref<string>()
const notice = ref('就绪')
const importOpen = ref(false)
const sourceOpen = ref(false)
const exportMenuOpen = ref(false)
const importText = ref('')
const sourceText = ref('')
const advancedText = ref('{}')
const advancedError = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
let graph: Graph | null = null
let noticeTimer = 0

const selected = computed(() => model.value.entities.find((item) => item.id === selectedId.value))
const selectedRelation = computed(() => model.value.relations.find((item) => item.id === selectedRelationId.value))
const proxies = computed(() => model.value.entities.filter((item) => item.kind === 'proxy'))
const groups = computed(() => model.value.entities.filter((item) => item.kind === 'group'))
const providers = computed(() => model.value.entities.filter((item) => item.kind === 'provider'))
const issues = computed(() => validateModel(model.value))
const displayedIssues = computed(() => issues.value.map((issue) => ({ ...issue, message: translateMessage(issue.message) })))
const errors = computed(() => issues.value.filter((item) => item.level === 'error').length)
const warnings = computed(() => issues.value.filter((item) => item.level === 'warning').length)
const documentedFields = computed(() => {
  const item = selected.value
  if (!item || !['proxy', 'group', 'provider'].includes(item.kind)) return []
  return mihomoFieldsFor(item.kind as MihomoResourceKind, String(item.raw.type ?? ''))
    .filter((field) => !['name', 'type', 'server', 'port', 'dialer-proxy', 'proxies', 'use', 'proxy'].includes(field.key))
})
const displayedNotice = computed(() => translateMessage(notice.value))
const memberRelations = computed(() => selected.value?.kind === 'group'
  ? model.value.relations.filter((r) => r.targetId === selected.value!.id && r.kind === 'member').sort((a,b) => a.order-b.order)
  : [])
const providerRelations = computed(() => selected.value?.kind === 'group'
  ? model.value.relations.filter((r) => r.targetId === selected.value!.id && r.kind === 'provider-use').sort((a,b) => a.order-b.order)
  : [])
const selectedMembers = computed(() => memberRelations.value.map((r) => ({ relation: r, entity: model.value.entities.find((e) => e.id === r.sourceId) })).filter((x): x is {relation: ConfigRelation; entity: ConfigEntity} => Boolean(x.entity)))
const selectedProviders = computed(() => providerRelations.value.map((r) => ({ relation: r, entity: model.value.entities.find((e) => e.id === r.sourceId) })).filter((x): x is {relation: ConfigRelation; entity: ConfigEntity} => Boolean(x.entity)))

const sampleYaml = `proxies:\n  - name: HK-01\n    type: ss\n    server: hk.example.com\n    port: 443\n    cipher: aes-128-gcm\n    password: change-me\n  - name: JP-01\n    type: vless\n    server: jp.example.com\n    port: 443\n    uuid: 00000000-0000-4000-8000-000000000000\n    tls: true\nproxy-providers:\n  provider-hk:\n    type: http\n    url: https://example.com/hk.yaml\n    path: ./providers/hk.yaml\n    interval: 3600\n  provider-jp:\n    type: file\n    path: ./providers/jp.yaml\nproxy-groups:\n  - name: 默认出口\n    type: select\n    proxies: [节点选择, DIRECT]\n  - name: 节点选择\n    type: select\n    proxies: [香港自动选择, 日本自动选择]\n  - name: 香港自动选择\n    type: url-test\n    url: https://www.gstatic.com/generate_204\n    interval: 300\n    proxies: [HK-01]\n    use: [provider-hk]\n  - name: 日本自动选择\n    type: url-test\n    url: https://www.gstatic.com/generate_204\n    interval: 300\n    proxies: [JP-01]\n    use: [provider-jp]\n`

function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
}
function toggleLanguage() {
  language.value = language.value === 'zh' ? 'en' : 'zh'
}
function tr(zh: string, en: string) {
  return language.value === 'zh' ? zh : en
}
function translateMessage(message: string) {
  if (language.value === 'zh') return message
  const exact: Record<string, string> = {
    '就绪': 'Ready',
    '节点不存在': 'Node does not exist',
    '不能连接自身': 'A node cannot connect to itself',
    '该引用关系已经存在': 'This reference already exists',
    '该连接会形成策略组循环引用': 'This connection would create a proxy-group cycle',
    '该连接会形成拨号代理循环依赖': 'This connection would create a dialer-proxy cycle',
    '高级属性已应用': 'Advanced fields applied',
    'YAML 已导出': 'YAML exported',
    '拓扑引用已更新': 'Topology reference updated',
    '当前未发现明显问题': 'No obvious issues found',
    'JSON 格式错误': 'Invalid JSON format',
    'YAML 解析失败': 'Failed to parse YAML',
    'Payload JSON 格式错误': 'Invalid Payload JSON',
    '该悬空引用来自 use 字段，必须解析为 Provider': 'This unresolved reference comes from use and must be resolved as a Provider',
    '该悬空引用来自 proxies 字段，应解析为 Proxy 或 Group': 'This unresolved reference comes from proxies and must be resolved as a Proxy or Group',
    '策略组没有成员或动态引入规则': 'The proxy group has no members or dynamic inclusion rules',
    '策略组缺少 type': 'Proxy group is missing the required type',
    '代理节点缺少 type': 'Proxy is missing the required type',
    '代理节点缺少 server': 'Proxy is missing the required server',
    'Provider 缺少 type': 'Provider is missing the required type',
    'HTTP Provider 缺少 url': 'HTTP Provider is missing the required url',
  }
  if (exact[message]) return exact[message]
  const rules: Array<[RegExp, (match: RegExpMatchArray) => string]> = [
    [/^名称重复：(.*)$/, (m) => `Duplicate name: ${m[1]}`],
    [/^引用不存在的对象：(.*)$/, (m) => `Reference to missing object: ${m[1]}`],
    [/^关系类型不匹配：(.*) → (.*)$/, (m) => `Relationship type mismatch: ${m[1]} → ${m[2]}`],
    [/^代理节点 port 必须是 1–65535 的整数$/, () => 'Proxy port must be an integer from 1 to 65535'],
    [/^HTTP Provider 缺少 url$/, () => 'HTTP Provider is missing the required url'],
    [/^策略组循环引用：(.*)$/, (m) => `Proxy group cycle: ${m[1]}`],
    [/^(url-test|fallback|load-balance) 策略组建议配置 url$/, (m) => `The ${m[1]} proxy group should configure a url`],
    [/^找不到代理：(.*)$/, (m) => `Proxy not found: ${m[1]}`],
    [/^名称「(.*)」已经存在$/, (m) => `The name "${m[1]}" already exists`],
    [/^该连接会形成策略组循环引用$/, () => 'This connection would create a proxy-group cycle'],
    [/^该连接会形成拨号代理循环依赖$/, () => 'This connection would create a dialer-proxy cycle'],
    [/^关系类型不支持：(.*)$/, (m) => `Unsupported relationship: ${m[1]}`],
    [/^名称「(.*)」已经存在$/, (m) => `The name "${m[1]}" already exists`],
    [/^导入完成：(.*)$/, (m) => `Import completed: ${m[1]}`],
    [/^(.+) 已创建$/, (m) => `${m[1]} created`],
    [/^(.+) 已删除，相关引用已移除$/, (m) => `${m[1]} deleted; related references removed`],
    [/^(.+) 已解析为 (.+)$/, (m) => `${m[1]} resolved as ${m[2]}`],
    [/^字段 (.+) 的 JSON 格式无效$/, (m) => `Invalid JSON for field ${m[1]}`],
  ]
  for (const [pattern, format] of rules) {
    const match = message.match(pattern)
    if (match) return format(match)
  }
  return message
}
function getDocumentedField(key: string): unknown {
  if (!selected.value) return undefined
  return key.split('.').reduce<unknown>((value, part) => {
    if (!value || typeof value !== 'object') return undefined
    return (value as Record<string, unknown>)[part]
  }, selected.value.raw)
}
function setDocumentedField(key: string, value: unknown) {
  const item = selected.value
  if (!item) return
  const parts = key.split('.')
  const leaf = parts.pop()!
  let target = item.raw as Record<string, unknown>
  for (const part of parts) {
    if (!target[part] || typeof target[part] !== 'object' || Array.isArray(target[part])) target[part] = {}
    target = target[part] as Record<string, unknown>
  }
  if (value === undefined || value === null || value === '') delete target[leaf]
  else target[leaf] = value
  if (item.kind === 'proxy') refreshNode(item)
}
function updateDocumentedField(field: MihomoFieldDoc, value: string | boolean) {
  if (field.type === 'number') {
    setDocumentedField(field.key, value === '' ? undefined : Number(value))
  } else {
    setDocumentedField(field.key, value)
  }
}
function updateDocumentedJsonField(field: MihomoFieldDoc, value: string) {
  try {
    setDocumentedField(field.key, value.trim() ? JSON.parse(value) : undefined)
  } catch {
    notify(tr(`字段 ${field.key} 的 JSON 格式无效`, `Invalid JSON for field ${field.key}`))
  }
}
function documentedFieldText(field: MihomoFieldDoc) {
  const value = getDocumentedField(field.key)
  return value === undefined ? '' : JSON.stringify(value, null, 2)
}
function notify(message: string) {
  notice.value = message
  window.clearTimeout(noticeTimer)
  noticeTimer = window.setTimeout(() => (notice.value = '就绪'), 2500)
}
function colorFor(kind: EntityKind) {
  const colors: Record<EntityKind, {stroke: string; fill: string}> = theme.value === 'light' ? {
    proxy: {stroke:'#299d73',fill:'#e7f6ee'}, group: {stroke:'#568ef0',fill:'#eaf1ff'},
    provider: {stroke:'#c47a27',fill:'#fff3df'}, builtin: {stroke:'#8492a6',fill:'#edf1f6'},
    missing: {stroke:'#cf5555',fill:'#fff0f0'},
  } : {
    proxy: {stroke:'#299d73',fill:'#122d29'}, group: {stroke:'#568ef0',fill:'#172a49'},
    provider: {stroke:'#d18a3b',fill:'#352819'}, builtin: {stroke:'#77869a',fill:'#263140'},
    missing: {stroke:'#df6565',fill:'#351f29'},
  }
  return colors[kind]
}
function labelFor(item: ConfigEntity) {
  const type = item.kind === 'group' ? String(item.raw.type ?? 'group')
    : item.kind === 'provider' ? `${String(item.raw.type ?? 'provider')} provider`
    : item.kind === 'proxy' ? String(item.raw.type ?? 'proxy')
    : item.kind === 'builtin' ? tr('内置出口', 'Built-in') : tr('未解析引用', 'Unresolved reference')
  const suffix = item.kind === 'group'
    ? `${model.value.relations.filter((r) => r.targetId === item.id).length} ${tr('个关联', 'references')}`
    : item.kind === 'proxy' ? String(item.raw.server ?? '')
    : item.kind === 'provider' ? tr('动态节点池', 'Dynamic node pool') : ''
  return `${item.name}\n${type}${suffix ? ` · ${suffix}` : ''}`
}
function nodeMeta(item: ConfigEntity) {
  const color = colorFor(item.kind)
  return {
    id: item.id, shape:'rect', x:item.layout.x, y:item.layout.y,
    width:item.kind === 'group' ? 244 : 224, height:90,
    attrs:{
      body:{rx:12,ry:12,fill:color.fill,stroke:color.stroke,strokeWidth:1.6,strokeDasharray:item.kind==='missing'?'5 4':undefined},
      label:{text:labelFor(item),fill:theme.value === 'light' ? '#172235' : '#eff5fc',fontSize:14,fontWeight:600,lineHeight:21,textWrap:{width:-24,height:-16,ellipsis:true}},
    },
    data:{entityId:item.id,kind:item.kind},
    ports:{
      groups:{
        in:{position:'left',attrs:{circle:{r:5,magnet:true,stroke:color.stroke,strokeWidth:1.5,fill:theme.value === 'light' ? '#f5f7fb' : '#0d1420'}}},
        out:{position:'right',attrs:{circle:{r:5,magnet:true,stroke:color.stroke,strokeWidth:1.5,fill:'#0d1420'}}},
      }, items:[{id:'in',group:'in'},{id:'out',group:'out'}],
    },
  }
}
function edgeMeta(relation: ConfigRelation) {
  return {
    id:relation.id, shape:'edge', source:{cell:relation.sourceId,port:'out'}, target:{cell:relation.targetId,port:'in'},
    data:{relationId:relation.id,kind:relation.kind},
    attrs:{line:{stroke:relation.kind==='provider-use'||relation.kind==='provider-proxy'?'#d99d53':relation.kind==='dialer'?'#66b7a3':'#849ab8',strokeWidth:1.8,strokeDasharray:relation.kind==='provider-use'?'6 4':relation.kind==='provider-proxy'?'2 4':relation.kind==='dialer'?'5 3':undefined,targetMarker:{name:'block',width:8,height:7}}},
    router:{name:'manhattan',args:{padding:18}}, connector:{name:'rounded',args:{radius:8}},
  }
}
function drawGraph(fitToView = false) {
  if (!graph) return
  graph.clearCells()
  graph.addNodes(model.value.entities.map(nodeMeta))
  graph.addEdges(model.value.relations.map(edgeMeta))
  nextTick(() => {
    if (fitToView && model.value.entities.length) graph?.zoomToFit({ padding: 64, maxScale: 1 })
    else graph?.centerContent()
  })
}
function autoLayout() {
  if (!graph) return
  if (!model.value.entities.length) {
    notify(tr('当前没有可排布的节点', 'There are no nodes to arrange'))
    return
  }

  const positions = computeAutoLayout(model.value.entities, model.value.relations)
  positions.forEach((position, id) => {
    const item = model.value.entities.find((entity) => entity.id === id)
    if (item) item.layout = { x: position.x, y: position.y }
    const node = graph?.getCellById(id)
    if (node?.isNode()) node.position(position.x, position.y, { silent: true })
  })

  graph.zoomToFit({ padding: 64, maxScale: 1 })
  notify(tr('已按配置依赖关系自动排布节点', 'Nodes arranged by configuration dependencies'))
}
function refreshNode(item: ConfigEntity) {
  const node = graph?.getCellById(item.id)
  if (!node || !node.isNode()) return
  node.attr('label/text', labelFor(item))
  node.attr('body/stroke', colorFor(item.kind).stroke)
  node.attr('body/fill', colorFor(item.kind).fill)
}
function selectEntity(id: string) {
  selectedId.value = id
  selectedRelationId.value = undefined
  const item = model.value.entities.find((e) => e.id === id)
  const reserved = new Set(['name','proxies','use','dialer-proxy','proxy'])
  advancedText.value = item ? JSON.stringify(Object.fromEntries(Object.entries(item.raw).filter(([key]) => !reserved.has(key))), null, 2) : '{}'
  advancedError.value = ''
}
function changed(message?: string) {
  // Computed validation runs against the same domain model as the graph.
  if (message) notify(message)
}
function add(kind: 'proxy'|'group'|'provider') {
  const item = createEntity(model.value, kind)
  graph?.addNode(nodeMeta(item))
  selectEntity(item.id)
  changed(`${kind} 已创建`)
}
function patchRaw(key: string, value: unknown) {
  const item = selected.value
  if (!item) return
  if (value === '' || value === undefined || value === null) delete item.raw[key]
  else item.raw[key] = value
  refreshNode(item)
}
function dependencyName(targetId: string, kind: 'dialer'|'provider-proxy') {
  const relation = model.value.relations.find((item) => item.targetId === targetId && item.kind === kind)
  const source = relation && model.value.entities.find((item) => item.id === relation.sourceId)
  if (source) return source.name
  const target = model.value.entities.find((item) => item.id === targetId)
  return kind === 'dialer' ? String(target?.raw['dialer-proxy'] ?? '') : String(target?.raw.proxy ?? '')
}
function setDependency(targetId: string, kind: 'dialer'|'provider-proxy', name: string) {
  const target = model.value.entities.find((item) => item.id === targetId)
  if (!target) return
  const oldRelations = model.value.relations.filter((item) => item.targetId === targetId && item.kind === kind)
  const property = kind === 'dialer' ? 'dialer-proxy' : 'proxy'
  if (!name) {
    model.value.relations = model.value.relations.filter((item) => !(item.targetId === targetId && item.kind === kind))
    delete target.raw[property]
    drawGraph()
    return
  }
  const source = model.value.entities.find((item) => item.name === name && item.kind === 'proxy')
  if (!source) return notify(`找不到代理：${name}`)
  if (oldRelations.some((relation) => relation.sourceId === source.id)) return
  model.value.relations = model.value.relations.filter((item) => !(item.targetId === targetId && item.kind === kind))
  const verdict = canConnect(model.value, source.id, targetId)
  if (!verdict.ok) {
    model.value.relations.push(...oldRelations)
    return notify(verdict.reason ?? '依赖关系无效')
  }
  connect(model.value, source.id, targetId)
  target.raw[property] = name
  drawGraph()
}

function rename(value: string) {
  const item = selected.value
  const name = value.trim()
  if (!item || !name) return
  if (model.value.entities.some((e) => e.id !== item.id && e.kind !== 'builtin' && e.name === name)) {
    notify(`名称「${name}」已经存在`)
    return
  }
  item.name = name
  if (item.kind === 'proxy' || item.kind === 'group') item.raw.name = name
  refreshNode(item)
}
function applyAdvanced() {
  const item = selected.value
  if (!item) return
  try {
    const value = JSON.parse(advancedText.value || '{}') as Record<string, unknown>
    for (const key of ['name','proxies','use','dialer-proxy','proxy']) if (key in value) throw new Error(`${key} 是编辑器管理字段，请在上方编辑`)
    const reserved = Object.fromEntries(Object.entries(item.raw).filter(([key]) => ['name','proxies','use','dialer-proxy','proxy'].includes(key)))
    item.raw = {...value,...reserved}
    if (item.kind === 'proxy' || item.kind === 'group') item.raw.name = item.name
    advancedError.value = ''
    refreshNode(item)
    notify('高级属性已应用')
  } catch (error) {
    advancedError.value = error instanceof Error ? error.message : 'JSON 格式错误'
  }
}
function toggleMember(groupId: string, childId: string) {
  const relation = model.value.relations.find((r) => r.targetId === groupId && r.sourceId === childId)
  if (relation) removeRelation(model.value, relation.id)
  else {
    const verdict = canConnect(model.value, childId, groupId)
    if (!verdict.ok) return notify(verdict.reason ?? '连接无效')
    connect(model.value, childId, groupId)
  }
  drawGraph()
}
function reorder(relationId: string, delta: -1|1) {
  const relation = model.value.relations.find((r) => r.id === relationId)
  if (!relation) return
  const peers = model.value.relations.filter((r) => r.targetId === relation.targetId && r.kind === relation.kind).sort((a,b)=>a.order-b.order)
  const index = peers.findIndex((r)=>r.id===relationId)
  const next = peers[index + delta]
  if (!next) return
  ;[relation.order,next.order] = [next.order,relation.order]
  drawGraph()
}
function resolveSelectedMissing(kind: 'proxy'|'group'|'provider') {
  if (!selected.value || selected.value.kind !== 'missing') return
  const item = selected.value
  const hasProviderUse = model.value.relations.some((relation) => relation.sourceId === item.id && relation.kind === 'provider-use')
  if (hasProviderUse && kind !== 'provider') return notify('该悬空引用来自 use 字段，必须解析为 Provider')
  if (!hasProviderUse && kind === 'provider') return notify('该悬空引用来自 proxies 字段，应解析为 Proxy 或 Group')
  resolveMissingEntity(model.value, item.id, kind)
  refreshNode(item)
  drawGraph()
  notify(`${item.name} 已解析为 ${kind}`)
}
function deleteSelected() {
  if (selectedRelationId.value) {
    removeRelation(model.value, selectedRelationId.value)
    selectedRelationId.value = undefined
    drawGraph(); return
  }
  const item = selected.value
  if (!item || item.kind === 'builtin') return
  removeEntity(model.value, item.id)
  selectedId.value = undefined
  drawGraph()
  notify(`${item.name} 已删除，相关引用已移除`)
}
function styleConnectedEdge(edge: any, relation: ConfigRelation) {
  const meta = edgeMeta(relation)
  edge.attr(meta.attrs)
  edge.setRouter(meta.router.name, meta.router.args)
  edge.setConnector(meta.connector.name, meta.connector.args)
  edge.setData(meta.data)
}
function onEdgeConnected(edge: any) {
  const sourceId = edge.getSourceCellId?.()
  const targetId = edge.getTargetCellId?.()
  if (!sourceId || !targetId) return
  const relationId = edge.getData?.()?.relationId as string | undefined
  const oldRelation = relationId ? model.value.relations.find((r) => r.id === relationId) : undefined
  const sameRelation = oldRelation && oldRelation.sourceId === sourceId && oldRelation.targetId === targetId
  if (sameRelation) return
  if (oldRelation) removeRelation(model.value, oldRelation.id)
  const existing = model.value.relations.find((r) => r.sourceId === sourceId && r.targetId === targetId)
  if (existing) return styleConnectedEdge(edge, existing)
  const verdict = canConnect(model.value, sourceId, targetId)
  if (!verdict.ok) { edge.remove(); drawGraph(); notify(verdict.reason ?? '连接无效'); return }
  const relation = connect(model.value, sourceId, targetId)
  styleConnectedEdge(edge, relation)
  notify('拓扑引用已更新')
}
function initGraph() {
  if (!graphHost.value) return
  graph = new Graph({
    container:graphHost.value, autoResize:true, background:{color:theme.value === 'light' ? '#f5f7fb' : '#0d1420'},
    grid:{visible:true,type:'dot',size:18,args:{color:theme.value === 'light' ? '#d8e0eb' : '#263449',thickness:1}},
    panning:{enabled:true,eventTypes:['mouseWheelDown']}, scaling:{min:.35,max:2.5}, mousewheel:{enabled:true,factor:1.15,minScale:.35,maxScale:2.5,zoomAtMousePosition:true},
    connecting:{
      snap:{radius:24},allowBlank:false,allowLoop:false,allowMulti:false,allowNode:false,allowEdge:false,allowPort:true,
      router:{name:'manhattan',args:{padding:18}},connector:{name:'rounded',args:{radius:8}},
      validateConnection:({sourceCell,targetCell,sourcePort,targetPort}: any) => Boolean(sourceCell && targetCell && sourcePort==='out' && targetPort==='in' && canConnect(model.value,sourceCell.id,targetCell.id).ok),
    },
  })
  graph.use(new Selection({enabled:true,multiple:false,rubberband:true,eventTypes:['leftMouseDown']}))
  graph.on('node:click',({node})=>selectEntity(node.id))
  graph.on('edge:click',({edge})=>{selectedId.value=undefined;selectedRelationId.value=edge.id})
  graph.on('blank:click',()=>{selectedId.value=undefined;selectedRelationId.value=undefined})
  graph.on('edge:connected',({edge})=>onEdgeConnected(edge))
  graph.on('node:change:position',({node})=>{
    const item=model.value.entities.find((e)=>e.id===node.id)
    if(item) item.layout={x:node.position().x,y:node.position().y}
  })
  drawGraph(true)
}
function resizeGraph() {
  if (graph && graphHost.value) graph.resize(graphHost.value.clientWidth,graphHost.value.clientHeight)
}
function download(text: string, filename: string) {
  const url=URL.createObjectURL(new Blob([text],{type:'text/yaml;charset=utf-8'}))
  const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;anchor.click();URL.revokeObjectURL(url)
  exportMenuOpen.value=false;notify('YAML 已导出')
}
function exportAll() { download(exportYaml(model.value),'clash-config-fragment.yaml') }
function exportSelected() {
  if(selected.value?.kind!=='group') return notify('请先选中一个策略组')
  download(exportYaml(model.value,selected.value.id),`${selected.value.name.replace(/[\\/:*?"<>|\s]+/g,'-')}-dependencies.yaml`)
}
function openImport() { importText.value=sampleYaml; importOpen.value=true }
async function readFile(event: Event) {
  const file=(event.target as HTMLInputElement).files?.[0]
  if(file) importText.value=await file.text()
}
function applyImport() {
  try {
    const parsed=importYaml(importText.value)
    model.value=parsed.model;selectedId.value=undefined;selectedRelationId.value=undefined
    drawGraph(true);importOpen.value=false
    notify(`导入完成：${proxies.value.length} proxies · ${groups.value.length} groups · ${providers.value.length} providers`)
  } catch(error) { notify(error instanceof Error?error.message:'YAML 解析失败') }
}
function openSource() { sourceText.value=exportYaml(model.value);sourceOpen.value=true }
function applySource() {
  try {
    const parsed=importYaml(sourceText.value)
    model.value=parsed.model;selectedId.value=undefined;selectedRelationId.value=undefined
    drawGraph(true);sourceOpen.value=false;notify('源码已同步到拓扑')
  } catch(error) { notify(error instanceof Error?error.message:'YAML 解析失败') }
}
function focusIssue(issue: ValidationIssue) {
  if (!issue.entityId) return
  selectEntity(issue.entityId)
  const cell = graph?.getCellById(issue.entityId)
  if (cell) graph?.centerCell(cell)
}
function parsePayload(event: Event) {
  const item=selected.value
  if(!item) return
  try { item.raw.payload=JSON.parse((event.target as HTMLTextAreaElement).value);notify('Payload 已更新') }
  catch { notify('Payload JSON 格式错误') }
}
watch(selectedId, (id) => {
  const item=model.value.entities.find((e)=>e.id===id)
  const reserved=new Set(['name','proxies','use','dialer-proxy','proxy'])
  advancedText.value=item?JSON.stringify(Object.fromEntries(Object.entries(item.raw).filter(([key])=>!reserved.has(key))),null,2):'{}'
  advancedError.value=''
})
watch(theme, async (value) => {
  window.localStorage.setItem('clash-topology-theme', value)
  graph?.dispose()
  graph = null
  await nextTick()
  initGraph()
})
watch(language, (value) => {
  window.localStorage.setItem('clash-topology-language', value)
  drawGraph()
})
onMounted(()=>{initGraph();window.addEventListener('resize',resizeGraph)})
onBeforeUnmount(()=>{window.removeEventListener('resize',resizeGraph);window.clearTimeout(noticeTimer);graph?.dispose();graph=null})
</script>

<template>
  <main class="app-shell" :class="{ 'theme-light': theme === 'light' }">
    <header class="topbar">
      <div class="brand-lockup">
        <div class="brand-mark"><i></i><i></i><i></i></div>
        <div><div class="brand-title">Clash Topology</div><div class="brand-subtitle">VISUAL CONFIG EDITOR</div></div>
      </div>
      <div class="topbar-actions">
        <button class="button button-quiet theme-toggle" @click="toggleTheme" :aria-label="theme === 'dark' ? tr('切换亮色主题','Switch to light theme') : tr('切换深色主题','Switch to dark theme')">{{ theme === 'dark' ? `☀ ${tr('亮色主题','Light')}` : `☾ ${tr('深色主题','Dark')}` }}</button>
        <button class="button button-quiet language-toggle" @click="toggleLanguage" :aria-label="tr('切换为英文','Switch to Chinese')">{{ language === 'zh' ? 'EN' : '中文' }}</button>
        <span class="engine-pill"><i></i> Mihomo · YAML Fragment</span>
        <button class="button button-quiet" @click="openImport">↑ {{ tr('导入 YAML','Import YAML') }}</button>
        <button class="button button-quiet" @click="openSource">{ } {{ tr('源码模式','Source') }}</button>
        <div class="export-wrap">
          <button class="button button-primary" @click="exportMenuOpen=!exportMenuOpen">↓ {{ tr('导出 YAML','Export YAML') }}</button>
          <div v-if="exportMenuOpen" class="export-menu">
            <button @click="exportAll">{{ tr('导出全部配置片段','Export all config fragments') }}</button>
            <button :disabled="selected?.kind!=='group'" @click="exportSelected">{{ tr('导出选中策略组及依赖','Export selected group and dependencies') }}</button>
          </div>
        </div>
      </div>
    </header>

    <section class="workspace">
      <aside class="left-panel panel">
        <div class="panel-heading"><div><div class="eyebrow">WORKSPACE</div><h2>{{ tr('配置资源','Resources') }}</h2></div><span class="count-chip">{{ proxies.length+groups.length+providers.length }}</span></div>
        <div class="create-actions">
          <button class="create-tile proxy-tile" @click="add('proxy')"><b>＋</b><span><strong>Proxy</strong><small>{{ tr('代理节点','Proxy node') }}</small></span></button>
          <button class="create-tile group-tile" @click="add('group')"><b>＋</b><span><strong>Group</strong><small>{{ tr('策略组','Proxy group') }}</small></span></button>
          <button class="create-tile provider-tile" @click="add('provider')"><b>＋</b><span><strong>Provider</strong><small>{{ tr('订阅提供者','Proxy provider') }}</small></span></button>
        </div>
        <div class="resource-list">
          <section class="resource-section">
            <div class="section-title"><i class="legend-dot proxy-dot"></i> PROXIES <span>{{ proxies.length }}</span></div>
            <button v-for="item in proxies" :key="item.id" class="resource-item" :class="{active:selectedId===item.id}" @click="selectEntity(item.id)"><i class="resource-icon proxy-icon">P</i><span>{{ item.name }}</span><small>{{ item.raw.type }}</small></button>
            <div v-if="!proxies.length" class="empty-list">{{ tr('还没有代理节点','No proxy nodes yet') }}</div>
          </section>
          <section class="resource-section">
            <div class="section-title"><i class="legend-dot group-dot"></i> PROXY GROUPS <span>{{ groups.length }}</span></div>
            <button v-for="item in groups" :key="item.id" class="resource-item" :class="{active:selectedId===item.id}" @click="selectEntity(item.id)"><i class="resource-icon group-icon">G</i><span>{{ item.name }}</span><small>{{ item.raw.type }}</small></button>
            <div v-if="!groups.length" class="empty-list">{{ tr('还没有策略组','No proxy groups yet') }}</div>
          </section>
          <section class="resource-section">
            <div class="section-title"><i class="legend-dot provider-dot"></i> PROVIDERS <span>{{ providers.length }}</span></div>
            <button v-for="item in providers" :key="item.id" class="resource-item" :class="{active:selectedId===item.id}" @click="selectEntity(item.id)"><i class="resource-icon provider-icon">D</i><span>{{ item.name }}</span><small>{{ item.raw.type }}</small></button>
            <div v-if="!providers.length" class="empty-list">{{ tr('还没有 Provider','No providers yet') }}</div>
          </section>
        </div>
        <div class="sidebar-foot"><i></i> {{ tr('本地编辑 · 未连接运行内核','Local editing · No core connection') }}</div>
      </aside>

      <section class="center-panel">
        <div class="canvas-toolbar">
          <div><div class="canvas-title">{{ tr('拓扑画布','Topology canvas') }}</div><div class="canvas-subtitle">{{ tr('从依赖节点拖线到引用它的 Group · Group 支持嵌套','Connect from a dependency to its referencing group · Nested groups supported') }}</div></div>
          <div class="canvas-tools">
            <span><i class="legend-dot proxy-dot"></i> Proxy</span><span><i class="legend-dot group-dot"></i> Group</span><span><i class="legend-dot provider-dot"></i> Provider</span>
            <button class="button button-quiet auto-layout-button" :title="tr('按依赖方向自动分层，减少连线交叉','Arrange nodes in dependency layers and reduce edge crossings')" @click="autoLayout">{{ tr('自动排布','Auto layout') }}</button>
            <button class="icon-button"  :title="tr('适应画布','Fit canvas')" @click="graph?.zoomToFit({padding:48,maxScale:1})">⌗</button>
            <button class="icon-button"  :title="tr('删除选中','Delete selection')" :disabled="!selected && !selectedRelation" @click="deleteSelected">⌫</button>
          </div>
        </div>
        <div class="canvas-area">
          <div ref="graphHost" class="graph-host"></div>
          <div class="canvas-hint"><kbd>{{ tr('拖线','Connect') }}</kbd> {{ tr('从依赖节点连到引用它的 Group','from a dependency to its referencing group') }} <span>·</span> {{ tr('滚轮缩放','Scroll to zoom') }} <span>·</span> {{ tr('按住鼠标中键拖动画布','Hold middle mouse to pan') }}</div>
          <div class="canvas-stats">{{ proxies.length }} proxies <i></i> {{ groups.length }} groups <i></i> {{ providers.length }} providers</div>
        </div>
        <div class="yaml-preview-panel">
          <div class="yaml-preview-head"><div><b><span>{ }</span> {{ tr('YAML 预览','YAML preview') }}</b><small>{{ tr('当前完整片段 · 实时序列化','Full fragment · Live serialization') }}</small></div><button class="text-button" @click="openSource">{{ tr('打开源码编辑器 ↗','Open source editor ↗') }}</button></div>
          <pre>{{ exportYaml(model) || (language === 'zh' ? '# 暂无配置' : '# No config yet') }}</pre>
        </div>
      </section>

      <aside class="right-panel panel">
        <div class="panel-heading"><div><div class="eyebrow">INSPECTOR</div><h2>{{ tr('属性编辑','Inspector') }}</h2></div><button v-if="selected && selected.kind!=='builtin'" class="delete-small" @click="deleteSelected">⌫</button></div>
        <template v-if="selected">
          <div class="selected-kind" :class="`${selected.kind}-kind`"><i></i>{{ selected.kind==='proxy'?'PROXY NODE':selected.kind==='group'?'PROXY GROUP':selected.kind==='provider'?'PROXY PROVIDER':selected.kind==='builtin'?'BUILT-IN':'UNRESOLVED REFERENCE' }}</div>
          <div class="inspector-scroll">
            <section class="form-section">
              <div class="form-section-title">{{ tr('基本信息','Basic information') }}</div>
              <label class="field-label">{{ tr('名称','Name') }}</label>
              <input class="text-input" :value="selected.name" :disabled="selected.kind==='builtin'||selected.kind==='missing'" @change="rename(($event.target as HTMLInputElement).value)" />

              <template v-if="selected.kind==='proxy'">
                <label class="field-label">{{ tr('协议类型','Protocol type') }}</label>
                <select class="text-input" :value="selected.raw.type" @change="patchRaw('type',($event.target as HTMLSelectElement).value)"><option v-for="type in mihomoProxyTypes" :key="type">{{ type }}</option></select>
                <div class="two-fields"><div><label class="field-label">{{ tr('服务器','Server') }}</label><input class="text-input" :value="selected.raw.server as string" placeholder="example.com" @change="patchRaw('server',($event.target as HTMLInputElement).value)" /></div><div><label class="field-label">{{ tr('端口','Port') }}</label><input class="text-input" type="number" :value="selected.raw.port as number" placeholder="443" @change="patchRaw('port',Number(($event.target as HTMLInputElement).value))" /></div></div>
                <label class="field-label">dialer-proxy</label><select class="text-input" :value="dependencyName(selected.id,'dialer')" @change="setDependency(selected.id,'dialer',($event.target as HTMLSelectElement).value)"><option value="">{{ tr('不使用','Disabled') }}</option><option v-for="proxy in proxies.filter(p=>p.id!==selected!.id)" :key="proxy.id" :value="proxy.name">{{ proxy.name }}</option></select><p class="field-doc-description">{{ tr('指定当前代理通过某个代理节点或策略组建立网络连接。','Route this proxy’s network connections through another proxy or proxy group.') }}</p>
              </template>
              <template v-else-if="selected.kind==='group'">
                <label class="field-label">{{ tr('策略类型','Group type') }}</label>
                <select class="text-input" :value="selected.raw.type" @change="patchRaw('type',($event.target as HTMLSelectElement).value)"><option v-for="type in ['select','url-test','fallback','load-balance','relay']" :key="type">{{ type }}</option></select>
              </template>
              <template v-else-if="selected.kind==='provider'">
                <label class="field-label">{{ tr('Provider 类型','Provider type') }}</label><select class="text-input" :value="selected.raw.type" @change="patchRaw('type',($event.target as HTMLSelectElement).value)"><option value="http">http</option><option value="file">file</option><option value="inline">inline</option></select>
                <label class="field-label">proxy</label><select class="text-input" :value="dependencyName(selected.id,'provider-proxy')" @change="setDependency(selected.id,'provider-proxy',($event.target as HTMLSelectElement).value)"><option value="">{{ tr('直连 / 不指定','Direct / Unspecified') }}</option><option v-for="proxy in proxies" :key="proxy.id" :value="proxy.name">{{ proxy.name }}</option></select><p class="field-doc-description">{{ tr('通过指定代理进行 Provider 下载或更新。','Download or update this provider through the specified proxy.') }}</p>
              </template>
              <div v-else-if="selected.kind==='missing'" class="missing-resolver"><p class="warning-copy">{{ tr('该引用在当前配置片段中没有对应实体。选择它在配置中的真实类型以创建占位定义。','This reference has no matching entity in the current fragment. Choose its actual config type to create a placeholder.') }}</p><button class="button button-secondary button-full" @click="resolveSelectedMissing('proxy')">{{ tr('解析为 Proxy','Resolve as Proxy') }}</button><button class="button button-secondary button-full" @click="resolveSelectedMissing('group')">{{ tr('解析为 Proxy Group','Resolve as Proxy Group') }}</button><button class="button button-secondary button-full" @click="resolveSelectedMissing('provider')">{{ tr('解析为 Provider','Resolve as Provider') }}</button></div>
              <p v-else class="muted-copy">{{ tr('内置代理由 Clash / Mihomo 内核提供，无需在片段中定义。','Built-in proxies are provided by the Clash / Mihomo core and do not need to be defined in this fragment.') }}</p>
            </section>

                         <section v-if="documentedFields.length" class="form-section mihomo-fields-section">
               <div class="form-section-head">
                 <div class="form-section-title">{{ tr('Mihomo 文档配置项','Mihomo documented fields') }}</div>
                 <a class="field-doc-link section-doc-link" :href="selected.kind==='proxy' ? mihomoProtocolDocsUrl(String(selected.raw.type ?? 'ss')) : selected.kind==='group' ? 'https://wiki.metacubex.one/config/proxy-groups/' : 'https://wiki.metacubex.one/config/proxy-providers/'" target="_blank" rel="noopener noreferrer">Mihomo Docs ↗</a>
               </div>
               <p class="muted-copy">{{ tr('字段名和 YAML 键保持 Mihomo 原生写法；说明来自官方文档。复杂对象可在此编辑 JSON。','Field names remain native Mihomo YAML keys. Descriptions are based on official docs; edit complex values as JSON.') }}</p>
               <div v-for="field in documentedFields" :key="field.key" class="documented-field">
                 <div class="documented-field-head">
                   <code>{{ field.key }}</code>
                   <span v-if="field.deprecated" class="deprecated-chip">{{ tr('已弃用','Deprecated') }}</span>
                   <a class="field-doc-link" :href="field.docs" target="_blank" rel="noopener noreferrer">{{ tr('文档','Docs') }} ↗</a>
                 </div>
                 <p class="field-doc-description">{{ language === 'zh' ? field.zh : field.en }}</p>
                 <label v-if="field.type==='boolean'" class="switch-row documented-switch"><span>{{ field.key }}</span><input type="checkbox" :checked="Boolean(getDocumentedField(field.key))" @change="updateDocumentedField(field,($event.target as HTMLInputElement).checked)" /><i></i></label>
                 <textarea v-else-if="field.type==='json'" class="text-input textarea-small documented-json" :value="documentedFieldText(field)" :placeholder="field.key==='payload' ? '[...]' : '{ ... } / [ ... ]'" spellcheck="false" @change="updateDocumentedJsonField(field,($event.target as HTMLTextAreaElement).value)" />
                 <input v-else class="text-input" :type="field.type==='number'?'number':'text'" :value="String(getDocumentedField(field.key) ?? '')" :placeholder="field.key" @change="updateDocumentedField(field,($event.target as HTMLInputElement).value)" />
               </div>
             </section>

<template v-if="selected.kind==='group'">
              <section class="form-section relation-section">
                <div class="form-section-head"><div class="form-section-title">{{ tr('策略组成员','Group members') }} <small>{{ selectedMembers.length }}</small></div><em>proxies</em></div><p class="field-doc-description">{{ tr('引用出站代理或其他策略组。','References outbound proxies or other proxy groups.') }}</p>
                <div v-if="selectedMembers.length" class="member-list">
                  <div v-for="(entry,index) in selectedMembers" :key="entry.relation.id" class="member-row">
                    <i class="member-dot" :class="`${entry.entity.kind}-dot`"></i><span>{{ entry.entity.name }}</span><small>{{ entry.entity.kind==='group'?'GROUP':entry.entity.kind==='builtin'?'BUILT-IN':'PROXY' }}</small>
                    <button :disabled="index===0" @click="reorder(entry.relation.id,-1)">↑</button><button :disabled="index===selectedMembers.length-1" @click="reorder(entry.relation.id,1)">↓</button><button class="remove-member" @click="toggleMember(selected!.id,entry.entity.id)">×</button>
                  </div>
                </div><div v-else class="empty-members">{{ tr('暂无成员，请从下方勾选或在画布连线','No members yet. Select below or connect nodes on the canvas.') }}</div>
                <div class="member-picker">
                  <label v-for="item in [...proxies,...groups.filter(g=>g.id!==selected!.id),...model.entities.filter(e=>e.kind==='builtin')]" :key="item.id"><input type="checkbox" :checked="model.relations.some(r=>r.sourceId===item.id&&r.targetId===selected!.id&&r.kind==='member')" @change="toggleMember(selected!.id,item.id)" /><span>{{ item.name }}</span><small>{{ item.kind.toUpperCase() }}</small></label>
                </div>
              </section>
              <section class="form-section relation-section">
                <div class="form-section-head"><div class="form-section-title">{{ tr('Provider 引用','Provider references') }} <small>{{ selectedProviders.length }}</small></div><em>use</em></div><p class="field-doc-description">{{ tr('引用代理集合（proxy-providers）。','References proxy providers.') }}</p>
                <div v-for="entry in selectedProviders" :key="entry.relation.id" class="member-row"><i class="member-dot provider-dot"></i><span>{{ entry.entity.name }}</span><small>PROVIDER</small><button class="remove-member" @click="toggleMember(selected!.id,entry.entity.id)">×</button></div>
                <div class="member-picker"><label v-for="item in providers" :key="item.id"><input type="checkbox" :checked="model.relations.some(r=>r.sourceId===item.id&&r.targetId===selected!.id&&r.kind==='provider-use')" @change="toggleMember(selected!.id,item.id)" /><span>{{ item.name }}</span><small>PROVIDER</small></label><div v-if="!providers.length" class="empty-members">{{ tr('暂无 Provider','No providers yet') }}</div></div>
              </section>
            </template>

            <section v-if="selected.kind==='proxy'||selected.kind==='group'||selected.kind==='provider'" class="form-section advanced-section">
              <div class="form-section-head"><div class="form-section-title">{{ tr('高级 / 未知字段','Advanced / unknown fields') }}</div><em>JSON</em></div>
              <p class="muted-copy">{{ tr('不认识的属性会保留。不能在这里修改 name、proxies、use 关系字段。','Unknown properties are preserved. name, proxies, and use relationship fields cannot be edited here.') }}</p>
              <textarea v-model="advancedText" class="code-editor" spellcheck="false"></textarea>
              <div v-if="advancedError" class="inline-error">{{ advancedError }}</div>
              <button class="button button-secondary button-full" @click="applyAdvanced">{{ tr('应用高级属性','Apply advanced fields') }}</button>
            </section>
          </div>
        </template>
        <template v-else-if="selectedRelation">
          <div class="selected-kind relation-kind"><i></i> REFERENCE EDGE</div>
          <section class="form-section"><div class="form-section-title">{{ tr('引用关系','Reference') }}</div><div class="relation-summary"><b>{{ model.entities.find(e=>e.id===selectedRelation!.sourceId)?.name }}</b><span>→</span><b>{{ model.entities.find(e=>e.id===selectedRelation!.targetId)?.name }}</b></div><p class="muted-copy">{{ selectedRelation!.kind==='provider-use' ? tr('Provider 通过策略组 use 字段引入。','Provider is referenced through the group use field.') : tr('代理或子策略组通过父策略组 proxies 字段引用。','A proxy or nested group is referenced through the parent group proxies field.') }}</p><button class="button button-danger button-full" @click="deleteSelected">{{ tr('删除这条引用','Delete this reference') }}</button></section>
        </template>
        <div v-else class="inspector-empty"><div class="empty-illustration"><i></i><b></b><span>◇</span></div><h3>{{ tr('选择一个节点','Select a node') }}</h3><p>{{ tr('点击拓扑节点或左侧资源，查看并编辑 Clash 配置属性。','Select a topology node or a resource on the left to inspect and edit its Clash configuration.') }}</p><div class="empty-tip">{{ tr('从节点右侧端口拖线到策略组左侧端口，可以建立引用关系。','Drag from a node’s right port to a group’s left port to create a reference.') }}</div></div>

        <div class="validation-panel">
          <div class="validation-head"><b>{{ tr('配置检查','Validation') }}</b><span><i>{{ errors }} {{ tr('错误','errors') }}</i><em>{{ warnings }} {{ tr('警告','warnings') }}</em></span></div>
          <div v-if="displayedIssues.length" class="issue-list"><button v-for="(issue,index) in displayedIssues.slice(0,5)" :key="`${issue.entityId}-${index}`" class="issue-item" @click="focusIssue(issue)"><i :class="issue.level"></i><span>{{ issue.message }}</span><small>↗</small></button></div>
          <div v-else class="all-valid">✓ {{ tr('当前未发现明显问题','No obvious issues found') }}</div>
        </div>
      </aside>
    </section>

    <footer class="statusbar"><span><i></i>{{ displayedNotice }}</span><small>{{ errors }} {{ tr('个错误','errors') }} · {{ warnings }} {{ tr('个警告','warnings') }} <b>·</b> AntV X6 3.x <b>·</b> {{ model.engine }}</small></footer>

    <div v-if="importOpen" class="modal-backdrop" @click.self="importOpen=false">
      <section class="modal">
        <div class="modal-head"><div><div class="eyebrow">YAML IMPORT</div><h2>{{ tr('导入 Clash 配置片段','Import Clash fragment') }}</h2></div><button class="close-button" @click="importOpen=false">×</button></div>
        <p>{{ tr('粘贴 YAML 或选择文件。导入后将替换画布中的 proxies、proxy-groups 和 proxy-providers。','Paste YAML or choose a file. Import replaces proxies, proxy-groups, and proxy-providers in the canvas.') }}</p>
        <div class="file-row"><input ref="fileInput" type="file" accept=".yaml,.yml,text/yaml,text/plain" @change="readFile" /><button class="button button-secondary" @click="fileInput?.click()">{{ tr('选择 YAML 文件','Choose YAML file') }}</button><small>{{ tr('支持 .yaml / .yml','Supports .yaml / .yml') }}</small></div>
        <textarea v-model="importText" class="large-code-editor" spellcheck="false" :placeholder="tr('粘贴配置片段...','Paste a config fragment...')" />
        <div class="modal-foot"><small>{{ tr('只处理三个核心配置片段；其他顶层配置不会导出。','Only the three core sections are handled; other top-level settings are not exported.') }}</small><div><button class="button button-quiet" @click="importOpen=false">{{ tr('取消','Cancel') }}</button><button class="button button-primary" @click="applyImport">{{ tr('解析并导入','Parse and import') }}</button></div></div>
      </section>
    </div>
    <div v-if="sourceOpen" class="modal-backdrop" @click.self="sourceOpen=false">
      <section class="modal source-modal">
        <div class="modal-head"><div><div class="eyebrow">SOURCE MODE</div><h2>{{ tr('YAML 源码编辑','Edit YAML source') }}</h2></div><button class="close-button" @click="sourceOpen=false">×</button></div>
        <p>{{ tr('修改 YAML 后点击应用，编辑器会重新解析并重建拓扑。解析失败时当前画布不会被替换。','Edit YAML and apply it to rebuild the topology. If parsing fails, the current canvas remains unchanged.') }}</p>
        <textarea v-model="sourceText" class="large-code-editor source-editor" spellcheck="false"></textarea>
        <div class="modal-foot"><small>{{ tr('未知字段会保留；注释与原始排版不保证逐字节保留。','Unknown fields are preserved; comments and original formatting are not preserved byte-for-byte.') }}</small><div><button class="button button-quiet" @click="sourceOpen=false">{{ tr('取消','Cancel') }}</button><button class="button button-primary" @click="applySource">{{ tr('应用到拓扑','Apply to topology') }}</button></div></div>
      </section>
    </div>
  </main>
</template>
