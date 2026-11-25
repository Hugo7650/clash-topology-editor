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
const NODE_GAP_Y = 28
const COMPONENT_GAP_Y = 28
const LANE_GAP_X = 92
const RANK_GAP_X = 156
const MAX_ROWS_PER_LANE = 6
const MARGIN_X = 64
const MARGIN_Y = 56

const kindOrder: Record<EntityKind, number> = {
  proxy: 0,
  provider: 1,
  group: 2,
  missing: 3,
  builtin: 4,
}

/**
 * Lay out the dependency graph from left to right.
 *
 * Edges point from a dependency to the entity that references it. Strongly
 * connected components are collapsed before ranking, so malformed cyclic
 * references are kept together instead of causing an infinite layout loop.
 */
export function computeAutoLayout(
  entities: ConfigEntity[],
  relations: ConfigRelation[],
): Map<string, LayoutPosition> {
  if (entities.length === 0) return new Map()

  const entityById = new Map(entities.map((entity) => [entity.id, entity]))
  const adjacency = new Map<string, Set<string>>()
  entities.forEach((entity) => adjacency.set(entity.id, new Set()))

  relations.forEach((relation) => {
    if (entityById.has(relation.sourceId) && entityById.has(relation.targetId)) {
      adjacency.get(relation.sourceId)!.add(relation.targetId)
    }
  })

  // Tarjan's algorithm: collapse cycles into strongly connected components.
  let nextIndex = 0
  const indexById = new Map<string, number>()
  const lowLinkById = new Map<string, number>()
  const stack: string[] = []
  const onStack = new Set<string>()
  const components: LayoutComponent[] = []
  const componentByNode = new Map<string, number>()

  const visit = (id: string) => {
    indexById.set(id, nextIndex)
    lowLinkById.set(id, nextIndex)
    nextIndex += 1
    stack.push(id)
    onStack.add(id)

    for (const targetId of adjacency.get(id) ?? []) {
      if (!indexById.has(targetId)) {
        visit(targetId)
        lowLinkById.set(id, Math.min(lowLinkById.get(id)!, lowLinkById.get(targetId)!))
      } else if (onStack.has(targetId)) {
        lowLinkById.set(id, Math.min(lowLinkById.get(id)!, indexById.get(targetId)!))
      }
    }

    if (lowLinkById.get(id) !== indexById.get(id)) return

    const componentId = components.length
    const nodeIds: string[] = []
    let memberId = ''
    do {
      memberId = stack.pop()!
      onStack.delete(memberId)
      nodeIds.push(memberId)
      componentByNode.set(memberId, componentId)
    } while (memberId !== id)

    nodeIds.sort((left, right) => {
      const a = entityById.get(left)!
      const b = entityById.get(right)!
      return kindOrder[a.kind] - kindOrder[b.kind] || a.order - b.order || a.name.localeCompare(b.name)
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

  entities.forEach((entity) => {
    if (!indexById.has(entity.id)) visit(entity.id)
  })

  // Build the acyclic condensation graph.
  relations.forEach((relation) => {
    const source = componentByNode.get(relation.sourceId)
    const target = componentByNode.get(relation.targetId)
    if (source === undefined || target === undefined || source === target) return
    components[source].outgoing.add(target)
    components[target].incoming.add(source)
  })

  // Topological longest-path ranking.
  const indegree = components.map((component) => component.incoming.size)
  const queue = components.filter((component) => indegree[component.id] === 0).map((component) => component.id)
  const topologicalOrder: number[] = []

  while (queue.length) {
    const componentId = queue.shift()!
    topologicalOrder.push(componentId)
    const component = components[componentId]
    for (const targetId of component.outgoing) {
      components[targetId].rank = Math.max(components[targetId].rank, component.rank + 1)
      indegree[targetId] -= 1
      if (indegree[targetId] === 0) queue.push(targetId)
    }
  }

  // A condensation graph is always acyclic; this is a defensive fallback.
  if (topologicalOrder.length !== components.length) {
    components.forEach((component) => { component.rank = 0 })
  }

  const maxRank = Math.max(0, ...components.map((component) => component.rank))
  const layers = Array.from({ length: maxRank + 1 }, () => [] as number[])

  components.forEach((component) => layers[component.rank].push(component.id))

  // Preserve existing vertical neighborhoods as a stable starting order.
  const existingY = (componentId: number) => {
    const values = components[componentId].nodeIds.map((id) => entityById.get(id)!.layout.y)
    return values.reduce((sum, value) => sum + value, 0) / values.length
  }
  layers.forEach((layer) => layer.sort((a, b) => existingY(a) - existingY(b) || a - b))

  // Barycenter sweeps reorder each layer to reduce edge crossings.
  const normalizedPosition = new Map<number, number>()
  const updatePositions = () => {
    layers.forEach((layer) => {
      layer.forEach((componentId, index) => {
        normalizedPosition.set(componentId, (index + 0.5) / Math.max(1, layer.length))
      })
    })
  }
  const reorderLayer = (rank: number, neighbors: (component: LayoutComponent) => Set<number>) => {
    const layer = layers[rank]
    const oldIndex = new Map(layer.map((componentId, index) => [componentId, index]))
    const score = new Map<number, number>()

    layer.forEach((componentId) => {
      const connected = [...neighbors(components[componentId])]
        .map((neighborId) => normalizedPosition.get(neighborId))
        .filter((value): value is number => value !== undefined)
      if (connected.length) score.set(componentId, connected.reduce((sum, value) => sum + value, 0) / connected.length)
    })

    layer.sort((a, b) => {
      const scoreA = score.get(a)
      const scoreB = score.get(b)
      if (scoreA !== undefined && scoreB !== undefined) return scoreA - scoreB || oldIndex.get(a)! - oldIndex.get(b)!
      if (scoreA !== undefined) return -1
      if (scoreB !== undefined) return 1
      return oldIndex.get(a)! - oldIndex.get(b)!
    })
    updatePositions()
  }

  updatePositions()
  for (let sweep = 0; sweep < 6; sweep += 1) {
    for (let rank = 1; rank <= maxRank; rank += 1) {
      reorderLayer(rank, (component) => component.incoming)
    }
    for (let rank = maxRank - 1; rank >= 0; rank -= 1) {
      reorderLayer(rank, (component) => component.outgoing)
    }
  }

  // A single tall stack makes medium-sized graphs unreadable after zoom-to-fit.
  // Wrap each dependency rank into compact vertical lanes while keeping every
  // lane of an earlier rank to the left of every lane in the next rank.
  const maxLaneHeight = MAX_ROWS_PER_LANE * NODE_HEIGHT + (MAX_ROWS_PER_LANE - 1) * NODE_GAP_Y
  const packedLayers = layers.map((layer) => {
    const lanes: Array<{ componentIds: number[]; height: number }> = []
    let current: number[] = []
    let currentHeight = 0

    layer.forEach((componentId) => {
      const componentHeight = components[componentId].height
      const addedHeight = componentHeight + (current.length ? COMPONENT_GAP_Y : 0)

      if (current.length && currentHeight + addedHeight > maxLaneHeight) {
        lanes.push({ componentIds: current, height: currentHeight })
        current = []
        currentHeight = 0
      }

      if (current.length) currentHeight += COMPONENT_GAP_Y
      current.push(componentId)
      currentHeight += componentHeight
    })

    if (current.length) lanes.push({ componentIds: current, height: currentHeight })
    return lanes
  })

  const tallestLane = Math.max(0, ...packedLayers.flatMap((lanes) => lanes.map((lane) => lane.height)))
  const positions = new Map<string, LayoutPosition>()
  let rankX = MARGIN_X

  packedLayers.forEach((lanes) => {
    lanes.forEach((lane, laneIndex) => {
      let y = MARGIN_Y + (tallestLane - lane.height) / 2
      const x = rankX + laneIndex * (NODE_WIDTH + LANE_GAP_X)

      lane.componentIds.forEach((componentId) => {
        const component = components[componentId]
        component.nodeIds.forEach((nodeId, index) => {
          positions.set(nodeId, {
            x,
            y: y + index * (NODE_HEIGHT + NODE_GAP_Y),
          })
        })
        y += component.height + COMPONENT_GAP_Y
      })
    })

    const rankWidth = lanes.length * NODE_WIDTH + Math.max(0, lanes.length - 1) * LANE_GAP_X
    rankX += rankWidth + RANK_GAP_X
  })

  // Built-ins are not standalone configuration definitions. Keep each one
  // close to the group(s) that reference it instead of ordering it by the
  // very large placeholder Y coordinate assigned during YAML import.
  const builtins = entities
    .filter((entity) => entity.kind === 'builtin')
    .sort((a, b) => a.name.localeCompare(b.name))
  const groupById = new Map(entities.filter((entity) => entity.kind === 'group').map((entity) => [entity.id, entity]))
  const placed = new Map([...positions].filter(([id]) => entityById.get(id)?.kind !== 'builtin'))

  const overlaps = (x: number, y: number) => {
    for (const [id, otherPosition] of placed) {
      const other = entityById.get(id)
      if (!other) continue
      const horizontalOverlap = x < otherPosition.x + NODE_WIDTH + LANE_GAP_X / 2 &&
        x + NODE_WIDTH + LANE_GAP_X / 2 > otherPosition.x
      const verticalOverlap = y < otherPosition.y + NODE_HEIGHT + NODE_GAP_Y / 2 &&
        y + NODE_HEIGHT + NODE_GAP_Y / 2 > otherPosition.y
      if (horizontalOverlap && verticalOverlap) return true
    }
    return false
  }

  builtins.forEach((builtin, index) => {
    const referencedGroups = relations
      .filter((relation) => relation.sourceId === builtin.id && relation.kind === 'member')
      .map((relation) => groupById.get(relation.targetId))
      .filter((group): group is ConfigEntity => Boolean(group))
    const targetPositions = referencedGroups
      .map((group) => positions.get(group.id))
      .filter((position): position is LayoutPosition => Boolean(position))

    let x: number
    let anchorY: number
    if (targetPositions.length) {
      x = Math.max(MARGIN_X, Math.min(...targetPositions.map((position) => position.x)) - NODE_WIDTH - LANE_GAP_X)
      anchorY = targetPositions.reduce((sum, position) => sum + position.y + NODE_HEIGHT / 2, 0) / targetPositions.length
        - NODE_HEIGHT / 2
    } else {
      const maxX = Math.max(MARGIN_X, ...[...positions.values()].map((position) => position.x))
      x = maxX + NODE_WIDTH + LANE_GAP_X
      anchorY = MARGIN_Y + index * (NODE_HEIGHT + NODE_GAP_Y)
    }

    // Search outward from the referenced group's vertical center until a free
    // slot is found. This also keeps DIRECT and PASS separate when they share
    // a parent group.
    let y = anchorY
    const step = NODE_HEIGHT + NODE_GAP_Y
    for (let attempt = 1; overlaps(x, y) && attempt < 200; attempt += 1) {
      const distance = Math.ceil(attempt / 2) * step
      y = anchorY + (attempt % 2 === 1 ? distance : -distance)
    }

    const position = { x, y }
    positions.set(builtin.id, position)
    placed.set(builtin.id, position)
  })

  return positions
}
