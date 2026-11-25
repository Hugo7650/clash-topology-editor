import type { ConfigEntity, ConfigRelation, EntityKind, LayoutPosition } from './model'

interface LayoutComponent {
  id: number
  nodeIds: string[]
  incoming: Set<number>
  outgoing: Set<number>
  rank: number
  height: number
}

const NODE_WIDTH = 244
const NODE_HEIGHT = 90
const NODE_GAP_Y = 30
const COMPONENT_GAP_Y = 28
const COLUMN_GAP_X = 76
const RANK_GAP_X = 150
const MARGIN_X = 72
const MARGIN_Y = 64

const kindOrder: Record<EntityKind, number> = {
  proxy: 0,
  provider: 1,
  builtin: 2,
  missing: 3,
  group: 4,
}

/**
 * Build a deterministic layered layout for the complete configuration graph.
 *
 * Every entity (including built-ins and unresolved references) participates in
 * the same graph. Cycles are collapsed into SCC blocks, ranked as a DAG, then
 * each rank is packed into a compact grid. This avoids special-case placement
 * that can overlap regular nodes or leave built-ins outside the fitted bounds.
 */
export function computeAutoLayout(
  entities: ConfigEntity[],
  relations: ConfigRelation[],
): Map<string, LayoutPosition> {
  if (!entities.length) return new Map()

  const entityById = new Map(entities.map((entity) => [entity.id, entity]))
  const adjacency = new Map<string, Set<string>>()
  entities.forEach((entity) => adjacency.set(entity.id, new Set()))

  relations.forEach(({ sourceId, targetId }) => {
    if (sourceId !== targetId && entityById.has(sourceId) && entityById.has(targetId)) {
      adjacency.get(sourceId)!.add(targetId)
    }
  })

  // Tarjan SCC: malformed cycles become one indivisible layout block.
  let nextIndex = 0
  const indexById = new Map<string, number>()
  const lowById = new Map<string, number>()
  const stack: string[] = []
  const onStack = new Set<string>()
  const components: LayoutComponent[] = []
  const componentByNode = new Map<string, number>()

  const visit = (nodeId: string): void => {
    indexById.set(nodeId, nextIndex)
    lowById.set(nodeId, nextIndex)
    nextIndex += 1
    stack.push(nodeId)
    onStack.add(nodeId)

    for (const targetId of adjacency.get(nodeId) ?? []) {
      if (!indexById.has(targetId)) {
        visit(targetId)
        lowById.set(nodeId, Math.min(lowById.get(nodeId)!, lowById.get(targetId)!))
      } else if (onStack.has(targetId)) {
        lowById.set(nodeId, Math.min(lowById.get(nodeId)!, indexById.get(targetId)!))
      }
    }

    if (lowById.get(nodeId) !== indexById.get(nodeId)) return

    const componentId = components.length
    const nodeIds: string[] = []
    let current = ''
    do {
      current = stack.pop()!
      onStack.delete(current)
      nodeIds.push(current)
      componentByNode.set(current, componentId)
    } while (current !== nodeId)

    nodeIds.sort((left, right) => {
      const a = entityById.get(left)!
      const b = entityById.get(right)!
      return kindOrder[a.kind] - kindOrder[b.kind] ||
        a.order - b.order ||
        a.name.localeCompare(b.name)
    })

    components.push({
      id: componentId,
      nodeIds,
      incoming: new Set(),
      outgoing: new Set(),
      rank: 0,
      height: nodeIds.length * NODE_HEIGHT + Math.max(0, nodeIds.length - 1) * NODE_GAP_Y,
    })
  }

  entities.forEach(({ id }) => {
    if (!indexById.has(id)) visit(id)
  })

  // Condense SCCs into a DAG. Sets remove duplicate edges between components.
  components.forEach((component) => {
    component.nodeIds.forEach((nodeId) => {
      for (const targetId of adjacency.get(nodeId) ?? []) {
        const targetComponent = componentByNode.get(targetId)!
        if (targetComponent === component.id) continue
        component.outgoing.add(targetComponent)
        components[targetComponent].incoming.add(component.id)
      }
    })
  })

  // Longest-path layering guarantees every dependency is left of its consumer.
  const indegree = components.map((component) => component.incoming.size)
  const queue = components
    .filter((component) => indegree[component.id] === 0)
    .map((component) => component.id)
  const topologicalOrder: number[] = []

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const componentId = queue[cursor]
    topologicalOrder.push(componentId)
    const component = components[componentId]
    for (const targetId of component.outgoing) {
      components[targetId].rank = Math.max(components[targetId].rank, component.rank + 1)
      indegree[targetId] -= 1
      if (indegree[targetId] === 0) queue.push(targetId)
    }
  }

  // Defensive fallback; the SCC condensation should always be acyclic.
  if (topologicalOrder.length !== components.length) {
    components.forEach((component) => { component.rank = 0 })
  }

  const maxRank = Math.max(0, ...components.map((component) => component.rank))
  const layers = Array.from({ length: maxRank + 1 }, () => [] as number[])
  components.forEach((component) => layers[component.rank].push(component.id))

  // Stable seed order; do not use imported canvas coordinates as layout input.
  layers.forEach((layer) => {
    layer.sort((a, b) => {
      const left = components[a].nodeIds[0]
      const right = components[b].nodeIds[0]
      const x = entityById.get(left)!
      const y = entityById.get(right)!
      return x.order - y.order || x.name.localeCompare(y.name)
    })
  })

  const orderIndex = new Map<number, number>()
  const refreshOrder = () => {
    layers.forEach((layer) => layer.forEach((id, index) => orderIndex.set(id, index)))
  }
  const sweep = (rank: number, neighborSet: (component: LayoutComponent) => Set<number>) => {
    const layer = layers[rank]
    const oldOrder = new Map(layer.map((id, index) => [id, index]))
    const barycenter = new Map<number, number>()

    layer.forEach((id) => {
      const neighbors = [...neighborSet(components[id])]
        .map((neighbor) => orderIndex.get(neighbor))
        .filter((value): value is number => value !== undefined)
      if (neighbors.length) {
        barycenter.set(id, neighbors.reduce((sum, value) => sum + value, 0) / neighbors.length)
      }
    })

    layer.sort((a, b) => {
      const left = barycenter.get(a)
      const right = barycenter.get(b)
      if (left !== undefined && right !== undefined) return left - right || oldOrder.get(a)! - oldOrder.get(b)!
      if (left !== undefined) return -1
      if (right !== undefined) return 1
      return oldOrder.get(a)! - oldOrder.get(b)!
    })
    refreshOrder()
  }

  refreshOrder()
  for (let pass = 0; pass < 8; pass += 1) {
    for (let rank = 1; rank <= maxRank; rank += 1) {
      sweep(rank, (component) => component.incoming)
    }
    for (let rank = maxRank - 1; rank >= 0; rank -= 1) {
      sweep(rank, (component) => component.outgoing)
    }
  }

  // Pack each rank into a balanced grid. Row heights account for SCC blocks,
  // so no two components can occupy the same rectangle.
  const positions = new Map<string, LayoutPosition>()
  let rankX = MARGIN_X

  layers.forEach((layer) => {
    const rowCount = Math.min(
      layer.length,
      Math.max(1, Math.ceil(Math.sqrt(layer.length * 1.35))),
    )
    const columnCount = Math.ceil(layer.length / rowCount)
    const rowHeights = Array.from({ length: rowCount }, (_, row) => {
      let height = 0
      for (let column = 0; column < columnCount; column += 1) {
        const componentId = layer[column * rowCount + row]
        if (componentId !== undefined) height = Math.max(height, components[componentId].height)
      }
      return height
    })
    const rowOffsets: number[] = []
    let totalHeight = 0
    rowHeights.forEach((height, row) => {
      rowOffsets[row] = totalHeight
      totalHeight += height + (row < rowCount - 1 ? COMPONENT_GAP_Y : 0)
    })

    layer.forEach((componentId, index) => {
      const column = Math.floor(index / rowCount)
      const row = index % rowCount
      const component = components[componentId]
      const x = rankX + column * (NODE_WIDTH + COLUMN_GAP_X)
      const y = MARGIN_Y + rowOffsets[row] + (rowHeights[row] - component.height) / 2

      component.nodeIds.forEach((nodeId, memberIndex) => {
        positions.set(nodeId, {
          x,
          y: y + memberIndex * (NODE_HEIGHT + NODE_GAP_Y),
        })
      })
    })

    rankX += columnCount * NODE_WIDTH + Math.max(0, columnCount - 1) * COLUMN_GAP_X + RANK_GAP_X
  })

  return positions
}
