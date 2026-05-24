using System.Collections.Generic;
using UnityEngine;

namespace LetMeOut.HomeScreen
{
    /// <summary>
    /// UI 裏側で勝手に動く戦闘背景。
    /// ダミー敵を spawn → ランダム討伐 → ヒットエフェクト発火を無限ループ。
    /// プレイヤーはホーム画面に戻ってきても「常に戦ってる」感を受ける。
    /// </summary>
    public class AutoBattleBackground : MonoBehaviour
    {
        [Header("Prefabs")]
        [SerializeField] private GameObject enemyPrefab;
        [SerializeField] private GameObject hitEffectPrefab;

        [Header("Spawn Area")]
        [Tooltip("敵が spawn される矩形（RectTransform 推奨）")]
        [SerializeField] private RectTransform spawnArea;

        [Header("Spawn Settings")]
        [SerializeField] private float spawnIntervalMin = 0.4f;
        [SerializeField] private float spawnIntervalMax = 1.2f;
        [SerializeField] private int maxConcurrentEnemies = 12;

        [Header("Auto Kill")]
        [Tooltip("毎フレーム討伐判定する確率（0.005 ≈ 200 フレームに 1 体）")]
        [Range(0f, 0.05f)]
        [SerializeField] private float perFrameKillChance = 0.008f;

        [Tooltip("敵の最大寿命（秒）")]
        [SerializeField] private float maxLifetimeSec = 8f;

        [Header("Effect Lifetime")]
        [SerializeField] private float hitEffectLifetimeSec = 1f;

        private float nextSpawnTime;
        private readonly List<TrackedEnemy> activeEnemies = new();

        struct TrackedEnemy
        {
            public GameObject obj;
            public float spawnedAt;
        }

        void Update()
        {
            HandleSpawn();
            HandleKill();
        }

        void HandleSpawn()
        {
            if (Time.time < nextSpawnTime) return;
            if (activeEnemies.Count >= maxConcurrentEnemies)
            {
                ScheduleNextSpawn();
                return;
            }
            SpawnEnemy();
            ScheduleNextSpawn();
        }

        void HandleKill()
        {
            for (int i = activeEnemies.Count - 1; i >= 0; i--)
            {
                var tracked = activeEnemies[i];
                if (tracked.obj == null)
                {
                    activeEnemies.RemoveAt(i);
                    continue;
                }

                bool reachedAge = (Time.time - tracked.spawnedAt) > maxLifetimeSec;
                bool randomKill = Random.value < perFrameKillChance;

                if (reachedAge || randomKill)
                {
                    KillEnemy(i);
                }
            }
        }

        void SpawnEnemy()
        {
            if (enemyPrefab == null || spawnArea == null) return;

            var enemy = Instantiate(enemyPrefab, spawnArea);
            var rt = enemy.transform as RectTransform;
            if (rt != null)
            {
                Vector2 pos = new Vector2(
                    Random.Range(spawnArea.rect.xMin, spawnArea.rect.xMax),
                    Random.Range(spawnArea.rect.yMin, spawnArea.rect.yMax)
                );
                rt.anchoredPosition = pos;
            }

            activeEnemies.Add(new TrackedEnemy
            {
                obj = enemy,
                spawnedAt = Time.time,
            });
        }

        void KillEnemy(int index)
        {
            var tracked = activeEnemies[index];
            if (tracked.obj != null)
            {
                if (hitEffectPrefab != null)
                {
                    var fx = Instantiate(hitEffectPrefab, tracked.obj.transform.position, Quaternion.identity, transform);
                    Destroy(fx, hitEffectLifetimeSec);
                }
                Destroy(tracked.obj);
            }
            activeEnemies.RemoveAt(index);
        }

        void ScheduleNextSpawn()
        {
            nextSpawnTime = Time.time + Random.Range(spawnIntervalMin, spawnIntervalMax);
        }
    }
}
