export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="colophon">
        <div>
          <div className="col-title">COLOPHON</div>
          <div className="col-content">
            MOTO-LOGOS は、都市ライダーのための<br />
            存在証明プロジェクトです。
            <span className="small">
              企画・開発・運営：株式会社ウィットワン -Wit-One-<br />
              A FIELD NOTE FOR URBAN RIDERS — VOL. 01
            </span>
          </div>
        </div>
        <div>
          <div className="col-title">CONTACT</div>
          <div className="col-content">
            <a href="mailto:hello@wit-one.co.jp">hello@wit-one.co.jp</a>
            <span className="small">取材・協業のお問い合わせ</span>
          </div>
        </div>
        <div>
          <div className="col-title">COORDINATES</div>
          <div className="col-content">
            35.6595° N<br />
            139.7004° E
            <span className="small">TOKYO, JAPAN</span>
          </div>
        </div>
      </div>
      <div className="legal">
        <span>© 株式会社ウィットワン -Wit-One-</span>
        <span>"INTERVENE IN THE WORLD."</span>
      </div>
    </footer>
  )
}
