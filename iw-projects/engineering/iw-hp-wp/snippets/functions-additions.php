<?php
/**
 * Intervention Works — SWELL 子テーマ functions.php 追記用スニペット
 *
 * 配置場所: 外観 → テーマファイルエディター → SWELL CHILD → functions.php
 *           （または SFTP で /wp-content/themes/swell_child/functions.php）
 *
 * 使い方: 既存の functions.php の <?php の直後 or 末尾に追記。
 *        全文置換しないこと（既存の SWELL 子テーマコードを壊す）。
 *
 * 5/27 第一弾では (1)(2) のみ有効化推奨。(3)(4) は様子見。
 */

/* ========================================================================
 * (1) WP のお節介 og:image / oEmbed の重複を抑制
 *     SWELL SEO SET と二重出力されるのを防ぐ
 * ====================================================================== */
remove_action( 'wp_head', 'wp_oembed_add_discovery_links' );
remove_action( 'wp_head', 'rest_output_link_wp_head' );
remove_action( 'wp_head', 'wp_shortlink_wp_head' );

/* ========================================================================
 * (2) 絵文字スクリプト無効化（軽量化・古い WP 残骸）
 *     SWELL は絵文字 CSS 自前で持つので不要
 * ====================================================================== */
remove_action( 'wp_head', 'print_emoji_detection_script', 7 );
remove_action( 'wp_print_styles', 'print_emoji_styles' );
remove_action( 'admin_print_scripts', 'print_emoji_detection_script' );
remove_action( 'admin_print_styles', 'print_emoji_styles' );

/* ========================================================================
 * (3) note RSS を home page で使う場合のキャッシュ強化
 *     WP Block の RSS は default 12 時間 cache、これを 1 時間に短縮
 *     ※ note 側更新を即反映したい場合のみ有効化
 * ====================================================================== */
// add_filter( 'wp_feed_cache_transient_lifetime', function() { return HOUR_IN_SECONDS; } );

/* ========================================================================
 * (4) X (Twitter) embed の遅延読み込み
 *     LCP 改善。X 埋め込みを使う場合のみ有効化
 * ====================================================================== */
// add_filter( 'embed_oembed_html', function( $html, $url ) {
//     if ( strpos( $url, 'twitter.com' ) !== false || strpos( $url, 'x.com' ) !== false ) {
//         $html = str_replace( '<iframe', '<iframe loading="lazy"', $html );
//     }
//     return $html;
// }, 10, 2 );

/* ========================================================================
 * (5) Search Console / OGP 用の追加 meta（必要時）
 *     SWELL SEO SET で足りるなら不要
 * ====================================================================== */
// add_action( 'wp_head', function() {
//     echo '<meta name="theme-color" content="#000000">' . "\n";
// });

/* ========================================================================
 * (6) note RSS が読めない問題の修正 + 診断（2026-05-08 追加）
 *
 *   症状: SWELL loos/rss ブロックで note RSS だけ
 *         「フィードに記事が見つかりませんでした」になる。
 *         WP.org RSS は同ブロックで表示成功 → サーバ outbound と
 *         SWELL は無実、SimplePie の note 互換性が真因。
 *
 *   仮説:
 *   (a) SimplePie の strip_htmltags で description が空判定される
 *   (b) タイムアウトで取得失敗（ムームーは外部 HTTPS が遅め）
 *   (c) UA で弾かれてる
 *
 *   対処: (a)(b)(c) を一気に潰す + 診断ページで結果を見る
 * ====================================================================== */

// SimplePie タイムアウト延長 + UA 設定 + sanitize 緩和
add_filter( 'wp_feed_options', function( $feed ) {
	$feed->set_timeout( 30 );
	$feed->set_useragent(
		'Mozilla/5.0 (compatible; WordPress/' . get_bloginfo( 'version' ) . '; ' . home_url() . ')'
	);
	// 重要: note の description 内 HTML が strip されると空判定される可能性
	if ( method_exists( $feed, 'strip_htmltags' ) ) {
		$feed->strip_htmltags( false );
	}
}, 10, 1 );

// 診断ページ: ツール → IW: RSS 診断
add_action( 'admin_menu', function() {
	add_management_page(
		'IW: RSS 診断',
		'IW: RSS 診断',
		'manage_options',
		'iw-rss-diag',
		'iw_rss_diag_page'
	);
});

function iw_rss_diag_page() {
	$url = isset( $_GET['url'] ) ? esc_url_raw( wp_unslash( $_GET['url'] ) ) : 'https://note.com/intervention_jp/rss';
	echo '<div class="wrap"><h1>IW: RSS 診断</h1>';
	echo '<form method="get"><input type="hidden" name="page" value="iw-rss-diag">';
	echo '<input type="url" name="url" value="' . esc_attr( $url ) . '" style="width:480px"> ';
	echo '<button class="button">テスト</button></form>';
	echo '<hr>';

	// (1) 生 HTTP fetch
	echo '<h2>1. wp_remote_get（raw HTTP）</h2>';
	$r = wp_remote_get( $url, [ 'timeout' => 30, 'redirection' => 5 ] );
	if ( is_wp_error( $r ) ) {
		echo '<pre style="background:#fee;padding:1em;color:#900">ERROR: ' . esc_html( $r->get_error_message() ) . '</pre>';
	} else {
		$code    = wp_remote_retrieve_response_code( $r );
		$headers = wp_remote_retrieve_headers( $r );
		$body    = wp_remote_retrieve_body( $r );
		$ct      = is_array( $headers ) || is_object( $headers ) ? ( $headers['content-type'] ?? '?' ) : '?';
		$ce      = is_array( $headers ) || is_object( $headers ) ? ( $headers['content-encoding'] ?? 'identity' ) : '?';
		echo '<pre style="background:#efe;padding:1em">';
		echo 'HTTP ' . esc_html( $code ) . "\n";
		echo 'Content-Type: ' . esc_html( $ct ) . "\n";
		echo 'Content-Encoding: ' . esc_html( $ce ) . "\n";
		echo 'Body size: ' . strlen( $body ) . " bytes\n";
		echo "\n--- Body head (1000 bytes) ---\n";
		echo esc_html( substr( $body, 0, 1000 ) );
		echo '</pre>';
	}

	// (2) fetch_feed (SimplePie)
	echo '<h2>2. fetch_feed（SimplePie 経由）</h2>';
	// キャッシュ無視のため直前に transient を消す
	global $wpdb;
	$wpdb->query( "DELETE FROM {$wpdb->options} WHERE option_name LIKE '%transient%feed%'" );
	$feed = fetch_feed( $url );
	if ( is_wp_error( $feed ) ) {
		echo '<pre style="background:#fee;padding:1em;color:#900">ERROR: ' . esc_html( $feed->get_error_message() ) . '</pre>';
	} else {
		$count = $feed->get_item_quantity();
		echo '<p>Item count: <strong>' . esc_html( $count ) . '</strong></p>';
		$items = $feed->get_items( 0, 5 );
		echo '<ul>';
		foreach ( $items as $item ) {
			echo '<li><strong>' . esc_html( $item->get_title() ) . '</strong> — ' . esc_html( $item->get_date( 'Y-m-d H:i' ) ) . '<br>';
			echo '<small>' . esc_html( $item->get_link() ) . '</small></li>';
		}
		echo '</ul>';
		// SimplePie のエラー
		$err = $feed->error();
		if ( $err ) {
			echo '<pre style="background:#fee;padding:1em;color:#900">SimplePie error: ' . esc_html( $err ) . '</pre>';
		}
	}

	// (3) feed transient の中身を見る（fetch 後）
	echo '<h2>3. WP transient（feed cache）の状態</h2>';
	$transients = $wpdb->get_results( "SELECT option_name, LENGTH(option_value) as len FROM {$wpdb->options} WHERE option_name LIKE '%transient%feed%'" );
	echo '<pre>';
	if ( empty( $transients ) ) {
		echo '(no feed transients)';
	} else {
		foreach ( $transients as $t ) {
			echo esc_html( $t->option_name ) . ' (' . $t->len . " bytes)\n";
		}
	}
	echo '</pre>';

	echo '</div>';
}
