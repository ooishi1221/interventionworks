/*
 * Voice of Becky — stackchan_bridge.ino
 * Phase B: ボタン + LCD モード表示 + Serial 通信
 *
 * ライブラリ: M5Unified
 * 対象ボード: M5Stack CoreS3 / CoreS3 SE / Basic (M5STACK-K151)
 * ボーレート: 115200
 *
 * Serial コマンド (ESP32 → Mac):
 *   MODE:0  会話モード
 *   MODE:1  聞くだけモード
 *   MODE:2  OFF モード
 *   WAKE    A 長押し（ちょっと来て）
 *   MUTE    B 短押し（黙って）
 *   MEMORY  B 長押し（いまの記憶して）
 *
 * Serial コマンド (Mac → ESP32):
 *   TTS_START  読み上げ開始（受信のみ、後フェーズで口パクに使う）
 *   TTS_STOP   読み上げ停止（受信のみ）
 */

#include <M5Unified.h>

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------
#define LONG_PRESS_MS   1000   // 長押し判定: 1000ms
#define DEBOUNCE_MS       50   // チャタリング防止

// モード定数
#define MODE_TALK   0   // 🟢 会話
#define MODE_LISTEN 1   // 🔵 聞くだけ
#define MODE_OFF    2   // ⚫ OFF

// ---------------------------------------------------------------------------
// グローバル状態
// ---------------------------------------------------------------------------
int   g_mode         = MODE_TALK;

// ボタン A
bool  a_was_pressed  = false;
long  a_press_start  = 0;
bool  a_long_fired   = false;

// ボタン B
bool  b_was_pressed  = false;
long  b_press_start  = 0;
bool  b_long_fired   = false;

// TTS 状態（後フェーズで口パクに使う）
bool  g_tts_active   = false;

// ---------------------------------------------------------------------------
// LCD 描画
// ---------------------------------------------------------------------------

// 共通: 背景塗り + 上部モードラベル
void draw_background(uint32_t bg_color, const char* label, uint32_t label_color) {
    M5.Display.fillScreen(bg_color);

    // モードラベル（左上）
    M5.Display.setTextSize(2);
    M5.Display.setTextColor(label_color, bg_color);
    M5.Display.setCursor(8, 8);
    M5.Display.print(label);
}

// 目（共通パーツ）
void draw_eyes(uint32_t eye_color, bool closed) {
    int cx = M5.Display.width() / 2;
    int cy = M5.Display.height() / 2 - 20;

    int eye_x_offset = 35;
    int eye_y = cy - 10;

    if (closed) {
        // 閉じた目: 横線
        M5.Display.drawLine(cx - eye_x_offset - 15, eye_y,
                            cx - eye_x_offset + 15, eye_y, eye_color);
        M5.Display.drawLine(cx + eye_x_offset - 15, eye_y,
                            cx + eye_x_offset + 15, eye_y, eye_color);
        // 少し太くする
        M5.Display.drawLine(cx - eye_x_offset - 15, eye_y + 1,
                            cx - eye_x_offset + 15, eye_y + 1, eye_color);
        M5.Display.drawLine(cx + eye_x_offset - 15, eye_y + 1,
                            cx + eye_x_offset + 15, eye_y + 1, eye_color);
    } else {
        // 開いた目: 塗り円
        M5.Display.fillCircle(cx - eye_x_offset, eye_y, 14, eye_color);
        M5.Display.fillCircle(cx + eye_x_offset, eye_y, 14, eye_color);
        // 瞳（黒）
        M5.Display.fillCircle(cx - eye_x_offset + 3, eye_y + 3, 6, TFT_BLACK);
        M5.Display.fillCircle(cx + eye_x_offset + 3, eye_y + 3, 6, TFT_BLACK);
    }
}

// ---- MODE 0: 🟢 会話 ----
void draw_face_talk() {
    uint32_t bg    = 0x003300;   // 深緑
    uint32_t eye_c = 0x00FF44;   // 明るい緑
    uint32_t mouth = 0x00FF44;

    draw_background(bg, "TALK", eye_c);
    draw_eyes(eye_c, false);

    // 口元: うっすら開いた弧
    int cx = M5.Display.width() / 2;
    int cy = M5.Display.height() / 2 - 20;
    int mouth_y = cy + 30;
    // 弧の代わりに単純な曲線: 3 点の折れ線で近似
    M5.Display.drawLine(cx - 20, mouth_y,     cx,      mouth_y + 6, mouth);
    M5.Display.drawLine(cx,      mouth_y + 6, cx + 20, mouth_y,     mouth);

    // 下部ヒント
    M5.Display.setTextSize(1);
    M5.Display.setTextColor(0x005500, bg);
    M5.Display.setCursor(4, M5.Display.height() - 14);
    M5.Display.print("A:mode  A-long:wake  B:mute  B-long:mem");
}

// ---- MODE 1: 🔵 聞くだけ ----
void draw_face_listen() {
    uint32_t bg    = 0x000033;   // 深青
    uint32_t eye_c = 0x4499FF;   // 明るい青

    draw_background(bg, "LISTEN", eye_c);
    draw_eyes(eye_c, false);

    // 口はなし（聞くだけ）
    // 耳マーク: 左右に半円（シンプルな弧で表現）
    int cx = M5.Display.width() / 2;
    int cy = M5.Display.height() / 2 - 20;
    // 左耳
    M5.Display.drawCircle(cx - 70, cy, 12, eye_c);
    M5.Display.fillRect(cx - 70, cy - 12, 12, 24, bg);  // 半円化
    // 右耳
    M5.Display.drawCircle(cx + 70, cy, 12, eye_c);
    M5.Display.fillRect(cx + 70 - 12, cy - 12, 12, 24, bg);  // 半円化

    M5.Display.setTextSize(1);
    M5.Display.setTextColor(0x000055, bg);
    M5.Display.setCursor(4, M5.Display.height() - 14);
    M5.Display.print("A:mode  A-long:wake  B:mute  B-long:mem");
}

// ---- MODE 2: ⚫ OFF ----
void draw_face_off() {
    uint32_t bg    = 0x111111;   // ほぼ黒
    uint32_t eye_c = 0x444444;   // グレー

    draw_background(bg, "OFF", eye_c);
    draw_eyes(eye_c, true);   // 目を閉じる

    // Zzz
    int cx = M5.Display.width() / 2;
    int cy = M5.Display.height() / 2 - 20;
    M5.Display.setTextSize(3);
    M5.Display.setTextColor(0x666666, bg);
    M5.Display.setCursor(cx + 20, cy + 20);
    M5.Display.print("Zzz");

    M5.Display.setTextSize(1);
    M5.Display.setTextColor(0x333333, bg);
    M5.Display.setCursor(4, M5.Display.height() - 14);
    M5.Display.print("A:mode  A-long:wake  B:mute  B-long:mem");
}

void redraw() {
    switch (g_mode) {
        case MODE_TALK:   draw_face_talk();   break;
        case MODE_LISTEN: draw_face_listen(); break;
        case MODE_OFF:    draw_face_off();    break;
    }
}

// ---------------------------------------------------------------------------
// モード変更
// ---------------------------------------------------------------------------
void set_mode(int new_mode) {
    g_mode = new_mode;
    Serial.print("MODE:");
    Serial.println(new_mode);
    redraw();
}

void cycle_mode() {
    int next = (g_mode + 1) % 3;
    set_mode(next);
}

// ---------------------------------------------------------------------------
// Serial コマンド受信処理 (Mac → ESP32)
// ---------------------------------------------------------------------------
void handle_serial_input() {
    if (!Serial.available()) return;

    String line = Serial.readStringUntil('\n');
    line.trim();

    if (line == "TTS_START") {
        g_tts_active = true;
        // TODO: Phase C で口パクアニメを開始
    } else if (line == "TTS_STOP") {
        g_tts_active = false;
        // TODO: Phase C で口パクアニメを停止
    }
    // 他のコマンドは今は無視
}

// ---------------------------------------------------------------------------
// ボタン処理
// ---------------------------------------------------------------------------
void handle_buttons() {
    M5.update();

    // ---- ボタン A ----
    bool a_now = M5.BtnA.isPressed();

    if (a_now && !a_was_pressed) {
        // 押し始め
        a_press_start = millis();
        a_long_fired  = false;
    }

    if (a_now && !a_long_fired) {
        if (millis() - a_press_start >= LONG_PRESS_MS) {
            // 長押し確定
            a_long_fired = true;
            Serial.println("WAKE");
        }
    }

    if (!a_now && a_was_pressed) {
        // 離した
        if (!a_long_fired && (millis() - a_press_start >= DEBOUNCE_MS)) {
            // 短押し: モード巡回
            cycle_mode();
        }
    }

    a_was_pressed = a_now;

    // ---- ボタン B ----
    bool b_now = M5.BtnB.isPressed() || M5.BtnC.isPressed();

    if (b_now && !b_was_pressed) {
        b_press_start = millis();
        b_long_fired  = false;
    }

    if (b_now && !b_long_fired) {
        if (millis() - b_press_start >= LONG_PRESS_MS) {
            b_long_fired = true;
            Serial.println("MEMORY");
        }
    }

    if (!b_now && b_was_pressed) {
        if (!b_long_fired && (millis() - b_press_start >= DEBOUNCE_MS)) {
            // 短押し: MUTE
            Serial.println("MUTE");
        }
    }

    b_was_pressed = b_now;
}

// ---------------------------------------------------------------------------
// Setup / Loop
// ---------------------------------------------------------------------------
void setup() {
    auto cfg = M5.config();
    M5.begin(cfg);

    Serial.begin(115200);
    Serial.println("BOOT");

    // 画面向き（CoreS3 / Basic で自動検出される）
    M5.Display.setRotation(1);
    M5.Display.setBrightness(128);

    redraw();
}

void loop() {
    handle_buttons();
    handle_serial_input();
    delay(10);
}
