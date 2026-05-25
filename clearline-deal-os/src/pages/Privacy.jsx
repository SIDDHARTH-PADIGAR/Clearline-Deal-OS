import React from 'react';
import { Link } from 'react-router-dom';

export default function Privacy() {
  return (
    <div style={{ backgroundColor: '#0a0a0f', color: '#fff', minHeight: '100vh', fontFamily: '"DM Sans", sans-serif', lineHeight: 1.6 }}>
      {/* Simple Navbar */}
      <nav style={{ padding: '24px 48px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link to="/" style={{ fontFamily: '"DM Serif Display", serif', fontSize: '24px', color: '#c9a84c', textDecoration: 'none' }}>
          Deal OS
        </Link>
        <Link to="/" style={{ color: '#a0a0ab', textDecoration: 'none', fontSize: '14px' }}>Back to Home</Link>
      </nav>

      <div style={{ maxWidth: '800px', margin: '80px auto', padding: '0 40px' }}>
        <h1 style={{ fontFamily: '"DM Serif Display", serif', fontSize: '48px', marginBottom: '16px' }}>Privacy Policy</h1>
        <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '12px', color: '#c9a84c', letterSpacing: '1px', marginBottom: '64px' }}>
          LAST UPDATED: 25 MAY 2026<br/>
          OPERATED BY: DEAL OS, BENGALURU, INDIA
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '48px', color: '#a0a0ab' }}>
          
          <section>
            <h2 style={{ color: '#fff', fontSize: '20px', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px' }}>1. WHO WE ARE</h2>
            <p>
              Deal OS is operated by Deal OS, a company incorporated in India (CIN: U74999KA2026PTC123456). 
              Registered address: #35, 2nd A Cross, Ravi Hill View Layout, Ittamadu, Banashankari 3rd Stage, Bengaluru, Karnataka, India.
            </p>
            <p style={{ marginTop: '8px' }}>Contact: siddharthpadigar22@gmail.com</p>
          </section>

          <section>
            <h2 style={{ color: '#fff', fontSize: '20px', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px' }}>2. WHAT DATA WE COLLECT</h2>
            <h3 style={{ color: '#fff', fontSize: '16px', margin: '16px 0 8px' }}>a) Account Data</h3>
            <ul style={{ paddingLeft: '20px', marginBottom: '16px' }}>
              <li>Email address (required for account creation)</li>
              <li>Billing information (processed by Razorpay / Stripe — we never see or store your full card details)</li>
            </ul>

            <h3 style={{ color: '#fff', fontSize: '16px', margin: '16px 0 8px' }}>b) Document Data</h3>
            <ul style={{ paddingLeft: '20px', marginBottom: '16px' }}>
              <li>PDF files you upload (Information Memoranda, financial statements)</li>
              <li>These are processed in-memory solely to generate your analytical output and are permanently deleted upon completion of processing.</li>
              <li>We do not store, index, or retain document contents.</li>
              <li>We do not use document contents to train machine learning models.</li>
            </ul>

            <h3 style={{ color: '#fff', fontSize: '16px', margin: '16px 0 8px' }}>c) Usage Data</h3>
            <ul style={{ paddingLeft: '20px', marginBottom: '16px' }}>
              <li>We collect minimal, anonymised usage logs (e.g., number of analyses run) solely for product improvement.</li>
              <li>We do NOT use Google Analytics, Facebook Pixel, Hotjar, or any third-party behavioural tracking tools.</li>
            </ul>
          </section>

          <section>
            <h2 style={{ color: '#fff', fontSize: '20px', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px' }}>3. HOW WE USE YOUR DATA</h2>
            <p style={{ marginBottom: '16px' }}>We use your data only to:</p>
            <ul style={{ paddingLeft: '20px', marginBottom: '16px' }}>
              <li>Provide and operate the Deal OS platform</li>
              <li>Send you transactional emails (account confirmation, billing receipts)</li>
              <li>Respond to support requests</li>
              <li>Comply with legal obligations</li>
            </ul>
            <p>We do not sell your data. We do not share your data with third parties except as listed in Section 4.</p>
          </section>

          <section>
            <h2 style={{ color: '#fff', fontSize: '20px', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px' }}>4. THIRD PARTIES WE SHARE DATA WITH</h2>
            <p style={{ marginBottom: '16px' }}>We use the following sub-processors:</p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <th style={{ padding: '12px 8px', color: '#fff' }}>Processor</th>
                    <th style={{ padding: '12px 8px', color: '#fff' }}>Purpose</th>
                    <th style={{ padding: '12px 8px', color: '#fff' }}>Data Shared</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '12px 8px' }}>Razorpay / Stripe</td>
                    <td style={{ padding: '12px 8px' }}>Payment processing</td>
                    <td style={{ padding: '12px 8px' }}>Email, billing details</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '12px 8px' }}>Vercel</td>
                    <td style={{ padding: '12px 8px' }}>Infrastructure</td>
                    <td style={{ padding: '12px 8px' }}>Encrypted doc uploads</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '12px 8px' }}>Anthropic / OpenAI</td>
                    <td style={{ padding: '12px 8px' }}>Document parsing</td>
                    <td style={{ padding: '12px 8px' }}>Document contents (not retained by them)</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p style={{ marginTop: '16px' }}>All sub-processors are contractually bound to data protection standards consistent with applicable law.</p>
          </section>

          <section>
            <h2 style={{ color: '#fff', fontSize: '20px', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px' }}>5. DOCUMENT CONFIDENTIALITY</h2>
            <p style={{ marginBottom: '16px' }}>We understand that Information Memoranda contain commercially sensitive and confidential information. Our architecture is designed to reflect this:</p>
            <ul style={{ paddingLeft: '20px' }}>
              <li>Documents are processed in isolated, ephemeral compute sessions</li>
              <li>No document content is written to persistent storage</li>
              <li>No document content is used for model training or fine-tuning</li>
              <li>Sessions are terminated and memory cleared upon output generation</li>
            </ul>
          </section>

          <section>
            <h2 style={{ color: '#fff', fontSize: '20px', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px' }}>6. DATA RETENTION</h2>
            <ul style={{ paddingLeft: '20px' }}>
              <li>Account data: retained for the duration of your subscription plus 90 days after cancellation</li>
              <li>Document data: zero retention — deleted immediately post-processing</li>
              <li>Billing records: retained for 7 years as required by Indian accounting law</li>
            </ul>
          </section>

          <section>
            <h2 style={{ color: '#fff', fontSize: '20px', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px' }}>7. YOUR RIGHTS</h2>
            <p style={{ marginBottom: '16px' }}>Depending on your jurisdiction:</p>
            
            <h3 style={{ color: '#fff', fontSize: '16px', margin: '16px 0 8px' }}>UK Users (UK GDPR):</h3>
            <ul style={{ paddingLeft: '20px', marginBottom: '16px' }}>
              <li>Right to access, rectify, erase, and port your data</li>
              <li>Right to object to processing</li>
              <li>Right to lodge a complaint with the ICO (ico.org.uk)</li>
            </ul>

            <h3 style={{ color: '#fff', fontSize: '16px', margin: '16px 0 8px' }}>India Users (DPDP Act 2023):</h3>
            <ul style={{ paddingLeft: '20px', marginBottom: '16px' }}>
              <li>Right to access and correct your personal data</li>
              <li>Right to grievance redressal</li>
              <li>Right to nominate</li>
            </ul>

            <h3 style={{ color: '#fff', fontSize: '16px', margin: '16px 0 8px' }}>UAE / DIFC Users (DIFC Data Protection Law 2020):</h3>
            <ul style={{ paddingLeft: '20px', marginBottom: '16px' }}>
              <li>Right to access, rectify, restrict, and erase your data</li>
              <li>Right to data portability</li>
            </ul>

            <p style={{ marginTop: '16px' }}>To exercise any right, email: <strong>privacy@dealos.co</strong><br/>We will respond within 30 days.</p>
          </section>

          <section>
            <h2 style={{ color: '#fff', fontSize: '20px', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px' }}>8. COOKIES</h2>
            <p>We use only essential cookies required for session management and authentication. We do not use advertising, analytics, or tracking cookies.</p>
          </section>

          <section>
            <h2 style={{ color: '#fff', fontSize: '20px', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px' }}>9. SECURITY</h2>
            <p style={{ marginBottom: '16px' }}>We use industry-standard security measures including:</p>
            <ul style={{ paddingLeft: '20px' }}>
              <li>TLS 1.2+ encryption in transit</li>
              <li>Encrypted storage at rest</li>
              <li>Access controls and authentication on all infrastructure</li>
            </ul>
          </section>

          <section>
            <h2 style={{ color: '#fff', fontSize: '20px', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px' }}>10. CHANGES TO THIS POLICY</h2>
            <p>We will notify registered users by email of any material changes to this policy before they take effect.</p>
          </section>

          <section>
            <h2 style={{ color: '#fff', fontSize: '20px', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px' }}>11. CONTACT</h2>
            <p>
              For any privacy-related questions:<br/>
              Email: siddharthpadigar22@gmail.com<br/>
              Address: #35, 2nd A Cross, Ravi Hill View Layout, Ittamadu, Banashankari 3rd Stage, Bengaluru, Karnataka, India
            </p>
          </section>

        </div>
      </div>
    </div>
  );
}
