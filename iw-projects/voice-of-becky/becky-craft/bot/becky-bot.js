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
  // viewer（FIRST_PERSON=1 で一人称。デフォルトは三人称=画角の虚無対策、2026-07-07）
  const { mineflayer: mineflayerViewer } = require('prismarine-viewer')
  mineflayerViewer(bot, { port: 3007, firstPerson: process.env.FIRST_PERSON === '1' })
  console.log('[bot] viewer on http://localhost:3007')
})

// ---- 視線演出（思考中のキョロキョロ + 作業後の水平リセット）----
let gazeTimer = null
function gazeScanStart() {
  if (gazeTimer) return
  gazeTimer = setInterval(() => {
    // 現在の向きから ±40° ランダムに首を振る（考えてるっぽい仕草）
    const yaw = bot.entity.yaw + (Math.random() - 0.5) * 1.4
    bot.look(yaw, (Math.random() - 0.5) * 0.3, false).catch(() => {})
  }, 1100)
}
function gazeScanStop() {
  if (gazeTimer) { clearInterval(gazeTimer); gazeTimer = null }
}
async function lookHorizon() {
  // ドアップの壁から解放: 視線を水平に戻す
  await bot.look(bot.entity.yaw, 0, false).catch(() => {})
}

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
    // 適切な道具を自動装備（素手で石を掘るとドロップしない、EP.002 準備で実測）
    const tool = bot.pathfinder.bestHarvestTool(b)
    if (tool) await bot.equip(tool, 'hand')
    await bot.dig(b)
    // ドロップ回収: 掘った場所まで歩く（近接自動ピックアップ）。EP.001 でインベントリが空だった根本対策
    bot.pathfinder.setGoal(new goals.GoalBlock(block.position.x, block.position.y, block.position.z))
    await waitGoal(8000)
    await new Promise(r => setTimeout(r, 600))
    await lookHorizon()  // 掘り跡の壁ドアップから解放
    return { done: true, dug: blockName, at: block.position, inventory: bot.inventory.items().map(i => `${i.name}x${i.count}`) }
  },
  async craft({ item }) {
    const itemType = bot.registry.itemsByName[item]
    if (!itemType) return { error: `unknown item: ${item}` }
    const inv = () => bot.inventory.items().map(i => `${i.name}x${i.count}`)
    const countOf = () => bot.inventory.count(itemType.id, null)
    const sleep = (ms) => new Promise(r => setTimeout(r, ms))
    const tableId = bot.registry.blocksByName.crafting_table.id
    let table = bot.findBlock({ matching: tableId, maxDistance: 16 })
    let recipes = bot.recipesFor(itemType.id, null, 1, table)
    if (recipes.length === 0 && !table) {
      // 作業台必須レシピかも → 手持ちの作業台を足元近くに置いて再試行
      const placed = await placeTableNearby()
      if (!placed.error) {
        table = bot.findBlock({ matching: tableId, maxDistance: 8 })
        recipes = bot.recipesFor(itemType.id, null, 1, table)
      }
    }
    if (recipes.length === 0) {
      return { error: `craft不可: ${item}（素材不足 or 作業台なし）`, inventory: inv() }
    }
    const recipe = recipes[0]
    if (recipe.requiresTable && table) {
      await bot.pathfinder.goto(new goals.GoalNear(table.position.x, table.position.y, table.position.z, 2)).catch(() => {})
    }
    const before = countOf()
    try {
      await bot.craft(recipe, 1, table || undefined)
    } catch (e) { /* fallback で拾う */ }
    await sleep(1200)  // craft 直後はインベントリ同期が遅れる（実測）
    if (countOf() > before) return { done: true, crafted: item, inventory: inv() }
    // mineflayer 4.37 は 1.21.4 の作業台クラフトが無言で失敗する（実測）
    // → レシピの材料消費と成果物をコマンドで等価実行（素材検証は recipesFor 通過済み）
    for (const d of recipe.delta) {
      if (d.count < 0) {
        bot.chat(`/clear Becky ${bot.registry.items[d.id].name} ${-d.count}`)
        await sleep(150)
      }
    }
    bot.chat(`/give Becky ${item} ${recipe.result.count}`)
    await sleep(800)
    if (countOf() <= before) return { error: `craft失敗: ${item}（fallbackも不発）`, inventory: inv() }
    await lookHorizon()  // クラフト後は顔を上げる
    return { done: true, crafted: item, inventory: inv() }
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

async function placeTableNearby() {
  const { Vec3 } = require('vec3')
  const tableItem = bot.inventory.items().find(i => i.name === 'crafting_table')
  if (!tableItem) return { error: 'no crafting_table in inventory' }
  await bot.equip(tableItem, 'hand')
  const p = bot.entity.position.floored()
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [2, 0], [0, 2]]) {
    const ref = bot.blockAt(p.offset(dx, -1, dz))
    const above = bot.blockAt(p.offset(dx, 0, dz))
    if (ref && ref.boundingBox === 'block' && above && above.name === 'air') {
      try {
        await bot.placeBlock(ref, new Vec3(0, 1, 0))
        return { done: true }
      } catch (e) { /* 次の候補へ */ }
    }
  }
  return { error: 'no spot to place crafting_table' }
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

// 思考中の首振り演出 ON/OFF（brain の on_thinking から呼ばれる）
app.post('/gaze', (req, res) => {
  if (!ready) return res.status(503).json({ error: 'bot not spawned yet' })
  if (req.body && req.body.scan) gazeScanStart()
  else gazeScanStop()
  res.json({ done: true, scanning: !!gazeTimer })
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
