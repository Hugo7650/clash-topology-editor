<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Graph, Selection } from '@antv/x6'
import {
  canConnect, connect, createDemoModel, createEntity, exportYaml, importYaml,
  removeEntity, removeRelation, resolveMissingEntity, validateModel,
  type ClashModel, type ConfigEntity, type ConfigRelation, type EntityKind, type ValidationIssue,
} from './core/model'

const model = ref<ClashModel>(createDemoModel())
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
const errors = computed(() => issues.value.filter((item) => item.level === 'error').length)
const warnings = computed(() => issues.value.filter((item) => item.level === 'warning').length)
const memberRelations = computed(() => selected.value?.kind === 'group'
  ? model.value.relations.filter((r) => r.targetId === selected.value!.id && r.kind === 'member').sort((a,b) => a.order-b.order)
  : [])
const providerRelations = computed(() => selected.value?.kind === 'group'
  ? model.value.relations.filter((r) => r.targetId === selected.value!.id && r.kind === 'provider-use').sort((a,b) => a.order-b.order)
  : [])
const selectedMembers = computed(() => memberRelations.value.map((r) => ({ relation: r, entity: model.value.entities.find((e) => e.id === r.sourceId) })).filter((x): x is {relation: ConfigRelation; entity: ConfigEntity} => Boolean(x.entity)))
const selectedProviders = computed(() => providerRelations.value.map((r) => ({ relation: r, entity: model.value.entities.find((e) => e.id === r.sourceId) })).filter((x): x is {relation: ConfigRelation; entity: ConfigEntity} => Boolean(x.entity)))
const protocolFields = computed(() => {
  const type = String(selected.value?.raw.type ?? 'ss')
  const fields: Record<string, string[]> = {
    ss: ['cipher','password'], vmess: ['uuid','alterId','cipher','tls','servername','network'],
    vless: ['uuid','flow','tls','servername','network'], trojan: ['password','sni','alpn','network'],
    hysteria2: ['password','sni','obfs','obfs-password','up','down'],
    tuic: ['uuid','password','congestion-controller','udp-relay-mode','sni'],
    socks5: ['username','password','tls','udp'], http: ['username','password','tls'],
    wireguard: ['ip','private-key','public-key','mtu'],
  }
  return fields[type] ?? []
})

const sampleYaml = `proxies:\n  - name: HK-01\n    type: ss\n    server: hk.example.com\n    port: 443\n    cipher: aes-128-gcm\n    password: change-me\n  - name: JP-01\n    type: vless\n    server: jp.example.com\n    port: 443\n    uuid: 00000000-0000-4000-8000-000000000000\n    tls: true\nproxy-providers:\n  provider-hk:\n    type: http\n    url: https://example.com/hk.yaml\n    path: ./providers/hk.yaml\n    interval: 3600\n  provider-jp:\n    type: file\n    path: ./providers/jp.yaml\nproxy-groups:\n  - name: 默认出口\n    type: select\n    proxies: [节点选择, DIRECT]\n  - name: 节点选择\n    type: select\n    proxies: [香港自动选择, 日本自动选择]\n  - name: 香港自动选择\n    type: url-test\n    url: https://www.gstatic.com/generate_204\n    interval: 300\n    proxies: [HK-01]\n    use: [provider-hk]\n  - name: 日本自动选择\n    type: url-test\n    url: https://www.gstatic.com/generate_204\n    interval: 300\n    proxies: [JP-01]\n    use: [provider-jp]\n`

function notify(message: string) {
  notice.value = message
  window.clearTimeout(noticeTimer)
  noticeTimer = window.setTimeout(() => (notice.value = '就绪'), 2500)
}
function colorFor(kind: EntityKind) {
  const colors: Record<EntityKind, {stroke: string; fill: string}> = {
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
    : item.kind === 'builtin' ? '内置出口' : '未解析引用'
  const suffix = item.kind === 'group'
    ? `${model.value.relations.filter((r) => r.targetId === item.id).length} 个关联`
    : item.kind === 'proxy' ? String(item.raw.server ?? '')
    : item.kind === 'provider' ? '动态节点池' : ''
  return `${item.name}\n${type}${suffix ? ` · ${suffix}` : ''}`
}
function nodeMeta(item: ConfigEntity) {
  const color = colorFor(item.kind)
  return {
    id: item.id, shape:'rect', x:item.layout.x, y:item.layout.y,
    width:item.kind === 'group' ? 224 : 206, height:82,
    attrs:{
      body:{rx:12,ry:12,fill:color.fill,stroke:color.stroke,strokeWidth:1.6,strokeDasharray:item.kind==='missing'?'5 4':undefined},
      label:{text:labelFor(item),fill:'#eff5fc',fontSize:12,fontWeight:600,lineHeight:19,textWrap:{width:-22,height:-14,ellipsis:true}},
    },
    data:{entityId:item.id,kind:item.kind},
    ports:{
      groups:{
        in:{position:'left',attrs:{circle:{r:5,magnet:true,stroke:color.stroke,strokeWidth:1.5,fill:'#0d1420'}}},
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
function drawGraph() {
  if (!graph) return
  graph.clearCells()
  graph.addNodes(model.value.entities.map(nodeMeta))
  graph.addEdges(model.value.relations.map(edgeMeta))
  nextTick(() => graph?.centerContent())
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
    container:graphHost.value, autoResize:true, background:{color:'#0d1420'},
    grid:{visible:true,type:'dot',size:18,args:{color:'#263449',thickness:1}},
    panning:{enabled:true,modifiers:'space'}, scaling:{min:.4,max:1.8}, mousewheel:{enabled:true,modifiers:['ctrl','meta']},
    connecting:{
      snap:{radius:24},allowBlank:false,allowLoop:false,allowMulti:false,allowNode:false,allowEdge:false,allowPort:true,
      router:{name:'manhattan',args:{padding:18}},connector:{name:'rounded',args:{radius:8}},
      validateConnection:({sourceCell,targetCell,sourcePort,targetPort}: any) => Boolean(sourceCell && targetCell && sourcePort==='out' && targetPort==='in' && canConnect(model.value,sourceCell.id,targetCell.id).ok),
    },
  })
  graph.use(new Selection({enabled:true,multiple:false,rubberband:true}))
  graph.on('node:click',({node})=>selectEntity(node.id))
  graph.on('edge:click',({edge})=>{selectedId.value=undefined;selectedRelationId.value=edge.id})
  graph.on('blank:click',()=>{selectedId.value=undefined;selectedRelationId.value=undefined})
  graph.on('edge:connected',({edge})=>onEdgeConnected(edge))
  graph.on('node:change:position',({node})=>{
    const item=model.value.entities.find((e)=>e.id===node.id)
    if(item) item.layout={x:node.position().x,y:node.position().y}
  })
  drawGraph()
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
    drawGraph();importOpen.value=false
    notify(`导入完成：${proxies.value.length} proxies · ${groups.value.length} groups · ${providers.value.length} providers`)
  } catch(error) { notify(error instanceof Error?error.message:'YAML 解析失败') }
}
function openSource() { sourceText.value=exportYaml(model.value);sourceOpen.value=true }
function applySource() {
  try {
    const parsed=importYaml(sourceText.value)
    model.value=parsed.model;selectedId.value=undefined;selectedRelationId.value=undefined
    drawGraph();sourceOpen.value=false;notify('源码已同步到拓扑')
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
onMounted(()=>{initGraph();window.addEventListener('resize',resizeGraph)})
onBeforeUnmount(()=>{window.removeEventListener('resize',resizeGraph);window.clearTimeout(noticeTimer);graph?.dispose();graph=null})
</script>

<template>
  <main class="app-shell">
    <header class="topbar">
      <div class="brand-lockup">
        <div class="brand-mark"><i></i><i></i><i></i></div>
        <div><div class="brand-title">Clash Topology</div><div class="brand-subtitle">VISUAL CONFIG EDITOR</div></div>
      </div>
      <div class="topbar-actions">
        <span class="engine-pill"><i></i> Mihomo · YAML Fragment</span>
        <button class="button button-quiet" @click="openImport">↑ 导入 YAML</button>
        <button class="button button-quiet" @click="openSource">{ } 源码模式</button>
        <div class="export-wrap">
          <button class="button button-primary" @click="exportMenuOpen=!exportMenuOpen">↓ 导出 YAML</button>
          <div v-if="exportMenuOpen" class="export-menu">
            <button @click="exportAll">导出全部配置片段</button>
            <button :disabled="selected?.kind!=='group'" @click="exportSelected">导出选中策略组及依赖</button>
          </div>
        </div>
      </div>
    </header>

    <section class="workspace">
      <aside class="left-panel panel">
        <div class="panel-heading"><div><div class="eyebrow">WORKSPACE</div><h2>配置资源</h2></div><span class="count-chip">{{ proxies.length+groups.length+providers.length }}</span></div>
        <div class="create-actions">
          <button class="create-tile proxy-tile" @click="add('proxy')"><b>＋</b><span><strong>Proxy</strong><small>代理节点</small></span></button>
          <button class="create-tile group-tile" @click="add('group')"><b>＋</b><span><strong>Group</strong><small>策略组</small></span></button>
          <button class="create-tile provider-tile" @click="add('provider')"><b>＋</b><span><strong>Provider</strong><small>订阅提供者</small></span></button>
        </div>
        <div class="resource-list">
          <section class="resource-section">
            <div class="section-title"><i class="legend-dot proxy-dot"></i> PROXIES <span>{{ proxies.length }}</span></div>
            <button v-for="item in proxies" :key="item.id" class="resource-item" :class="{active:selectedId===item.id}" @click="selectEntity(item.id)"><i class="resource-icon proxy-icon">P</i><span>{{ item.name }}</span><small>{{ item.raw.type }}</small></button>
            <div v-if="!proxies.length" class="empty-list">还没有代理节点</div>
          </section>
          <section class="resource-section">
            <div class="section-title"><i class="legend-dot group-dot"></i> PROXY GROUPS <span>{{ groups.length }}</span></div>
            <button v-for="item in groups" :key="item.id" class="resource-item" :class="{active:selectedId===item.id}" @click="selectEntity(item.id)"><i class="resource-icon group-icon">G</i><span>{{ item.name }}</span><small>{{ item.raw.type }}</small></button>
            <div v-if="!groups.length" class="empty-list">还没有策略组</div>
          </section>
          <section class="resource-section">
            <div class="section-title"><i class="legend-dot provider-dot"></i> PROVIDERS <span>{{ providers.length }}</span></div>
            <button v-for="item in providers" :key="item.id" class="resource-item" :class="{active:selectedId===item.id}" @click="selectEntity(item.id)"><i class="resource-icon provider-icon">D</i><span>{{ item.name }}</span><small>{{ item.raw.type }}</small></button>
            <div v-if="!providers.length" class="empty-list">还没有 Provider</div>
          </section>
        </div>
        <div class="sidebar-foot"><i></i> 本地编辑 · 未连接运行内核</div>
      </aside>

      <section class="center-panel">
        <div class="canvas-toolbar">
          <div><div class="canvas-title">拓扑画布</div><div class="canvas-subtitle">从依赖节点拖线到引用它的 Group · Group 支持嵌套</div></div>
          <div class="canvas-tools">
            <span><i class="legend-dot proxy-dot"></i> Proxy</span><span><i class="legend-dot group-dot"></i> Group</span><span><i class="legend-dot provider-dot"></i> Provider</span>
            <button class="icon-button" title="适应画布" @click="graph?.zoomToFit({padding:48,maxScale:1})">⌗</button>
            <button class="icon-button" title="删除选中" :disabled="!selected && !selectedRelation" @click="deleteSelected">⌫</button>
          </div>
        </div>
        <div class="canvas-area">
          <div ref="graphHost" class="graph-host"></div>
          <div class="canvas-hint"><kbd>拖线</kbd> 从依赖节点连到引用它的 Group <span>·</span> Ctrl / ⌘ + 滚轮缩放 <span>·</span> Space + 拖动平移</div>
          <div class="canvas-stats">{{ proxies.length }} proxies <i></i> {{ groups.length }} groups <i></i> {{ providers.length }} providers</div>
        </div>
        <div class="yaml-preview-panel">
          <div class="yaml-preview-head"><div><b><span>{ }</span> YAML 预览</b><small>当前完整片段 · 实时序列化</small></div><button class="text-button" @click="openSource">打开源码编辑器 ↗</button></div>
          <pre>{{ exportYaml(model) || '# 暂无配置' }}</pre>
        </div>
      </section>

      <aside class="right-panel panel">
        <div class="panel-heading"><div><div class="eyebrow">INSPECTOR</div><h2>属性编辑</h2></div><button v-if="selected && selected.kind!=='builtin'" class="delete-small" @click="deleteSelected">⌫</button></div>
        <template v-if="selected">
          <div class="selected-kind" :class="`${selected.kind}-kind`"><i></i>{{ selected.kind==='proxy'?'PROXY NODE':selected.kind==='group'?'PROXY GROUP':selected.kind==='provider'?'PROXY PROVIDER':selected.kind==='builtin'?'BUILT-IN':'UNRESOLVED REFERENCE' }}</div>
          <div class="inspector-scroll">
            <section class="form-section">
              <div class="form-section-title">基本信息</div>
              <label class="field-label">名称</label>
              <input class="text-input" :value="selected.name" :disabled="selected.kind==='builtin'||selected.kind==='missing'" @change="rename(($event.target as HTMLInputElement).value)" />

              <template v-if="selected.kind==='proxy'">
                <label class="field-label">协议类型</label>
                <select class="text-input" :value="selected.raw.type" @change="patchRaw('type',($event.target as HTMLSelectElement).value)"><option v-for="type in ['ss','vmess','vless','trojan','hysteria2','tuic','socks5','http','wireguard','snell','ssh']" :key="type">{{ type }}</option></select>
                <div class="two-fields"><div><label class="field-label">服务器</label><input class="text-input" :value="selected.raw.server as string" placeholder="example.com" @change="patchRaw('server',($event.target as HTMLInputElement).value)" /></div><div><label class="field-label">端口</label><input class="text-input" type="number" :value="selected.raw.port as number" placeholder="443" @change="patchRaw('port',Number(($event.target as HTMLInputElement).value))" /></div></div>
                <label class="field-label">拨号代理（dialer-proxy）</label><select class="text-input" :value="dependencyName(selected.id,'dialer')" @change="setDependency(selected.id,'dialer',($event.target as HTMLSelectElement).value)"><option value="">不使用</option><option v-for="proxy in proxies.filter(p=>p.id!==selected!.id)" :key="proxy.id" :value="proxy.name">{{ proxy.name }}</option></select>
                <template v-for="field in protocolFields" :key="field">
                  <label class="field-label">{{ field }}</label>
                  <label v-if="['tls','udp','tfo','mptcp'].includes(field)" class="switch-row"><span>{{ field }}</span><input type="checkbox" :checked="Boolean(selected.raw[field])" @change="patchRaw(field,($event.target as HTMLInputElement).checked)" /><i></i></label>
                  <input v-else class="text-input" :type="['alterId','up','down','mtu'].includes(field)?'number':'text'" :value="selected.raw[field] as string|number" :placeholder="field" @change="patchRaw(field,['alterId','up','down','mtu'].includes(field)?Number(($event.target as HTMLInputElement).value):($event.target as HTMLInputElement).value)" />
                </template>
              </template>

              <template v-else-if="selected.kind==='group'">
                <label class="field-label">策略类型</label>
                <select class="text-input" :value="selected.raw.type" @change="patchRaw('type',($event.target as HTMLSelectElement).value)"><option v-for="type in ['select','url-test','fallback','load-balance','relay']" :key="type">{{ type }}</option></select>
                <template v-if="['url-test','fallback','load-balance'].includes(String(selected.raw.type))">
                  <label class="field-label">测速 URL</label><input class="text-input" :value="selected.raw.url as string" placeholder="https://www.gstatic.com/generate_204" @change="patchRaw('url',($event.target as HTMLInputElement).value)" />
                  <div class="two-fields"><div><label class="field-label">Interval</label><input class="text-input" type="number" :value="selected.raw.interval as number" @change="patchRaw('interval',Number(($event.target as HTMLInputElement).value))" /></div><div v-if="selected.raw.type==='url-test'"><label class="field-label">Tolerance</label><input class="text-input" type="number" :value="selected.raw.tolerance as number" @change="patchRaw('tolerance',Number(($event.target as HTMLInputElement).value))" /></div></div>
                </template>
                <template v-if="selected.raw.type==='load-balance'"><label class="field-label">Strategy</label><select class="text-input" :value="selected.raw.strategy??'consistent-hashing'" @change="patchRaw('strategy',($event.target as HTMLSelectElement).value)"><option>consistent-hashing</option><option>round-robin</option><option>sticky-sessions</option></select></template>
                <div class="switch-list"><label v-for="field in ['lazy','include-all','include-all-proxies','include-all-providers','hidden']" :key="field" class="switch-row"><span>{{ field }}</span><input type="checkbox" :checked="Boolean(selected.raw[field])" @change="patchRaw(field,($event.target as HTMLInputElement).checked)" /><i></i></label></div>
                <template v-if="selected.raw['include-all']||selected.raw['include-all-proxies']||selected.raw['include-all-providers']"><label class="field-label">Filter</label><input class="text-input" :value="selected.raw.filter as string" @change="patchRaw('filter',($event.target as HTMLInputElement).value)" /><label class="field-label">Exclude Filter</label><input class="text-input" :value="selected.raw['exclude-filter'] as string" @change="patchRaw('exclude-filter',($event.target as HTMLInputElement).value)" /></template>
              </template>

              <template v-else-if="selected.kind==='provider'">
                <label class="field-label">Provider 类型</label><select class="text-input" :value="selected.raw.type" @change="patchRaw('type',($event.target as HTMLSelectElement).value)"><option value="http">http</option><option value="file">file</option><option value="inline">inline</option></select>
                <label class="field-label">下载代理（proxy）</label><select class="text-input" :value="dependencyName(selected.id,'provider-proxy')" @change="setDependency(selected.id,'provider-proxy',($event.target as HTMLSelectElement).value)"><option value="">直连 / 不指定</option><option v-for="proxy in proxies" :key="proxy.id" :value="proxy.name">{{ proxy.name }}</option></select>
                <template v-if="selected.raw.type==='http'"><label class="field-label">订阅 URL</label><input class="text-input" :value="selected.raw.url as string" placeholder="https://example.com/sub.yaml" @change="patchRaw('url',($event.target as HTMLInputElement).value)" /><label class="field-label">本地 Path</label><input class="text-input" :value="selected.raw.path as string" placeholder="./providers/name.yaml" @change="patchRaw('path',($event.target as HTMLInputElement).value)" /><label class="field-label">更新间隔（秒）</label><input class="text-input" type="number" :value="selected.raw.interval as number" @change="patchRaw('interval',Number(($event.target as HTMLInputElement).value))" /></template>
                <template v-else-if="selected.raw.type==='file'"><label class="field-label">本地 Path</label><input class="text-input" :value="selected.raw.path as string" @change="patchRaw('path',($event.target as HTMLInputElement).value)" /></template>
                <template v-else><label class="field-label">Inline Payload（JSON）</label><textarea class="text-input textarea-small" :value="JSON.stringify(selected.raw.payload??[],null,2)" @change="parsePayload" /></template>
              </template>
              <div v-else-if="selected.kind==='missing'" class="missing-resolver"><p class="warning-copy">该引用在当前配置片段中没有对应实体。选择它在配置中的真实类型以创建占位定义。</p><button class="button button-secondary button-full" @click="resolveSelectedMissing('proxy')">解析为 Proxy</button><button class="button button-secondary button-full" @click="resolveSelectedMissing('group')">解析为 Proxy Group</button><button class="button button-secondary button-full" @click="resolveSelectedMissing('provider')">解析为 Provider</button></div>
              <p v-else class="muted-copy">内置代理由 Clash / Mihomo 内核提供，无需在片段中定义。</p>
            </section>

            <template v-if="selected.kind==='group'">
              <section class="form-section relation-section">
                <div class="form-section-head"><div class="form-section-title">策略组成员 <small>{{ selectedMembers.length }}</small></div><em>proxies</em></div>
                <div v-if="selectedMembers.length" class="member-list">
                  <div v-for="(entry,index) in selectedMembers" :key="entry.relation.id" class="member-row">
                    <i class="member-dot" :class="`${entry.entity.kind}-dot`"></i><span>{{ entry.entity.name }}</span><small>{{ entry.entity.kind==='group'?'GROUP':entry.entity.kind==='builtin'?'BUILT-IN':'PROXY' }}</small>
                    <button :disabled="index===0" @click="reorder(entry.relation.id,-1)">↑</button><button :disabled="index===selectedMembers.length-1" @click="reorder(entry.relation.id,1)">↓</button><button class="remove-member" @click="toggleMember(selected!.id,entry.entity.id)">×</button>
                  </div>
                </div><div v-else class="empty-members">暂无成员，请从下方勾选或在画布连线</div>
                <div class="member-picker">
                  <label v-for="item in [...proxies,...groups.filter(g=>g.id!==selected!.id),...model.entities.filter(e=>e.kind==='builtin')]" :key="item.id"><input type="checkbox" :checked="model.relations.some(r=>r.sourceId===item.id&&r.targetId===selected!.id&&r.kind==='member')" @change="toggleMember(selected!.id,item.id)" /><span>{{ item.name }}</span><small>{{ item.kind.toUpperCase() }}</small></label>
                </div>
              </section>
              <section class="form-section relation-section">
                <div class="form-section-head"><div class="form-section-title">Provider 引用 <small>{{ selectedProviders.length }}</small></div><em>use</em></div>
                <div v-for="entry in selectedProviders" :key="entry.relation.id" class="member-row"><i class="member-dot provider-dot"></i><span>{{ entry.entity.name }}</span><small>PROVIDER</small><button class="remove-member" @click="toggleMember(selected!.id,entry.entity.id)">×</button></div>
                <div class="member-picker"><label v-for="item in providers" :key="item.id"><input type="checkbox" :checked="model.relations.some(r=>r.sourceId===item.id&&r.targetId===selected!.id&&r.kind==='provider-use')" @change="toggleMember(selected!.id,item.id)" /><span>{{ item.name }}</span><small>PROVIDER</small></label><div v-if="!providers.length" class="empty-members">暂无 Provider</div></div>
              </section>
            </template>

            <section v-if="selected.kind==='proxy'||selected.kind==='group'||selected.kind==='provider'" class="form-section advanced-section">
              <div class="form-section-head"><div class="form-section-title">高级 / 未知字段</div><em>JSON</em></div>
              <p class="muted-copy">不认识的属性会保留。不能在这里修改 name、proxies、use 关系字段。</p>
              <textarea v-model="advancedText" class="code-editor" spellcheck="false"></textarea>
              <div v-if="advancedError" class="inline-error">{{ advancedError }}</div>
              <button class="button button-secondary button-full" @click="applyAdvanced">应用高级属性</button>
            </section>
          </div>
        </template>
        <template v-else-if="selectedRelation">
          <div class="selected-kind relation-kind"><i></i> REFERENCE EDGE</div>
          <section class="form-section"><div class="form-section-title">引用关系</div><div class="relation-summary"><b>{{ model.entities.find(e=>e.id===selectedRelation!.sourceId)?.name }}</b><span>→</span><b>{{ model.entities.find(e=>e.id===selectedRelation!.targetId)?.name }}</b></div><p class="muted-copy">{{ selectedRelation.kind==='provider-use'?'Provider 通过策略组 use 字段引入。':'代理或子策略组通过父策略组 proxies 字段引用。' }}</p><button class="button button-danger button-full" @click="deleteSelected">删除这条引用</button></section>
        </template>
        <div v-else class="inspector-empty"><div class="empty-illustration"><i></i><b></b><span>◇</span></div><h3>选择一个节点</h3><p>点击拓扑节点或左侧资源，查看并编辑 Clash 配置属性。</p><div class="empty-tip">从节点右侧端口拖线到策略组左侧端口，可以建立引用关系。</div></div>

        <div class="validation-panel">
          <div class="validation-head"><b>配置检查</b><span><i>{{ errors }} 错误</i><em>{{ warnings }} 警告</em></span></div>
          <div v-if="issues.length" class="issue-list"><button v-for="(issue,index) in issues.slice(0,5)" :key="`${issue.entityId}-${index}`" class="issue-item" @click="focusIssue(issue)"><i :class="issue.level"></i><span>{{ issue.message }}</span><small>↗</small></button></div>
          <div v-else class="all-valid">✓ 当前未发现明显问题</div>
        </div>
      </aside>
    </section>

    <footer class="statusbar"><span><i></i>{{ notice }}</span><small>{{ errors }} errors · {{ warnings }} warnings <b>·</b> AntV X6 3.x <b>·</b> {{ model.engine }}</small></footer>

    <div v-if="importOpen" class="modal-backdrop" @click.self="importOpen=false">
      <section class="modal">
        <div class="modal-head"><div><div class="eyebrow">YAML IMPORT</div><h2>导入 Clash 配置片段</h2></div><button class="close-button" @click="importOpen=false">×</button></div>
        <p>粘贴 YAML 或选择文件。导入后将替换画布中的 proxies、proxy-groups 和 proxy-providers。</p>
        <div class="file-row"><input ref="fileInput" type="file" accept=".yaml,.yml,text/yaml,text/plain" @change="readFile" /><button class="button button-secondary" @click="fileInput?.click()">选择 YAML 文件</button><small>支持 .yaml / .yml</small></div>
        <textarea v-model="importText" class="large-code-editor" spellcheck="false" placeholder="粘贴配置片段..." />
        <div class="modal-foot"><small>只处理三个核心配置片段；其他顶层配置不会导出。</small><div><button class="button button-quiet" @click="importOpen=false">取消</button><button class="button button-primary" @click="applyImport">解析并导入</button></div></div>
      </section>
    </div>
    <div v-if="sourceOpen" class="modal-backdrop" @click.self="sourceOpen=false">
      <section class="modal source-modal">
        <div class="modal-head"><div><div class="eyebrow">SOURCE MODE</div><h2>YAML 源码编辑</h2></div><button class="close-button" @click="sourceOpen=false">×</button></div>
        <p>修改 YAML 后点击应用，编辑器会重新解析并重建拓扑。解析失败时当前画布不会被替换。</p>
        <textarea v-model="sourceText" class="large-code-editor source-editor" spellcheck="false"></textarea>
        <div class="modal-foot"><small>未知字段会保留；注释与原始排版不保证逐字节保留。</small><div><button class="button button-quiet" @click="sourceOpen=false">取消</button><button class="button button-primary" @click="applySource">应用到拓扑</button></div></div>
      </section>
    </div>
  </main>
</template>
