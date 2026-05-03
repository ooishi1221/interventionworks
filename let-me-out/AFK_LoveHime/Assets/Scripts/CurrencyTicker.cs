using UnityEngine;
using TMPro;

namespace LetMeOut.HomeScreen
{
    /// <summary>
    /// 通貨数字を Update で増やし続ける。「うわ常に動いてる」感を作る基幹コンポーネント。
    /// 桁が繰り上がるタイミングで微発光させて目を引く。
    /// </summary>
    public class CurrencyTicker : MonoBehaviour
    {
        [Header("References")]
        [SerializeField] private TMP_Text valueText;
        [SerializeField] private CanvasGroup glowGroup;

        [Header("Initial Value")]
        [SerializeField] private long currentValue = 12_847;

        [Header("Increment")]
        [Tooltip("1 秒あたりの増加量")]
        [SerializeField] private float incrementPerSecond = 17f;

        [Tooltip("増加量を sin 波で揺らがせる（リッチ感）")]
        [SerializeField] private bool wobbleIncrement = true;

        [Tooltip("揺らぎの強さ（0=なし、0.5 で ±50%）")]
        [SerializeField] private float wobbleAmplitude = 0.3f;

        [Tooltip("揺らぎ周期（Hz）")]
        [SerializeField] private float wobbleFrequency = 0.5f;

        [Header("Display Format")]
        [SerializeField] private bool useJapaneseUnits = true; // 万 / 億 表記

        private float fractionalAccumulator;
        private long lastDisplayedValue;
        private float glowFadeTimer;

        void Start()
        {
            UpdateDisplay(force: true);
        }

        void Update()
        {
            float delta = incrementPerSecond * Time.deltaTime;
            if (wobbleIncrement)
            {
                delta *= 1f + Mathf.Sin(Time.time * wobbleFrequency * Mathf.PI * 2f) * wobbleAmplitude;
            }

            fractionalAccumulator += Mathf.Max(0f, delta);
            long whole = (long)fractionalAccumulator;
            if (whole > 0)
            {
                currentValue += whole;
                fractionalAccumulator -= whole;
                UpdateDisplay();
            }

            UpdateGlow();
        }

        void UpdateDisplay(bool force = false)
        {
            if (valueText == null) return;
            if (!force && currentValue == lastDisplayedValue) return;

            // 桁繰り上がり判定（万 / 億の境界）
            bool crossedBoundary =
                (lastDisplayedValue / 10_000) != (currentValue / 10_000) ||
                (lastDisplayedValue / 100_000_000) != (currentValue / 100_000_000);

            valueText.text = FormatNumber(currentValue);
            lastDisplayedValue = currentValue;

            if (crossedBoundary && !force)
            {
                TriggerGlow();
            }
        }

        string FormatNumber(long n)
        {
            if (!useJapaneseUnits)
            {
                return n.ToString("N0");
            }

            if (n >= 100_000_000)
            {
                float oku = n / 100_000_000f;
                return $"{oku:0.00}億";
            }
            if (n >= 10_000)
            {
                float man = n / 10_000f;
                return $"{man:0.0}万";
            }
            return n.ToString("N0");
        }

        void TriggerGlow()
        {
            glowFadeTimer = 0.6f;
            if (glowGroup != null) glowGroup.alpha = 1f;
        }

        void UpdateGlow()
        {
            if (glowGroup == null) return;
            if (glowFadeTimer > 0f)
            {
                glowFadeTimer -= Time.deltaTime;
                glowGroup.alpha = Mathf.Clamp01(glowFadeTimer / 0.6f);
            }
        }

        // 外部から強制セット（例：詫び石獲得時）
        public void AddValue(long delta)
        {
            currentValue += delta;
            UpdateDisplay();
            TriggerGlow();
        }
    }
}
