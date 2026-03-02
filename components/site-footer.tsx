import { getSiteBranding } from "@/lib/db";

export function SiteFooter() {
  const branding = getSiteBranding();

  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <p>© 2026 {branding.titleText} 项目. All rights reserved.</p>
        <div className="footer-links">
          <a href="#">RSS</a>
          <a href="#">Twitter</a>
          <a href="#">GitHub</a>
        </div>
      </div>
    </footer>
  );
}
