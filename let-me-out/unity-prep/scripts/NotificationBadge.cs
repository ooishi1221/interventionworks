using UnityEngine;
using TMPro;

namespace LetMeOut.HomeScreen
{
    /// <summary>
    /// 赤バッジ。常時軽くパルスして、一定間隔でカウンター数値がランダム増減する。
    /// 「常に何か起きてる」感の核。
    /// </summary>
    public class NotificationBadge : MonoBehaviour
    {
        [Header("References")]
        [SerializeField] private TMP_Text countText;
        [SerializeField] private RectTransform pulseTarget; // 通常は this.transform

        [Header("Initial")]
        [SerializeField] private int currentCount = 1;

        [Header("Random Change")]
        [SerializeField] private float minIntervalSec = 1.5f;
        [SerializeField] private float maxIntervalSec = 5f;

        [Tooltip("増減の最小値（負で減少もあり）")]
        [SerializeField] private int minDelta = -2;

        [Tooltip("増減の最大値")]
        [SerializeField] private int maxDelta = 5;

        [Header("Pulse")]
        [SerializeField] private bool pulseEnabled = true;
        [SerializeField] private float pulseFrequency = 2.5f;
        [SerializeField] private float pulseAmplitude = 0.08f;

        [Header("Cap")]
        [SerializeField] private int displayCap = 99;

        private float nextChangeTime;
        private Vector3 baseScale;

        void Awake()
        {
            if (pulseTarget == null)
            {
                pulseTarget = transform as RectTransform;
            }
            baseScale = pulseTarget != null ? pulseTarget.localScale : Vector3.one;
        }

        void Start()
        {
            ScheduleNextChange();
            UpdateDisplay();
        }

        void Update()
        {
            if (pulseEnabled && pulseTarget != null)
            {
                float p = 1f + Mathf.Sin(Time.time * pulseFrequency * Mathf.PI * 2f) * pulseAmplitude;
                pulseTarget.localScale = baseScale * p;
            }

            if (Time.time >= nextChangeTime)
            {
                int delta = Random.Range(minDelta, maxDelta + 1);
                currentCount = Mathf.Max(1, currentCount + delta);
                UpdateDisplay();
                ScheduleNextChange();
            }
        }

        void ScheduleNextChange()
        {
            nextChangeTime = Time.time + Random.Range(minIntervalSec, maxIntervalSec);
        }

        void UpdateDisplay()
        {
            if (countText == null) return;
            countText.text = currentCount > displayCap ? $"{displayCap}+" : currentCount.ToString();
        }

        public void SetCount(int count)
        {
            currentCount = Mathf.Max(1, count);
            UpdateDisplay();
        }
    }
}
