using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;

namespace LetMeOut.HomeScreen
{
    /// <summary>
    /// UI Toolkit 版 ホーム画面コントローラー。
    /// HomeScreen.uxml + HomeScreen.uss を駆動する。
    /// 通貨 Tick / バッジ pulse / ヒーロー演出 / 戦闘背景 / トースト / ティッカー / オファーローテ。
    /// </summary>
    public class HomeScreenUIController : MonoBehaviour
    {
        [Header("References")]
        [SerializeField] private UIDocument uiDocument;

        [Header("Battle BG")]
        [SerializeField] private float spawnIntervalMin = 0.15f;
        [SerializeField] private float spawnIntervalMax = 0.4f;
        [SerializeField] private int maxConcurrentEnemies = 24;

        private VisualElement root;
        private VisualElement battleBg;
        private VisualElement toastFeed;
        private Label tickerLabel;
        private Label offerEyebrow, offerTitle, offerTimer;
        private Label eventBanner;

        private readonly List<CurrencyState> currencies = new();
        private readonly List<Enemy> enemies = new();
        private readonly List<TweeningElement> tweens = new();

        private float nextSpawnTime;
        private float nextToastTime;
        private float nextOfferTime;
        private float nextBannerTime;
        private int offerIdx = 0;
        private int bannerIdx = 0;
        private float offerSeconds = 23 * 3600 + 47 * 60 + 18;
        private float bpValue = 8492371f;

        private static readonly (string eyebrow, string title)[] Offers = new[]
        {
            ("期間限定 ピックアップ", "100 連 無料 ガチャ"),
            ("初回 6 折 SALE", "神髄パック ¥980"),
            ("LR 復刻", "KAGUYA-X 召喚祭"),
            ("VIP3 昇格", "あと ¥980 で昇格"),
            ("天井 200 連", "あと 47 連で確定"),
            ("コラボ開催", "秘書・サユリ × 三国"),
        };

        private static readonly string[] Banners = new[]
        {
            "🎁 コラボイベント 開催中",
            "⚡ 7 日成長計画 解放",
            "🔥 初回 6 折 SALE 終了間近",
            "💎 累計課金 SSR 確定",
            "✨ 新規アバター追加",
            "🎉 VIP 昇格チャンス",
        };

        private static readonly string[] ToastMessages = new[]
        {
            "*Tanaka* さんがあなたに ❤ を送りました",
            "*Yuji* さんが 6 ヶ月ぶりにログインしました",
            "お詫び石 3,000 個進呈いたしました",
            "【LR 確定】KAGUYA-X が降臨しました！",
            "您の英雄が訓練中です",
            "VIP3 へのアップグレードであと ¥980",
            "羅刹姫・葵 のピックアップ確率 9% 上昇中",
            "ギルド「新緑の同盟」から加入勧誘",
            "初日配布キャラ 餅田・たま 未受取",
            "秘書・サユリ コラボガチャ開催中",
            "【凸完了】KAGUYA-X が覚醒しました",
            "【限界突破】羅刹姫・葵 が +5 になりました",
            "今日の天恵：神髄 200 個獲得",
            "【週間ランキング】47 位 → 31 位 上昇！",
        };

        class CurrencyState
        {
            public Label label;
            public double value;
            public float incPerSec;
            public float wobbleFreq = 0.5f;
            public float wobbleAmp = 0.3f;
        }

        class Enemy
        {
            public VisualElement element;
            public float spawnedAt;
            public float killAt = -1f;
        }

        class TweeningElement
        {
            public VisualElement el;
            public string toggleClass;
            public float interval;
            public float nextTime;
            public bool toggleOn;
        }

        void Start()
        {
            if (uiDocument == null)
            {
                uiDocument = GetComponent<UIDocument>();
            }
            root = uiDocument.rootVisualElement;
            if (root == null) return;

            // 通貨 8 種
            AddCurrency("currency-gold-value", 12847, 47);
            AddCurrency("currency-silver-value", 84392, 117);
            AddCurrency("currency-diamond-value", 1234, 0.8f);
            AddCurrency("currency-genpou-value", 5840, 4.2f);
            AddCurrency("currency-stone-value", 23847, 23);
            AddCurrency("currency-key-value", 47, 0.05f);
            AddCurrency("currency-shouken-value", 128, 0.3f);
            AddCurrency("currency-shinzui-value", 9847, 12.5f);

            battleBg = root.Q<VisualElement>("battle-bg");
            toastFeed = root.Q<VisualElement>("toast-feed");
            tickerLabel = root.Q<Label>("ticker");
            offerEyebrow = root.Q<Label>("offer-eyebrow");
            offerTitle = root.Q<Label>("offer-title");
            offerTimer = root.Q<Label>("offer-timer");
            eventBanner = root.Q<Label>("event-banner");

            // バッジ pulse（全 badge に対して）
            foreach (var b in root.Query<Label>(className: "badge").ToList())
            {
                var tween = new TweeningElement { el = b, toggleClass = "pulse", interval = 0.5f, toggleOn = false, nextTime = Time.time };
                tweens.Add(tween);
            }

            // Hero aura pulse
            var heroAura = root.Q<VisualElement>(className: "hero-aura");
            if (heroAura != null) tweens.Add(new TweeningElement { el = heroAura, toggleClass = "pulse", interval = 2f, toggleOn = false });

            // Hero silhouette float
            var heroSilhouette = root.Q<VisualElement>(className: "hero-silhouette");
            if (heroSilhouette != null) tweens.Add(new TweeningElement { el = heroSilhouette, toggleClass = "float", interval = 3f, toggleOn = false });

            // Hero rays rotate
            var heroRays = root.Q<VisualElement>(className: "hero-rays");
            if (heroRays != null) tweens.Add(new TweeningElement { el = heroRays, toggleClass = "rotate", interval = 6f, toggleOn = false });

            // Floating offer pulse
            var floatingOffer = root.Q<VisualElement>("floating-offer");
            if (floatingOffer != null) tweens.Add(new TweeningElement { el = floatingOffer, toggleClass = "pulse", interval = 0.6f, toggleOn = false });

            // Rainbow pillar spin
            var pillar = root.Q<VisualElement>(className: "rainbow-pillar");
            if (pillar != null) tweens.Add(new TweeningElement { el = pillar, toggleClass = "spin", interval = 2f, toggleOn = false });

            // Ticker scroll
            tweens.Add(new TweeningElement { el = tickerLabel, toggleClass = "scroll", interval = 24f, toggleOn = false });

            // Kenney sprite を各 icon にアタッチ
            ApplyIconBackgrounds();
        }

        private static readonly (string className, string resourcePath)[] IconMappings = new[]
        {
            ("icon-0", "Sprites/icons/exclamation"),
            ("icon-1", "Sprites/icons/star"),
            ("icon-2", "Sprites/icons/book_closed"),
            ("icon-3", "Sprites/icons/trophy"),
            ("icon-4", "Sprites/icons/award"),
            ("icon-10", "Sprites/icons/menuList"),
            ("icon-11", "Sprites/icons/multiplayer"),
            ("icon-12", "Sprites/icons/checkmark"),
            ("icon-13", "Sprites/icons/plus"),
            ("icon-14", "Sprites/icons/shoppingCart"),
            ("footer-icon-castle", "Sprites/icons/home"),
            ("footer-icon-sword", "Sprites/icons/bow"),
            ("footer-icon-card", "Sprites/icons/card"),
            ("footer-icon-bag", "Sprites/icons/shoppingBasket"),
            ("footer-icon-gear", "Sprites/icons/gear"),
        };

        void ApplyIconBackgrounds()
        {
            foreach (var (className, resourcePath) in IconMappings)
            {
                StyleBackground bg = default;
                bool found = false;

                var sprite = Resources.Load<Sprite>(resourcePath);
                if (sprite != null)
                {
                    bg = new StyleBackground(sprite);
                    found = true;
                }
                else
                {
                    var tex = Resources.Load<Texture2D>(resourcePath);
                    if (tex != null)
                    {
                        bg = new StyleBackground(tex);
                        found = true;
                    }
                }

                if (!found)
                {
                    Debug.LogWarning($"[Icon] NOT found in Resources: {resourcePath} (class={className})");
                    continue;
                }

                int hits = 0;
                foreach (var ve in root.Query<VisualElement>(className: className).ToList())
                {
                    ve.style.backgroundImage = bg;
                    hits++;
                }
                Debug.Log($"[Icon] OK: {resourcePath} → class={className} ({hits} elements)");
            }
        }

        void AddCurrency(string name, double initial, float incPerSec)
        {
            var label = root.Q<Label>(name);
            if (label == null) return;
            currencies.Add(new CurrencyState { label = label, value = initial, incPerSec = incPerSec });
        }

        void Update()
        {
            float now = Time.time;
            float dt = Time.deltaTime;

            // 通貨 Tick
            foreach (var c in currencies)
            {
                float wobble = 1f + Mathf.Sin(now * c.wobbleFreq * Mathf.PI * 2f) * c.wobbleAmp;
                c.value += c.incPerSec * dt * Mathf.Max(0f, wobble);
                c.label.text = FormatNumber(c.value);
            }

            // 戦闘力
            bpValue += 250f * dt;
            var bpLabel = root.Q<Label>("bp-value");
            if (bpLabel != null) bpLabel.text = ((long)bpValue).ToString("N0");

            // タイマー
            offerSeconds = Mathf.Max(0, offerSeconds - dt);
            UpdateOfferTimer();

            // オファーローテ
            if (now >= nextOfferTime)
            {
                offerIdx = (offerIdx + 1) % Offers.Length;
                if (offerEyebrow != null) offerEyebrow.text = Offers[offerIdx].eyebrow;
                if (offerTitle != null) offerTitle.text = Offers[offerIdx].title;
                nextOfferTime = now + 4f;
            }

            // バナーローテ
            if (now >= nextBannerTime)
            {
                bannerIdx = (bannerIdx + 1) % Banners.Length;
                if (eventBanner != null) eventBanner.text = Banners[bannerIdx];
                nextBannerTime = now + 2f;
            }

            // バッジ pulse / その他 transition トグル
            for (int i = 0; i < tweens.Count; i++)
            {
                var t = tweens[i];
                if (now >= t.nextTime)
                {
                    t.toggleOn = !t.toggleOn;
                    if (t.toggleOn) t.el.AddToClassList(t.toggleClass);
                    else t.el.RemoveFromClassList(t.toggleClass);
                    t.nextTime = now + t.interval;
                }
            }

            // 戦闘背景：spawn
            if (now >= nextSpawnTime && enemies.Count < maxConcurrentEnemies && battleBg != null)
            {
                SpawnEnemy(now);
                nextSpawnTime = now + Random.Range(spawnIntervalMin, spawnIntervalMax);
            }

            // 戦闘背景：discrete kill / cleanup
            for (int i = enemies.Count - 1; i >= 0; i--)
            {
                var e = enemies[i];
                if (e.killAt < 0)
                {
                    if (now - e.spawnedAt > 3f || Random.value < 0.04f * dt * 60f)
                    {
                        e.killAt = now;
                        e.element.AddToClassList("dying");
                    }
                }
                else if (now - e.killAt > 0.7f)
                {
                    e.element.RemoveFromHierarchy();
                    enemies.RemoveAt(i);
                }
            }

            // トースト
            if (now >= nextToastTime && toastFeed != null)
            {
                ShowToast(ToastMessages[Random.Range(0, ToastMessages.Length)]);
                nextToastTime = now + 1.1f;
            }
        }

        void SpawnEnemy(float now)
        {
            var el = new VisualElement();
            el.AddToClassList("enemy");
            el.style.left = Length.Percent(8 + Random.Range(0f, 84f));
            el.style.top = Length.Percent(12 + Random.Range(0f, 50f));
            battleBg.Add(el);
            enemies.Add(new Enemy { element = el, spawnedAt = now });
        }

        void ShowToast(string text)
        {
            var t = new Label(text);
            t.AddToClassList("toast");
            t.AddToClassList("entering");
            toastFeed.Add(t);

            // 1 frame 後に entering 解除（スライドイン）
            t.schedule.Execute(() => t.RemoveFromClassList("entering")).StartingIn(50);

            // 3 秒後に leaving 開始
            t.schedule.Execute(() => t.AddToClassList("leaving")).StartingIn(3000);

            // 3.4 秒後に消去
            t.schedule.Execute(() => t.RemoveFromHierarchy()).StartingIn(3400);
        }

        void UpdateOfferTimer()
        {
            if (offerTimer == null) return;
            int total = (int)offerSeconds;
            int h = total / 3600;
            int m = (total / 60) % 60;
            int s = total % 60;
            offerTimer.text = $"残り {h:00}:{m:00}:{s:00}";
        }

        string FormatNumber(double n)
        {
            // 業界擬態：万・億 表記（フォントが対応してれば表示される）
            if (n >= 100_000_000) return $"{n / 100_000_000:0.00}億";
            if (n >= 10_000) return $"{n / 10_000:0.0}万";
            return ((long)n).ToString("N0");
        }
    }
}
