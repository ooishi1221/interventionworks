<?php
/**
 * Plugin Name: IW RSS Fix & Diagnostic
 * Description: note RSS が SWELL loos/rss ブロックで取得できない問題の修正 + 診断ページ。SimplePie タイムアウト延長 / UA 設定 / strip_htmltags 緩和。診断ページは「ツール → IW: RSS 診断」。
 * Version: 1.0.0
 * Author: Andy / Intervention Works
 *
 * 配置: wp-content/mu-plugins/iw-rss-fix.php
 *      （mu-plugins フォルダが無ければロリポップ FTP で作る）
 *
 * 不要になったらこのファイルを削除するだけで全機能無効化される。
 */

defined( 'ABSPATH' ) || exit;

/* ------------------------------------------------------------------ *
 *  (1) SimplePie 動作調整 — 取得失敗の主要原因を 3 種潰す
 * ------------------------------------------------------------------ */
add_filter( 'wp_feed_options', function( $feed ) {
	// (a) ムームー系は外部 HTTPS が遅め、デフォルト 5 秒だと note では切れる
	$feed->set_timeout( 30 );

	// (b) 一部サーバーは UA 不在を弾く。WordPress 標準を明示
	$feed->set_useragent(
		'Mozilla/5.0 (compatible; WordPress/' . get_bloginfo( 'version' ) . '; ' . home_url() . ')'
	);

	// (c) note RSS は description が CDATA + リッチ HTML。
	//     SimplePie のデフォ strip_htmltags が強くて空判定される可能性
	if ( method_exists( $feed, 'strip_htmltags' ) ) {
		$feed->strip_htmltags( false );
	}
}, 10, 1 );

/* ------------------------------------------------------------------ *
 *  (2) 管理画面: ツール → IW: RSS 診断
 *      症状再発時にここで一発切り分け
 * ------------------------------------------------------------------ */
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
	$default_url = 'https://note.com/intervention_jp/rss';
	$url = isset( $_GET['url'] ) ? esc_url_raw( wp_unslash( $_GET['url'] ) ) : $default_url;
	$flush = isset( $_GET['flush'] );

	echo '<div class="wrap"><h1>IW: RSS 診断</h1>';
	echo '<form method="get" style="margin:1em 0">';
	echo '<input type="hidden" name="page" value="iw-rss-diag">';
	echo '<input type="url" name="url" value="' . esc_attr( $url ) . '" style="width:480px">&nbsp;';
	echo '<label><input type="checkbox" name="flush" value="1"' . checked( $flush, true, false ) . '> transient 全削除</label>&nbsp;';
	echo '<button class="button button-primary">テスト実行</button>';
	echo '</form>';
	echo '<hr>';

	global $wpdb;

	if ( $flush ) {
		$deleted = $wpdb->query( "DELETE FROM {$wpdb->options} WHERE option_name LIKE '%transient%feed%'" );
		echo '<div class="notice notice-info"><p>feed transient を ' . intval( $deleted ) . ' 件削除しました。</p></div>';
	}

	/* ---------- 1. raw HTTP ---------- */
	echo '<h2>1. wp_remote_get（raw HTTP）</h2>';
	$r = wp_remote_get( $url, [
		'timeout'     => 30,
		'redirection' => 5,
		'user-agent'  => 'Mozilla/5.0 (compatible; WordPress/' . get_bloginfo( 'version' ) . '; ' . home_url() . ')',
	] );
	if ( is_wp_error( $r ) ) {
		echo '<pre style="background:#fee;padding:1em;color:#900">ERROR: ' . esc_html( $r->get_error_message() ) . '</pre>';
	} else {
		$code    = wp_remote_retrieve_response_code( $r );
		$headers = wp_remote_retrieve_headers( $r );
		$body    = wp_remote_retrieve_body( $r );
		// headers は Requests_Utility_CaseInsensitiveDictionary になることがあるので getter で
		$ct = is_object( $headers ) && method_exists( $headers, 'offsetGet' ) ? ( $headers['content-type'] ?? '?' ) : ( is_array( $headers ) ? ( $headers['content-type'] ?? '?' ) : '?' );
		$ce = is_object( $headers ) && method_exists( $headers, 'offsetGet' ) ? ( $headers['content-encoding'] ?? 'identity' ) : ( is_array( $headers ) ? ( $headers['content-encoding'] ?? 'identity' ) : 'identity' );
		echo '<pre style="background:#efe;padding:1em;max-width:1000px;overflow:auto">';
		echo 'HTTP ' . esc_html( $code ) . "\n";
		echo 'Content-Type: ' . esc_html( $ct ) . "\n";
		echo 'Content-Encoding: ' . esc_html( $ce ) . "\n";
		echo 'Body size: ' . strlen( $body ) . " bytes\n\n";
		echo "--- Body head (1500 bytes) ---\n";
		echo esc_html( substr( $body, 0, 1500 ) );
		echo '</pre>';
	}

	/* ---------- 2. fetch_feed (SimplePie) ---------- */
	echo '<h2>2. fetch_feed（SimplePie 経由）</h2>';
	echo '<p style="color:#666">※ filter (1) が適用された状態で取得</p>';

	$feed = fetch_feed( $url );
	if ( is_wp_error( $feed ) ) {
		echo '<pre style="background:#fee;padding:1em;color:#900">ERROR: ' . esc_html( $feed->get_error_message() ) . '</pre>';
	} else {
		$count = $feed->get_item_quantity();
		$style = $count > 0 ? '#efe' : '#fef0f0';
		$color = $count > 0 ? '#060' : '#900';
		echo '<p style="background:' . $style . ';padding:.5em 1em;color:' . $color . '"><strong>Item count: ' . esc_html( $count ) . '</strong></p>';

		$items = $feed->get_items( 0, 5 );
		echo '<ul>';
		foreach ( $items as $item ) {
			echo '<li><strong>' . esc_html( $item->get_title() ) . '</strong> — ' . esc_html( $item->get_date( 'Y-m-d H:i' ) ) . '<br>';
			echo '<small>' . esc_html( $item->get_link() ) . '</small></li>';
		}
		echo '</ul>';

		$err = $feed->error();
		if ( $err ) {
			echo '<pre style="background:#fee;padding:1em;color:#900">SimplePie error: ' . esc_html( is_array( $err ) ? implode( ' / ', $err ) : $err ) . '</pre>';
		}
	}

	/* ---------- 3. transient 状態 ---------- */
	echo '<h2>3. WP transient（feed cache）の状態</h2>';
	$transients = $wpdb->get_results( "SELECT option_name, LENGTH(option_value) AS len FROM {$wpdb->options} WHERE option_name LIKE '%transient%feed%' ORDER BY option_name" );
	echo '<pre style="background:#f5f5f5;padding:1em">';
	if ( empty( $transients ) ) {
		echo '(no feed transients)';
	} else {
		foreach ( $transients as $t ) {
			echo esc_html( $t->option_name ) . '  (' . $t->len . " bytes)\n";
		}
	}
	echo '</pre>';

	echo '<hr><p style="color:#666;font-size:.9em">解決後はこのファイル（mu-plugins/iw-rss-fix.php）を削除すれば全機能オフ。filter (1) は残す価値あり、必要なら filter だけ別ファイルに切り出す。</p>';
	echo '</div>';
}
