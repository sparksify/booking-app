export default function PrivacyPolicy() {
  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <h1 style={styles.title}>Privacy Policy</h1>
        <p style={styles.meta}>BookingOS &mdash; Last updated: May 2026</p>

        <section style={styles.section}>
          <h2 style={styles.h2}>1. Overview</h2>
          <p>BookingOS ("we", "us", or "our") operates a franchise consulting scheduling and lead management platform. This Privacy Policy explains how we collect, use, and protect personal information submitted through our booking forms and Facebook Lead Ads.</p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>2. Information We Collect</h2>
          <p>We collect the following information when you submit a lead form or book a consultation:</p>
          <ul style={styles.list}>
            <li>First and last name</li>
            <li>Email address</li>
            <li>Phone number</li>
            <li>Investment level or liquid capital range</li>
            <li>Prior business ownership experience</li>
            <li>Franchise interests</li>
            <li>Appointment date and time preferences</li>
          </ul>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>3. How We Use Your Information</h2>
          <p>We use your information solely to:</p>
          <ul style={styles.list}>
            <li>Schedule and manage franchise consulting appointments</li>
            <li>Connect you with the appropriate franchise consultant</li>
            <li>Send appointment confirmations and reminders</li>
            <li>Follow up regarding franchise opportunities relevant to your interests</li>
          </ul>
          <p>We do not sell, rent, or share your personal information with third parties for marketing purposes.</p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>4. Third-Party Services</h2>
          <p>We use the following services to operate our platform:</p>
          <ul style={styles.list}>
            <li><strong>Supabase</strong> — secure database storage</li>
            <li><strong>Google Calendar</strong> — appointment scheduling</li>
            <li><strong>GoHighLevel</strong> — CRM and follow-up communications</li>
            <li><strong>Facebook</strong> — lead form collection via Facebook Lead Ads</li>
            <li><strong>Resend</strong> — transactional email delivery</li>
          </ul>
          <p>Each of these services maintains their own privacy policies and security standards.</p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>5. Data Retention</h2>
          <p>We retain your information for as long as necessary to provide our consulting services. You may request deletion of your data at any time by contacting us.</p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>6. Your Rights</h2>
          <p>You have the right to:</p>
          <ul style={styles.list}>
            <li>Access the personal information we hold about you</li>
            <li>Request correction of inaccurate information</li>
            <li>Request deletion of your information</li>
            <li>Opt out of follow-up communications at any time</li>
          </ul>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>7. Contact</h2>
          <p>For any privacy-related questions or requests, contact us at:</p>
          <p><a href="mailto:steve@sparksify.com" style={styles.link}>steve@sparksify.com</a></p>
        </section>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#F5F6F7',
    padding: '48px 24px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  container: {
    maxWidth: 720,
    margin: '0 auto',
    backgroundColor: '#fff',
    borderRadius: 8,
    border: '1px solid #D8DCE0',
    padding: '48px 56px',
  },
  title: {
    fontSize: 28,
    fontWeight: 600,
    color: '#33485E',
    margin: '0 0 8px 0',
  },
  meta: {
    fontSize: 14,
    color: '#8A9BB0',
    margin: '0 0 40px 0',
  },
  section: {
    marginBottom: 32,
  },
  h2: {
    fontSize: 18,
    fontWeight: 600,
    color: '#33485E',
    margin: '0 0 12px 0',
  },
  list: {
    paddingLeft: 20,
    margin: '8px 0',
    lineHeight: 1.8,
    color: '#4A5568',
  },
  link: {
    color: '#0077C5',
    textDecoration: 'none',
  },
};
