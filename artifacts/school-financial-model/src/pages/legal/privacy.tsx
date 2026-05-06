import { Layout } from "@/components/layout/Layout";
import { SEOHead } from "@/components/SEOHead";

export function PrivacyPolicyPage() {
  return (
    <Layout>
      <SEOHead
        title="Privacy Policy"
        description="Learn how SchoolStack Budget collects, uses, and protects your personal information and financial model data."
        path="/privacy"
      />
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated: March 15, 2026</p>

        <div className="prose prose-slate max-w-none space-y-8 text-foreground/85 leading-relaxed">
          <section>
            <h2 className="font-display text-xl font-bold text-foreground">1. Introduction</h2>
            <p>
              Building Hope Impact Fund ("we," "us," or "our") operates SchoolStack Budget ("the Service"). This Privacy Policy explains how we collect, use, store, and protect your personal information when you use the Service.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-foreground">2. Information We Collect</h2>
            <h3 className="font-display text-lg font-semibold text-foreground mt-4">Account Information</h3>
            <p>When you create an account, we collect your name, email address, and password (stored in hashed form).</p>

            <h3 className="font-display text-lg font-semibold text-foreground mt-4">Financial Model Data</h3>
            <p>
              When you use the Service, you provide school profile information, enrollment projections, revenue assumptions, staffing plans, expense estimates, and related financial data. This data is stored to allow you to save, edit, and export your models.
            </p>

            <h3 className="font-display text-lg font-semibold text-foreground mt-4">Usage Data</h3>
            <p>
              We automatically collect certain information about how you interact with the Service, including pages visited, features used, timestamps, browser type, and device information. This data is used to improve the Service and for aggregate analytics.
            </p>

            <h3 className="font-display text-lg font-semibold text-foreground mt-4">Guest Usage</h3>
            <p>
              The public underwriting wizard at <code>/underwriting</code> can be used without an account. Data entered in guest mode is stored locally in your browser (localStorage) under the key <code>guest_underwriting_model_v1</code> and is not transmitted to our servers unless you choose to run a readiness analysis or download an Excel workbook — at which point the form data is POSTed to <code>/api/public/consultant</code> or <code>/api/public/export-budget</code> respectively. We do not retain guest submissions beyond the duration of the API call. Clearing your browser storage erases your guest model permanently.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-foreground">3. How We Use Your Information</h2>
            <p>We use your information to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Provide, maintain, and improve the Service</li>
              <li>Process and store your financial models</li>
              <li>Generate consultant-grade analyses and financial projections</li>
              <li>Send you important service-related communications</li>
              <li>Monitor usage patterns to improve the Service</li>
              <li>Detect and prevent fraud or abuse</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-foreground">4. Data Sharing</h2>
            <p>We do not sell your personal information or financial model data to third parties. We may share your information only in the following circumstances:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Service Providers:</strong> With trusted third-party service providers who assist in operating the Service (e.g., hosting, database management), bound by confidentiality obligations</li>
              <li><strong>Legal Requirements:</strong> When required by law, subpoena, court order, or governmental request</li>
              <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets, with appropriate notice</li>
              <li><strong>With Your Consent:</strong> When you explicitly authorize sharing</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-foreground">5. Data Security</h2>
            <p>
              We implement industry-standard security measures to protect your data, including encrypted data transmission (TLS/SSL), hashed password storage, and access controls. However, no method of electronic transmission or storage is completely secure, and we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-foreground">6. Data Retention</h2>
            <p>
              We retain your account data and financial models for as long as your account is active. You may delete your financial models at any time through the Service. If you request account deletion, we will remove your personal data within 30 days, except as required by law or for legitimate business purposes.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-foreground">7. Your Rights</h2>
            <p>Depending on your jurisdiction, you may have the right to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Access the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Export your financial models in standard formats</li>
              <li>Object to certain data processing activities</li>
              <li>Withdraw consent where processing is based on consent</li>
            </ul>
            <p className="mt-2">
              To exercise any of these rights, contact us at{" "}
              <a href="mailto:admin@schoolstack.ai" className="text-primary hover:underline font-semibold">admin@schoolstack.ai</a>.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-foreground">8. Cookies and Local Storage</h2>
            <h3 className="font-display text-lg font-semibold text-foreground mt-4">Essential Cookies & Local Storage</h3>
            <p>
              The Service uses browser local storage and session tokens for authentication and to preserve your wizard progress. These are essential for the functioning of the Service and do not require consent.
            </p>

            <h3 className="font-display text-lg font-semibold text-foreground mt-4">Analytics Cookies</h3>
            <p>
              We use Google Analytics (GA4) to understand how visitors interact with the Service, including pages visited, session duration, and general usage patterns. Google Analytics sets cookies (such as <code className="text-sm bg-muted px-1.5 py-0.5 rounded">_ga</code> and <code className="text-sm bg-muted px-1.5 py-0.5 rounded">_ga_*</code>) to distinguish unique users and track sessions.
            </p>
            <p className="mt-2">
              Analytics cookies are <strong>only set after you provide consent</strong> via the cookie notice displayed when you first visit the site. If you decline, no analytics cookies are placed and the Service functions normally. You can change your preference at any time by clicking "Cookie Preferences" in the footer of any page, which will re-display the cookie notice.
            </p>
            <p className="mt-2">
              We configure Google Analytics with IP anonymization enabled. We do not use advertising cookies or share analytics data with third parties for marketing purposes.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-foreground">9. Children's Privacy</h2>
            <p>
              The Service is not intended for individuals under the age of 18. We do not knowingly collect personal information from children. If we become aware that we have collected data from a minor, we will take steps to delete it promptly.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-foreground">10. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of material changes by posting the updated policy on the Service and updating the "Last updated" date. Your continued use of the Service after changes constitutes acceptance of the revised policy.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-foreground">11. Contact</h2>
            <p>
              If you have questions about this Privacy Policy, please contact us at{" "}
              <a href="mailto:admin@schoolstack.ai" className="text-primary hover:underline font-semibold">admin@schoolstack.ai</a>.
            </p>
          </section>
        </div>
      </div>
    </Layout>
  );
}
