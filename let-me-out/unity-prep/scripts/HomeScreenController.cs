using UnityEngine;

namespace LetMeOut.HomeScreen
{
    /// <summary>
    /// ホーム画面全体のオーケストレーション。
    /// FPS / 画面向き / BGM / デバッグ表示の起動責任を一手に引き受ける。
    /// </summary>
    public class HomeScreenController : MonoBehaviour
    {
        [Header("Display")]
        [SerializeField] private int targetFrameRate = 60;
        [SerializeField] private bool forcePortrait = true;

        [Header("Audio")]
        [SerializeField] private AudioSource bgmSource;
        [SerializeField] private AudioSource sfxAmbientSource; // 効果音の重なり用

        [Header("Subsystems")]
        [SerializeField] private AutoBattleBackground autoBattle;

        [Header("Debug")]
        [SerializeField] private bool logStartupInfo = true;

        void Awake()
        {
            Application.targetFrameRate = targetFrameRate;
            if (forcePortrait)
            {
                Screen.orientation = ScreenOrientation.Portrait;
            }
        }

        void Start()
        {
            if (bgmSource != null && !bgmSource.isPlaying)
            {
                bgmSource.Play();
            }
            if (sfxAmbientSource != null && !sfxAmbientSource.isPlaying)
            {
                sfxAmbientSource.Play();
            }

            if (logStartupInfo)
            {
                Debug.Log($"[HomeScreen] 放置恋姫 起動 / FPS:{targetFrameRate} / orient:{Screen.orientation}");
            }
        }
    }
}
