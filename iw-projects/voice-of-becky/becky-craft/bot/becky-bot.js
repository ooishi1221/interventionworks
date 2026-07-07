// becky-bot.js — ベッキーの Minecraft 身体。HTTP で行動プリミティブを提供する。
const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const express = require('express')

const bot = mineflayer.createBot({
  host: '127.0.0.1',
  port: 25565,
  username: 'Becky',
  version: '1.21.4',
})
bot.loadPlugin(pathfinder)

bot.on('error', (e) => console.error('[bot] error:', e.message))
bot.on('kicked', (r) => console.error('[bot] kicked:', r))
bot.on('end', (r) => { console.error('[bot] disconnected:', r); process.exit(1) })

let ready = false
bot.once('spawn', () => {
  ready = true
  console.log('[bot] spawned at', bot.entity.position)
  bot.pathfinder.setMovements(new Movements(bot))
  // 一人称視点 viewer
  const { mineflayer: mineflayerViewer } = require('prismarine-viewer')
  mineflayerViewer(bot, { port: 3007, firstPerson: true })
  console.log('[bot] viewer on http://localhost:3007')
})

// ---- 観測 ----
function observe() {
  const p = bot.entity.position
  // 周囲16ブロックの主要ブロック種を集計（毎ブロック走査は重いので8刻みサンプリング+findBlocks）
  const interesting = ['oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'acacia_log', 'dark_oak_log',
    'stone', 'dirt', 'grass_block', 'sand', 'water', 'lava', 'coal_ore', 'iron_ore']
  const nearby = {}
  for (const name of interesting) {
    const blockType = bot.registry.blocksByName[name]
    if (!blockType) continue
    const found = bot.findBlocks({ matching: blockType.id, maxDistance: 24, count: 3 })
    if (found.length > 0) {
      const nearest = found[0]
      nearby[name] = { count: found.length, nearest: { x: nearest.x, y: nearest.y, z: nearest.z }, distance: Math.round(nearest.distanceTo(p)) }
    }
  }
  const entities = Object.values(bot.entities)
    .filter(e => e !== bot.entity && e.position.distanceTo(p) < 24)
    .slice(0, 10)
    .map(e => ({ name: e.name || e.username || e.type, distance: Math.round(e.position.distanceTo(p)) }))
  const timeOfDay = bot.time.timeOfDay
  return {
    position: { x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z) },
    health: bot.health,
    food: bot.food,
    time: timeOfDay < 12000 ? `昼 (${timeOfDay})` : `夜 (${timeOfDay})`,
    nearby_blocks: nearby,
    nearby_entities: entities,
    inventory: bot.inventory.items().map(i => `${i.name}x${i.count}`),
  }
}

// ---- 行動プリミティブ ----
const actions = {
  async look_around() {
    return observe()
  },
  async move_to({ x, z }) {
    bot.pathfinder.setGoal(new goals.GoalNearXZ(x, z, 2))
    await waitGoal(15000)
    return { done: true, position: observe().position }
  },
  async explore({ direction = 'north' } = {}) {
    const d = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] }[direction] || [0, -1]
    const p = bot.entity.position
    bot.pathfinder.setGoal(new goals.GoalNearXZ(p.x + d[0] * 20, p.z + d[1] * 20, 3))
    await waitGoal(15000)
    return { done: true, position: observe().position }
  },
  async dig_nearest({ blockName }) {
    const blockType = bot.registry.blocksByName[blockName]
    if (!blockType) return { error: `unknown block: ${blockName}` }
    const block = bot.findBlock({ matching: blockType.id, maxDistance: 32 })
    if (!block) return { error: `no ${blockName} within 32 blocks` }
    bot.pathfinder.setGoal(new goals.GoalLookAtBlock(block.position, bot.world))
    await waitGoal(20000)
    const b = bot.blockAt(block.position)
    if (!b || b.name !== blockName) return { error: 'block gone before dig' }
    await bot.dig(b)
    return { done: true, dug: blockName, at: block.position }
  },
  async attack_nearest() {
    const target = bot.nearestEntity(e => e.type === 'hostile' || e.type === 'animal' || e.type === 'mob')
    if (!target) return { error: 'no entity nearby' }
    await bot.pathfinder.goto(new goals.GoalFollow(target, 2)).catch(() => {})
    bot.attack(target)
    return { done: true, attacked: target.name }
  },
  async chat({ text }) {
    bot.chat(text)
    return { done: true }
  },
  async stop() {
    bot.pathfinder.setGoal(null)
    return { done: true }
  },
}

function waitGoal(timeoutMs) {
  // pathfinder のゴール到達 or タイムアウトを待つ。失敗しても throw しない（brainが次を判断する）
  return new Promise((resolve) => {
    const timer = setTimeout(() => { cleanup(); bot.pathfinder.setGoal(null); resolve() }, timeoutMs)
    const done = () => { cleanup(); resolve() }
    const cleanup = () => {
      clearTimeout(timer)
      bot.removeListener('goal_reached', done)
      bot.removeListener('path_stop', done)
    }
    bot.on('goal_reached', done)
    bot.on('path_stop', done)
  })
}

// ---- HTTP API ----
const app = express()
app.use(express.json())

app.get('/observe', (req, res) => {
  if (!ready) return res.status(503).json({ error: 'bot not spawned yet' })
  res.json(observe())
})

app.post('/action', async (req, res) => {
  if (!ready) return res.status(503).json({ error: 'bot not spawned yet' })
  const { type, args = {} } = req.body || {}
  const fn = actions[type]
  if (!fn) return res.status(400).json({ error: `unknown action: ${type}`, available: Object.keys(actions) })
  try {
    const result = await fn(args)
    res.json(result)
  } catch (e) {
    res.json({ error: e.message })
  }
})

app.listen(3008, () => console.log('[bot] action API on http://localhost:3008'))
